const axios = require('axios');
const stocksDB = require('../../lib/stocksDB');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.status(200).json([]);
    }

    // 1단계: KRX 전체 종목 DB에서 검색 (가장 빠르고 완전함)
    const dbResults = stocksDB.search(q);
    if (dbResults.length > 0) {
      return res.status(200).json(dbResults);
    }

    // 2단계: DB 미로딩 or 미국 주식 — 네이버 + Yahoo 폴백
    const results = [];

    try {
      const naverResp = await axios.get('https://ac.stock.naver.com/ac', {
        params: { q: q.trim(), target: 'stock,etf,index,fund,marketindicator' },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 4000,
      });
      const items = naverResp.data?.items ?? [];
      for (const item of items) {
        const code = item[0], name = item[1], market = item[2] || '';
        if (!code || !name) continue;
        const isKospi = market.includes('유가증권') || market.includes('KOSPI');
        results.push({
          symbol: code + (isKospi ? '.KS' : '.KQ'),
          name, code,
          exchange: isKospi ? 'KSC' : 'KOE',
          type: 'EQUITY',
        });
      }
    } catch {}

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
