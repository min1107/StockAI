const axios = require('axios');

// 전체 종목 DB (메모리 캐시)
let stocksDB = [];
let lastUpdated = null;
let loadingPromise = null;
const UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 1일

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// kind.krx.co.kr — 로그인 없이 전종목 HTML 테이블 다운로드
const fetchMarket = async (marketType, suffix, exchange) => {
  const resp = await axios.get(
    'https://kind.krx.co.kr/corpgeneral/corpList.do',
    {
      params: {
        method: 'download',
        searchType: '13',
        marketType,
      },
      headers: HEADERS,
      timeout: 15000,
      responseType: 'arraybuffer',
    }
  );

  // EUC-KR 인코딩 디코딩
  const iconv = require('iconv-lite');
  const html = iconv.decode(Buffer.from(resp.data), 'euc-kr');
  // <td>회사명</td> 바로 다음 <td>6자리코드</td> 패턴으로 직접 추출
  const rows = [];
  const pattern = /<td[^>]*>\s*([^<\t\r\n]+?)\s*<\/td>\s*<td[^>]*>\s*(\d{6})\s*<\/td>/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const name = m[1].trim();
    const code = m[2].trim();
    if (name && code) {
      rows.push({ symbol: code + suffix, name, code, exchange, type: 'EQUITY' });
    }
  }
  return rows;
};

// 네이버 금융 ETF 전체 목록
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

// 전체 종목 DB 갱신
const refreshDB = async () => {
  try {
    console.log('📋 KRX 전체 종목 로딩...');
    const [kospi, kosdaq, konex, etfs] = await Promise.all([
      fetchMarket('stockMkt', '.KS', 'KSC'),
      fetchMarket('kosdaqMkt', '.KQ', 'KOE'),
      fetchMarket('konexMkt', '.KQ', 'KNX').catch(() => []),
      fetchETFs(),
    ]);

    // 중복 제거 (코드 기준)
    const seen = new Set();
    const all = [...kospi, ...kosdaq, ...konex, ...etfs].filter(s => {
      if (seen.has(s.code)) return false;
      seen.add(s.code);
      return true;
    });

    stocksDB = all;
    lastUpdated = Date.now();
    console.log(`✅ 전체 종목 DB 완료: KOSPI ${kospi.length} + KOSDAQ ${kosdaq.length} + KONEX ${konex.length} + ETF ${etfs.length} = ${stocksDB.length}개`);
  } catch (err) {
    console.error('KRX 종목 로딩 실패:', err.message);
  }
};

// 검색
const search = (query) => {
  if (!query || stocksDB.length === 0) return [];
  const q = query.toLowerCase().trim();
  return stocksDB.filter(s =>
    s.name.toLowerCase().includes(q) || s.code.includes(q)
  ).slice(0, 20);
};

// DB 로딩 완료 대기 (최대 20초)
const waitReady = () => {
  if (stocksDB.length > 0) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  return Promise.resolve();
};

// 초기화 + 주기 갱신
const init = () => {
  loadingPromise = refreshDB().finally(() => { loadingPromise = null; });
  setInterval(() => {
    if (!lastUpdated || Date.now() - lastUpdated > UPDATE_INTERVAL) {
      loadingPromise = refreshDB().finally(() => { loadingPromise = null; });
    }
  }, UPDATE_INTERVAL);
};

module.exports = { init, search, waitReady, getAll: () => stocksDB };
