/**
 * 💰 KIS 재무비율 엔드포인트 (docs/AI_ENGINE.md P1 — 정량 데이터 레이어)
 *
 * 점수 엔진의 밸류·품질·성장 팩터에 먹일 펀더멘털을 KIS 재무 API에서 가져온다.
 * 시세 API(inquire-price)는 PER·PBR·EPS·BPS만 주므로, 여기서 나머지를 채운다:
 *   - ROE(정식), 영업이익률, 순이익률, 부채비율, 유동비율
 *   - 매출 성장률, 영업이익 성장률, 순이익 성장률
 *
 * 4개 비율 + 손익계산서를 병렬 호출해 가장 최근 결산분으로 정규화한다.
 * 각 호출은 best-effort: 하나가 실패해도 나머지로 채우고, 못 채운 항목은 null.
 *
 * ⚠️ 응답 JSON 키는 KIS 공식 예제 기준으로 작성했으나 문서에 일부 미기재 →
 *    배포본에서 1회 실호출로 확정/보정할 것 (부록A 원칙). pick()이 후보키를
 *    여러 개 시도하므로 키 표기가 조금 달라도 잡힐 가능성을 높였다.
 */

const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');
const kisRequest = require('../../lib/kisRequest');

// 문자열 숫자 → number (빈 값/비정상 → null)
const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : null;
};

// 레코드에서 후보 키들을 순서대로 시도해 첫 유효 숫자를 반환
const pick = (rec, ...keys) => {
  if (!rec) return null;
  for (const k of keys) {
    const v = num(rec[k]);
    if (v !== null) return v;
  }
  return null;
};

// KIS 재무 엔드포인트 1개 호출 → output 배열 전체 반환. 실패 시 [].
async function fetchRatioArr(path, trId, code, divCode) {
  try {
    const headers = await getAuthHeaders(trId);
    const resp = await kisRequest('get', `${KIS_BASE_URL}/uapi/domestic-stock/v1/finance/${path}`, {
      headers,
      params: {
        FID_DIV_CLS_CODE: divCode,        // '0'=연간 / '1'=분기 (KIS는 대문자 키)
        fid_cond_mrkt_div_code: 'J',
        fid_input_iscd: code,
      },
    });
    const out = resp.data?.output;
    return Array.isArray(out) ? out : (out ? [out] : []);
  } catch (err) {
    console.warn(`KIS finance ${path} 실패 [${code}]:`, err.response?.status || err.message);
    return [];
  }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: '종목코드(code) 필요' });
    if (!/^[0-9]{6}$/.test(String(code).trim())) {
      // 재무는 국내주식(6자리)만 — 미국주식 등은 미제공
      return res.status(400).json({ error: '재무 데이터는 국내주식(6자리 코드)만 제공' });
    }
    // 연간/분기: 기본 연간(추세·성장률이 안정적). type=q 면 분기.
    const divCode = (req.query.type === 'q' || req.query.type === 'quarter') ? '1' : '0';

    // income-statement(FHKST66430200)는 제외: 파라미터 casing에 민감하고 99.99 더미값이 섞여 신뢰 불가.
    // 영업이익률 대신 KIS가 직접 계산해주는 순이익률(profit-ratio.sale_ntin_rate)을 마진 신호로 쓴다.
    const [finArr, profitArr, stabArr, growthArr] = await Promise.all([
      fetchRatioArr('financial-ratio', 'FHKST66430300', code, divCode),
      fetchRatioArr('profit-ratio',    'FHKST66430400', code, divCode),
      fetchRatioArr('stability-ratio', 'FHKST66430600', code, divCode),
      fetchRatioArr('growth-ratio',    'FHKST66430800', code, divCode),
    ]);

    if (!finArr.length && !profitArr.length && !stabArr.length && !growthArr.length) {
      return res.status(502).json({ error: 'KIS 재무 데이터 조회 실패 (전 항목)' });
    }

    // ⚠️ 배열은 최신순이지만 선두(arr[0])는 12월 결산이 아닌 분기/잠정(TTM) 이상치일 수 있다
    //    (예: 202603). 성장률·매출이 왜곡되므로 가장 최근 '연간 확정'(stac_yymm 이 ...12) 레코드를 고른다.
    const latestAnnual = (arr) => arr.find(r => String(r?.stac_yymm || '').endsWith('12')) || arr[0] || null;
    const finRatio = latestAnnual(finArr);
    const profit = latestAnnual(profitArr);
    const stability = latestAnnual(stabArr);
    const growth = latestAnnual(growthArr);

    const result = {
      code: String(code),
      asOf: finRatio?.stac_yymm || profit?.stac_yymm || growth?.stac_yymm || stability?.stac_yymm || null,
      period: 'annual',

      // 품질
      roe: pick(finRatio, 'roe_val', 'roe') ?? pick(profit, 'self_cptl_ntin_inrt'),
      roa: pick(profit, 'cptl_ntin_rate', 'roa'),
      netMargin: pick(profit, 'sale_ntin_rate', 'net_margin'),  // 순이익률 (영업이익률 대용 마진 신호)
      grossMargin: pick(profit, 'sale_totl_rate'),

      // 안정성
      debtRatio: pick(stability, 'lblt_rate') ?? pick(finRatio, 'lblt_rate', 'debt_rate'),
      currentRatio: pick(stability, 'crnt_rate'),
      quickRatio: pick(stability, 'quck_rate'),
      borrowDependency: pick(stability, 'bram_depn'),

      // 성장
      revenueGrowth: pick(growth, 'grs') ?? pick(finRatio, 'grs'),
      operatingProfitGrowth: pick(growth, 'bsop_prfi_inrt') ?? pick(finRatio, 'bsop_prfi_inrt'),
      earningsGrowth: pick(finRatio, 'ntin_inrt', 'bsop_prfi_inrt') ?? pick(growth, 'bsop_prfi_inrt'),
      equityGrowth: pick(growth, 'equt_inrt'),

      // 참고용 (시세API와 교차검증)
      eps: pick(finRatio, 'eps'),
      bps: pick(finRatio, 'bps'),
      reserveRatio: pick(finRatio, 'rsrv_rate'),

      _sources: {
        financialRatio: !!finRatio,
        profitRatio: !!profit,
        stabilityRatio: !!stability,
        growthRatio: !!growth,
      },
    };

    res.status(200).json(result);
  } catch (error) {
    console.error(`KIS financials error [${req.query.code}]:`, error.message);
    res.status(500).json({ error: '재무 데이터 조회 실패' });
  }
};
