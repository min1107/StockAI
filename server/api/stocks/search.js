const axios = require('axios');
const stocksDB = require('../../lib/stocksDB');
const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');

const kisSearch = async (q) => {
  try {
    const isCode = /^\d+$/.test(q.trim());
    const headers = await getAuthHeaders('CTPF1604R');
    const params = { PRDT_TYPE_CD: '300', PDNO: isCode ? q.trim() : '' };
    if (!isCode) params.PRDT_NAME = q.trim();

    const resp = await axios.get(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/search-stock-info`,
      { headers, params, timeout: 8000 }
    );
    const output = resp.data.output || [];
    return output
      .filter(item => item.pdno && (item.prdt_name || item.prdt_abrv_name))
      .map(item => {
        const isKospi = item.mktid === '01';
        return {
          symbol: item.pdno + (isKospi ? '.KS' : '.KQ'),
          name: item.prdt_name || item.prdt_abrv_name,
          code: item.pdno,
          exchange: isKospi ? 'KSC' : 'KOE',
          type: 'EQUITY',
        };
      })
      .slice(0, 20);
  } catch {
    return [];
  }
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let { q } = req.query;
    if (!q || String(q).trim().length === 0) return res.status(200).json([]);
    q = String(q).trim().slice(0, 50); // 길이 제한

    // 1단계: 로컬 DB (즉시 응답)
    const dbResults = stocksDB.search(q);
    if (dbResults.length >= 3) return res.status(200).json(dbResults);

    // 2단계: 로컬 결과 부족 → KIS 전종목 검색
    const kisResults = await kisSearch(q);
    if (kisResults.length > 0) {
      // 로컬 결과 + KIS 결과 합치되 중복 제거
      const seen = new Set(dbResults.map(s => s.code));
      const merged = [...dbResults, ...kisResults.filter(s => !seen.has(s.code))];
      return res.status(200).json(merged.slice(0, 20));
    }

    // 3단계: 영문 입력 → Yahoo Finance
    if (/^[a-zA-Z]/.test(q.trim())) {
      try {
        const yahooResp = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
          params: { q: q.trim(), quotesCount: 10, newsCount: 0 },
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 4000,
        });
        const quotes = (yahooResp.data?.quotes ?? [])
          .filter(qt => qt.symbol && qt.shortname && !qt.symbol.endsWith('.KS') && !qt.symbol.endsWith('.KQ'))
          .map(qt => ({
            symbol: qt.symbol,
            name: qt.shortname || qt.longname,
            code: qt.symbol,
            exchange: qt.exchange || 'NASDAQ',
            type: 'EQUITY',
          }));
        return res.status(200).json(quotes.slice(0, 20));
      } catch {}
    }

    res.status(200).json(dbResults);
  } catch (error) {
    console.error('stocks/search error:', error.message);
    res.status(200).json([]);
  }
};
