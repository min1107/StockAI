/**
 * koreanStocks.json 재생성 스크립트
 * KRX에서 전체 종목을 EUC-KR로 받아 UTF-8로 저장
 */

const axios = require('axios');
const iconv = require('iconv-lite');
const fs = require('fs');
const path = require('path');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function fetchMarket(marketType, market) {
  const resp = await axios.get(
    'https://kind.krx.co.kr/corpgeneral/corpList.do',
    {
      params: { method: 'download', searchType: '13', marketType },
      headers: HEADERS,
      timeout: 20000,
      responseType: 'arraybuffer',
    }
  );
  const html = iconv.decode(Buffer.from(resp.data), 'euc-kr');
  const rows = [];
  // tr 단위로 잘라서 처리 (오염 방지)
  const trPattern = /<tr>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trPattern.exec(html)) !== null) {
    const row = trMatch[1];
    // 첫 번째 <td>NAME</td> (속성 없음) → 회사명
    const nameMatch = row.match(/^[\s\S]*?<td>([^<\n\t]+?)<\/td>/i);
    // mso-number-format이 있는 <td> → 종목코드
    const codeMatch = row.match(/<td[^>]*mso-number-format[^>]*>\s*(\d{6})\s*<\/td>/i);
    if (nameMatch && codeMatch) {
      const name = nameMatch[1].trim();
      const code = codeMatch[1].trim();
      if (name && code) rows.push({ code, name, market });
    }
  }
  return rows;
}

(async () => {
  console.log('KRX 종목 수집 시작...');
  try {
    const [kospi, kosdaq] = await Promise.all([
      fetchMarket('stockMkt', 'KOSPI'),
      fetchMarket('kosdaqMkt', 'KOSDAQ'),
    ]);
    const all = [...kospi, ...kosdaq];
    const out = path.join(__dirname, '../data/koreanStocks.json');
    fs.writeFileSync(out, JSON.stringify(all, null, 2), 'utf8');
    console.log(`완료: ${all.length}개 종목 저장 → ${out}`);
    console.log('샘플:', all.slice(0, 3));
  } catch (e) {
    console.error('실패:', e.message);
    process.exit(1);
  }
})();
