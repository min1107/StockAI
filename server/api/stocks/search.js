const axios = require('axios');
const stocksDB = require('../../lib/stocksDB');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.status(200).json([]);
    }

    // 1단계: KRX 전체 종목 DB에서 검색 (DB 로딩 중이면 완료 대기)
    await stocksDB.waitReady();
    const dbResults = stocksDB.search(q);
    if (dbResults.length > 0) {
      return res.status(200).json(dbResults);
    }

    // 2단계: DB 미로딩 or 미국 주식 — Yahoo 폴백
    const results = [];

    // 미국 주식 (영문 입력 시)
    if (/^[a-zA-Z]/.test(q.trim())) {
      try {
        const yahooResp = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
          params: { q: q.trim(), quotesCount: 10, newsCount: 0 },
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 4000,
        });
        const quotes = yahooResp.data?.quotes ?? [];
        for (const quote of quotes) {
          if (!quote.symbol || !quote.shortname) continue;
          if (quote.symbol.endsWith('.KS') || quote.symbol.endsWith('.KQ')) continue;
          results.push({
            symbol: quote.symbol,
            name: quote.shortname || quote.longname,
            code: quote.symbol,
            exchange: quote.exchange || 'NASDAQ',
            type: 'EQUITY',
          });
        }
      } catch {}
    }

    res.status(200).json(results.slice(0, 20));
  } catch (error) {
    console.error('stocks/search error:', error.message);
    res.status(200).json([]);
  }
};
