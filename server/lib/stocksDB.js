const axios = require('axios');
const path = require('path');

// 로컬 fallback JSON (서버 시작 즉시 동기 로드)
let stocksDB = [];
try {
  const fallback = require(path.join(__dirname, '../data/koreanStocks.json'));
  stocksDB = fallback.map(s => ({
    symbol: s.code + (s.market === 'KOSPI' ? '.KS' : '.KQ'),
    name: s.name,
    code: s.code,
    exchange: s.market === 'KOSPI' ? 'KSC' : 'KOE',
    type: 'EQUITY',
  }));
  console.log(`📦 fallback 종목 DB 로드: ${stocksDB.length}개`);
} catch (e) {
  console.error('fallback DB 로드 실패:', e.message);
}

let lastUpdated = null;
const UPDATE_INTERVAL = 24 * 60 * 60 * 1000;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const fetchMarket = async (marketType, suffix, exchange) => {
  const resp = await axios.get(
    'https://kind.krx.co.kr/corpgeneral/corpList.do',
    {
      params: { method: 'download', searchType: '13', marketType },
      headers: HEADERS,
      timeout: 15000,
      responseType: 'arraybuffer',
    }
  );
  const iconv = require('iconv-lite');
  const html = iconv.decode(Buffer.from(resp.data), 'euc-kr');
  const rows = [];
  const pattern = /<td[^>]*>\s*([^<\t\r\n]+?)\s*<\/td>\s*<td[^>]*>\s*(\d{6})\s*<\/td>/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const name = m[1].trim();
    const code = m[2].trim();
    if (name && code) rows.push({ symbol: code + suffix, name, code, exchange, type: 'EQUITY' });
  }
  return rows;
};

const fetchETFs = async () => {
  try {
    const resp = await axios.get('https://finance.naver.com/api/sise/etfItemList.nhn', {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.naver.com/' },
      timeout: 8000,
    });
    const list = resp.data?.result?.etfItemList || resp.data?.etfItemList || [];
    return list.map(item => {
      const isKosdaq = item.marketName === 'KOSDAQ' || item.marketGubun === 'Q';
      return {
        symbol: item.itemcode + (isKosdaq ? '.KQ' : '.KS'),
        name: item.itemname,
        code: item.itemcode,
        exchange: isKosdaq ? 'KOE' : 'KSC',
        type: 'ETF',
      };
    });
  } catch (e) {
    console.error('ETF 로딩 실패:', e.message);
    return [];
  }
};

// KRX에서 전체 종목 갱신 (백그라운드, 실패해도 fallback 유지)
const refreshDB = async () => {
  try {
    console.log('📋 KRX 전체 종목 로딩...');
    const [kospi, kosdaq, konex, etfs] = await Promise.all([
      fetchMarket('stockMkt', '.KS', 'KSC'),
      fetchMarket('kosdaqMkt', '.KQ', 'KOE'),
      fetchMarket('konexMkt', '.KQ', 'KNX').catch(() => []),
      fetchETFs(),
    ]);
    const seen = new Set();
    const all = [...kospi, ...kosdaq, ...konex, ...etfs].filter(s => {
      if (seen.has(s.code)) return false;
      seen.add(s.code);
      return true;
    });
    if (all.length > 0) {
      stocksDB = all;
      lastUpdated = Date.now();
      console.log(`✅ KRX 종목 DB 갱신: ${stocksDB.length}개`);
    }
  } catch (err) {
    console.error('KRX 종목 로딩 실패 (fallback 유지):', err.message);
  }
};

const search = (query) => {
  if (!query || stocksDB.length === 0) return [];
  const q = query.toLowerCase().trim();
  return stocksDB.filter(s =>
    s.name.toLowerCase().includes(q) || s.code.includes(q)
  ).slice(0, 20);
};

const init = () => {
  // fallback은 이미 동기 로드됨 — KRX 갱신은 백그라운드
  refreshDB();
  setInterval(() => {
    if (!lastUpdated || Date.now() - lastUpdated > UPDATE_INTERVAL) refreshDB();
  }, UPDATE_INTERVAL);
};

module.exports = { init, search, getAll: () => stocksDB };
