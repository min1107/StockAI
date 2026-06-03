/**
 * 로컬에서 실행: KRX 전종목 JSON 생성
 * 사용법: node server/scripts/buildStockDB.js
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const fetchMarket = async (marketType, suffix, label) => {
  console.log(`📋 ${label} 로딩 중...`);
  const resp = await axios.get('https://kind.krx.co.kr/corpgeneral/corpList.do', {
    params: { method: 'download', searchType: '13', marketType },
    headers: HEADERS,
    timeout: 30000,
    responseType: 'arraybuffer',
  });
  const iconv = require('iconv-lite');
  const html = iconv.decode(Buffer.from(resp.data), 'euc-kr');
  const rows = [];
  const pattern = /<td[^>]*>\s*([^<\t\r\n]+?)\s*<\/td>\s*<td[^>]*>\s*(\d{6})\s*<\/td>/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const name = m[1].trim();
    const code = m[2].trim();
    if (name && code) rows.push({ code, name, market: label });
  }
  console.log(`  ✅ ${label}: ${rows.length}개`);
  return rows;
};

const fetchETFs = async () => {
  console.log('📋 ETF 로딩 중...');
  try {
    const resp = await axios.get('https://finance.naver.com/api/sise/etfItemList.nhn', {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.naver.com/' },
      timeout: 15000,
    });
    const list = resp.data?.result?.etfItemList || resp.data?.etfItemList || [];
    const rows = list.map(item => ({
      code: item.itemcode,
      name: item.itemname,
      market: (item.marketName === 'KOSDAQ' || item.marketGubun === 'Q') ? 'KOSDAQ' : 'KOSPI',
    }));
    console.log(`  ✅ ETF: ${rows.length}개`);
    return rows;
  } catch (e) {
    console.error('  ❌ ETF 로딩 실패:', e.message);
    return [];
  }
};

(async () => {
  try {
    const [kospi, kosdaq, konex, etfs] = await Promise.all([
      fetchMarket('stockMkt',  'KOSPI',  'KOSPI'),
      fetchMarket('kosdaqMkt', 'KOSDAQ', 'KOSDAQ'),
      fetchMarket('konexMkt',  'KOSDAQ', 'KONEX').catch(() => []),
      fetchETFs(),
    ]);

    const seen = new Set();
    const all = [...kospi, ...kosdaq, ...konex, ...etfs].filter(s => {
      if (seen.has(s.code)) return false;
      seen.add(s.code);
      return true;
    });

    const outPath = path.join(__dirname, '../data/koreanStocks.json');
    fs.writeFileSync(outPath, JSON.stringify(all, null, 2), 'utf8');
    console.log(`\n✅ 완료: 총 ${all.length}개 → server/data/koreanStocks.json`);
    console.log('다음 단계: git add server/data/koreanStocks.json && git commit -m "chore: update stock DB"');
  } catch (e) {
    console.error('❌ 실패:', e.message);
    process.exit(1);
  }
})();
