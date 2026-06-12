/**
 * 시장 수급 수집 엔드포인트
 * - Vercel Cron: 30분마다 자동 호출
 * - KIS API로 주요 종목 수급 사전 수집 → Redis 캐시
 * - AI 분석 시 "오늘 기관/외국인이 집중 매수한 종목" 정보 제공
 */

const axios = require('axios');
const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');
const kisRequest = require('../../lib/kisRequest');
const { setSupply } = require('../../lib/supplyCache');

// 수급 추적 대상: 시장 대표 대형주 + 추천풀 주요 중소형 강소기업
const WATCH_LIST = [
  // 대형주 (시장 방향 파악용)
  { code: '005930', name: '삼성전자' },
  { code: '000660', name: 'SK하이닉스' },
  { code: '005380', name: '현대차' },
  { code: '000270', name: '기아' },
  { code: '068270', name: '셀트리온' },
  { code: '005490', name: 'POSCO홀딩스' },
  { code: '035420', name: 'NAVER' },
  { code: '105560', name: 'KB금융' },
  // 방산/조선 (수급 이상 잦음)
  { code: '012450', name: '한화에어로스페이스' },
  { code: '329180', name: 'HD현대중공업' },
  { code: '010140', name: '삼성중공업' },
  { code: '079550', name: 'LIG넥스원' },
  // 반도체 소부장 (추천풀 핵심)
  { code: '042700', name: '한미반도체' },
  { code: '058470', name: '리노공업' },
  { code: '140860', name: '파크시스템스' },
  { code: '098460', name: '고영' },
  // 바이오/의료
  { code: '196170', name: '알테오젠' },
  { code: '214150', name: '클래시스' },
  { code: '128940', name: '한미약품' },
  // 2차전지
  { code: '006400', name: '삼성SDI' },
  { code: '247540', name: '에코프로비엠' },
  // 화장품/K뷰티
  { code: '192820', name: '코스맥스' },
  { code: '257720', name: '실리콘투' },
  // 엔터/게임
  { code: '352820', name: '하이브' },
  { code: '259960', name: '크래프톤' },
  // 로봇/AI
  { code: '277810', name: '레인보우로보틱스' },
  // 금융
  { code: '138040', name: '메리츠금융지주' },
  // 식품 (방어주 수급 관찰)
  { code: '271560', name: '오리온' },
  // 철강/소재
  { code: '010130', name: '고려아연' },
  { code: '298050', name: '효성첨단소재' },
];

async function fetchInvestor(code) {
  const headers = await getAuthHeaders('FHKST01010900');
  const response = await kisRequest('get',
    `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-investor`,
    {
      headers,
      params: {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: code,
      },
    }
  );
  const output = response.data.output || response.data.output1;
  const items = Array.isArray(output) ? output : output ? [output] : [];
  const valid = items.filter(i => i.orgn_ntby_tr_pbmn !== '' && i.orgn_ntby_tr_pbmn !== undefined);
  if (valid.length === 0) return null;

  const toEok = v => parseFloat(v || 0) / 100;
  const d0 = valid[0];
  return {
    code,
    dailyInst:    toEok(d0.orgn_ntby_tr_pbmn),
    dailyForeign: toEok(d0.frgn_ntby_tr_pbmn),
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Cron 보안(fail-closed): 실제 HTTP 요청(res 존재)일 때만 검사. CRON_SECRET 미설정 시에도 무조건 차단.
  // 내부 함수 호출(res=null)은 통과시켜 macro/context 등의 내부 트리거가 깨지지 않게 함.
  if (res && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('📊 시장 수급 수집 시작...');

    const results = [];
    // 5개씩 배치 처리 (KIS API rate limit 고려)
    for (let i = 0; i < WATCH_LIST.length; i += 5) {
      const batch = WATCH_LIST.slice(i, i + 5);
      const settled = await Promise.allSettled(batch.map(s => fetchInvestor(s.code)));
      for (let j = 0; j < settled.length; j++) {
        if (settled[j].status === 'fulfilled' && settled[j].value) {
          results.push({ ...WATCH_LIST[i + j], ...settled[j].value });
        }
      }
      if (i + 5 < WATCH_LIST.length) await new Promise(r => setTimeout(r, 300));
    }

    // 기관 순매수 상위 / 외국인 순매수 상위 각 5개 추출
    const byInst    = [...results].sort((a, b) => b.dailyInst - a.dailyInst);
    const byForeign = [...results].sort((a, b) => b.dailyForeign - a.dailyForeign);

    const totalInst    = results.reduce((s, r) => s + r.dailyInst, 0);
    const totalForeign = results.reduce((s, r) => s + r.dailyForeign, 0);

    const payload = {
      topInstBuy:    byInst.filter(r => r.dailyInst > 0).slice(0, 5),
      topInstSell:   byInst.filter(r => r.dailyInst < 0).slice(-5).reverse(),
      topForeignBuy: byForeign.filter(r => r.dailyForeign > 0).slice(0, 5),
      topForeignSell:byForeign.filter(r => r.dailyForeign < 0).slice(-5).reverse(),
      totalInst:     parseFloat(totalInst.toFixed(0)),
      totalForeign:  parseFloat(totalForeign.toFixed(0)),
      sampledCount:  results.length,
    };

    await setSupply(payload);

    console.log(`✅ 수급 수집 완료: ${results.length}개 종목 / 기관합계 ${totalInst.toFixed(0)}억 / 외국인합계 ${totalForeign.toFixed(0)}억`);

    if (res) res.status(200).json({ ok: true, ...payload, collectedAt: new Date().toISOString() });
  } catch (error) {
    console.error('❌ 수급 수집 실패:', error.message);
    if (res) res.status(500).json({ error: error.message });
  }
};
