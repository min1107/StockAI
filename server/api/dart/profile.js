/**
 * 🏢 DART 기업 프로필 (P3-b — 정성 평가용 정형 사실)
 *
 * 6자리 종목코드 → corp_code 매핑 후 DART에서 가져온다:
 *   - 기업개황(company.json): 설립일(업력)·상장시장·대표이사·결산월
 *   - 배당(alotMatter.json): 현금배당성향·시가배당률 (주주환원 단서)
 *
 * 이 사실들은 score.js의 정성 평가 프롬프트에 "DART 근거 자료"로 들어가
 * AI가 해자·지속성을 판단할 때 인용한다(환각 차단). 국내주식만.
 */

const axios = require('axios');
const { getCorpCode } = require('../../lib/dartCorpCode');

const DART = 'https://opendart.fss.or.kr/api';
const MARKET = { Y: '유가증권(KOSPI)', K: '코스닥', N: '코넥스', E: '기타' };

const num = (v) => {
  if (v === undefined || v === null) return null;
  const n = parseFloat(String(v).replace(/[,\s]/g, ''));
  return isFinite(n) ? n : null;
};

// 배당 항목(se 문자열)에서 당기(thstrm) 값 찾기
function findDividend(list, ...keywords) {
  if (!Array.isArray(list)) return null;
  const row = list.find(r => keywords.some(k => String(r.se || '').includes(k)));
  return row ? num(row.thstrm) : null;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: '종목코드(code) 필요' });
    const stock = String(code).split('.')[0];
    if (!/^\d{6}$/.test(stock)) {
      return res.status(400).json({ error: 'DART는 국내주식(6자리 코드)만 제공' });
    }

    const key = process.env.DART_API_KEY;
    if (!key) return res.status(503).json({ error: 'DART 미설정' });

    const corpCode = await getCorpCode(stock);
    if (!corpCode) return res.status(404).json({ error: 'corp_code 매핑 실패 (비상장/미등록)' });

    // 기업개황
    const company = await axios.get(`${DART}/company.json`, {
      params: { crtfc_key: key, corp_code: corpCode }, timeout: 12000,
    }).then(r => r.data).catch(() => null);

    // 배당: 최신 사업보고서(11011) 기준, 올해→작년 순으로 시도
    let dividend = null, dividendYear = null;
    const thisYear = new Date().getFullYear();
    for (const y of [thisYear - 1, thisYear - 2]) {
      const d = await axios.get(`${DART}/alotMatter.json`, {
        params: { crtfc_key: key, corp_code: corpCode, bsns_year: String(y), reprt_code: '11011' },
        timeout: 12000,
      }).then(r => r.data).catch(() => null);
      if (d && d.status === '000' && Array.isArray(d.list) && d.list.length) {
        dividend = {
          payoutRatio: findDividend(d.list, '현금배당성향'),
          yieldRate: findDividend(d.list, '현금배당수익률', '시가배당'),
          perShare: findDividend(d.list, '주당 현금배당금', '주당현금배당금'),
        };
        dividendYear = y;
        break;
      }
    }

    if (!company || company.status !== '000') {
      return res.status(502).json({ error: 'DART 기업개황 조회 실패', corpCode });
    }

    const estDt = company.est_dt && /^\d{8}$/.test(company.est_dt) ? company.est_dt : null;
    const estYear = estDt ? parseInt(estDt.slice(0, 4)) : null;

    res.status(200).json({
      code: stock,
      corpCode,
      corpName: company.corp_name || null,
      established: estDt ? `${estDt.slice(0,4)}-${estDt.slice(4,6)}-${estDt.slice(6,8)}` : null,
      ageYears: estYear ? thisYear - estYear : null,
      market: MARKET[company.corp_cls] || company.corp_cls || null,
      ceo: company.ceo_nm || null,
      settleMonth: company.acc_mt || null,
      dividend: dividend && (dividend.payoutRatio !== null || dividend.yieldRate !== null)
        ? { ...dividend, year: dividendYear }
        : null,
    });
  } catch (error) {
    console.error(`DART profile error [${req.query.code}]:`, error.message);
    res.status(500).json({ error: 'DART 프로필 조회 실패' });
  }
};
