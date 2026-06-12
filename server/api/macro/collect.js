/**
 * 거시경제 데이터 수집 엔드포인트
 * - Vercel Cron: 15분마다 자동 호출
 * - 로컬: 서버 시작 시 + 수동 호출 가능
 *
 * 수집 항목:
 *   환율 (USD/KRW), WTI 유가, 금, S&P500 선물, NASDAQ 선물, KOSPI
 */

const axios = require('axios');
const { setMacro } = require('../../lib/macroCache');

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

async function fetchYahoo(symbol) {
  const res = await axios.get(`${YF_BASE}/${symbol}`, {
    params: { interval: '1d', range: '2d' },
    timeout: 8000,
  });
  const meta = res.data?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`${symbol} 데이터 없음`);
  const price = meta.regularMarketPrice;
  const prev  = meta.previousClose || meta.chartPreviousClose;
  const change     = price - prev;
  const changePct  = prev > 0 ? ((change / prev) * 100) : 0;
  return { price, change: parseFloat(change.toFixed(4)), changePct: parseFloat(changePct.toFixed(2)) };
}

async function fetchExchangeRate() {
  // Yahoo Finance로 USD/KRW 조회 (서버 환경에서 안정적)
  const data = await fetchYahoo('USDKRW=X');
  if (!data?.price) throw new Error('환율 데이터 없음');
  return data.price;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Vercel Cron 인증 (fail-closed): 실제 HTTP 요청(res 존재)일 때만 검사. CRON_SECRET 미설정 시에도 차단.
  // macro/context가 내부에서 collect(req, null) 호출하므로 res=null은 통과시킴.
  if (res && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🌍 거시경제 데이터 수집 시작...');

    const [
      usdKrwResult,
      wtiResult,
      goldResult,
      spFutResult,
      nqFutResult,
    ] = await Promise.allSettled([
      fetchExchangeRate(),
      fetchYahoo('CL=F'),   // WTI 원유
      fetchYahoo('GC=F'),   // 금
      fetchYahoo('ES=F'),   // S&P500 선물
      fetchYahoo('NQ=F'),   // NASDAQ 선물
    ]);

    const macro = {
      usdKrw: usdKrwResult.status === 'fulfilled' ? usdKrwResult.value : null,
      wti: wtiResult.status === 'fulfilled' ? wtiResult.value : null,
      gold: goldResult.status === 'fulfilled' ? goldResult.value : null,
      spFutures: spFutResult.status === 'fulfilled' ? spFutResult.value : null,
      nqFutures: nqFutResult.status === 'fulfilled' ? nqFutResult.value : null,
    };

    await setMacro(macro);

    console.log('✅ 거시경제 수집 완료:', {
      'USD/KRW': typeof macro.usdKrw === 'number' ? macro.usdKrw : macro.usdKrw?.price,
      'WTI': macro.wti?.price,
      '금': macro.gold?.price,
      'S&P선물': macro.spFutures?.price,
      'NQ선물': macro.nqFutures?.price,
    });

    if (res) res.status(200).json({ ok: true, macro, collectedAt: new Date().toISOString() });
  } catch (error) {
    console.error('❌ 거시경제 수집 실패:', error.message);
    if (res) res.status(500).json({ error: error.message });
  }
};
