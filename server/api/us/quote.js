/**
 * 미국 주식 현재가 프록시 (Yahoo Finance)
 * - 브라우저(PWA)에서 직접 야후 호출 시 CORS 막힘 → 서버 경유
 * GET /api/us/quote?symbol=AAPL
 */

const axios = require('axios');

const YF = 'https://query1.finance.yahoo.com/v8/finance/chart';

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) return res.status(400).json({ error: '잘못된 티커 형식' });

  try {
    const r = await axios.get(`${YF}/${symbol}`, {
      params: { interval: '1d', range: '1mo' },
      timeout: 10000,
    });
    const meta = r.data?.chart?.result?.[0]?.meta;
    if (!meta || meta.regularMarketPrice == null) {
      return res.status(404).json({ error: 'no data' });
    }
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose || meta.chartPreviousClose || price;
    res.status(200).json({
      symbol: meta.symbol || symbol,
      currentPrice: price,
      change: price - prev,
      changeRate: prev > 0 ? ((price - prev) / prev) * 100 : 0,
      open: meta.regularMarketOpen ?? null,
      high: meta.regularMarketDayHigh ?? null,
      low: meta.regularMarketDayLow ?? null,
      volume: meta.regularMarketVolume ?? null,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      currency: meta.currency || 'USD',
    });
  } catch (e) {
    console.error('❌ US quote 실패:', symbol, e.message);
    res.status(500).json({ error: e.message });
  }
};
