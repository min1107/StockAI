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

// 수급 추적 대상: 시장 대표 + 수급 이상 자주 발생하는 종목
const WATCH_LIST = [
  { code: '005930', name: '삼성전자' },
  { code: '000660', name: 'SK하이닉스' },
  { code: '005380', name: '현대차' },
  { code: '000270', name: '기아' },
  { code: '012450', name: '한화에어로스페이스' },
  { code: '329180', name: 'HD현대중공업' },
  { code: '006400', name: '삼성SDI' },
  { code: '051910', name: 'LG화학' },
  { code: '196170', name: '알테오젠' },
  { code: '068270', name: '셀트리온' },
  { code: '042700', name: '한미반도체' },
  { code: '247540', name: '에코프로비엠' },
  { code: '005490', name: 'POSCO홀딩스' },
  { code: '010140', name: '삼성중공업' },
  { code: '352820', name: '하이브' },
  { code: '035420', name: 'NAVER' },
  { code: '105560', name: 'KB금융' },
  { code: '259960', name: '크래프톤' },
  { code: '192820', name: '코스맥스' },
  { code: '277810', name: '레인보우로보틱스' },
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

  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
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
