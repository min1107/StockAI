/**
 * 로컬에서 실행: Naver Finance PBR/PER 기반 저평가 종목 후보 생성
 * 사용법: node server/scripts/buildScreenDB.js
 */
const axios = require('axios');
const iconv = require('iconv-lite');
const fs = require('fs');
const path = require('path');

const NAVER_SISE = 'https://finance.naver.com/sise/sise_market_sum.nhn';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Referer': 'https://finance.naver.com/',
};

function parsePage(html, market) {
  const trRe = /<tr[^>]*onmouseover[\s\S]*?<\/tr>/gi;
  const codeRe = /code=(\d{6})[^>]*>([^<]+)</;
  const results = [];
  let tr;
  while ((tr = trRe.exec(html)) !== null) {
    const codeM = codeRe.exec(tr[0]);
    if (!codeM) continue;
    const code = codeM[1];
    const name = codeM[2].trim();
    const nums = [];
    const numRe = /class="number">([^<]+)</g;
    let nm;
    while ((nm = numRe.exec(tr[0])) !== null) {
      nums.push(nm[1].replace(/,/g, '').trim());
    }
    const currentPrice = parseInt(nums[0]) || 0;
    const per          = parseFloat(nums[8]) || 0;
    const pbr          = parseFloat(nums[9]) || 0;
    const marketCap    = parseInt(nums[4]) || 0;
    if (!currentPrice || currentPrice <= 0) continue;
    results.push({ code, name, market, currentPrice, per, pbr, marketCap,
      symbol: code + (market === 'KOSPI' ? '.KS' : '.KQ') });
  }
  return results;
}

async function fetchPage(sosok, page, market) {
  const res = await axios.get(NAVER_SISE, {
    params: { sosok, page },
    headers: HEADERS,
    responseType: 'arraybuffer',
    timeout: 15000,
  });
  return parsePage(iconv.decode(Buffer.from(res.data), 'euc-kr'), market);
}

async function getLastPage(sosok) {
  const res = await axios.get(NAVER_SISE, {
    params: { sosok, page: 1 },
    headers: HEADERS,
    responseType: 'arraybuffer',
    timeout: 15000,
  });
  const html = iconv.decode(Buffer.from(res.data), 'euc-kr');
  const m = html.match(/pgRR[^>]*>[\s\S]*?page=(\d+)/);
  return m ? parseInt(m[1]) : 20;
}

(async () => {
  console.log('📋 Naver Finance 전종목 PBR/PER 수집 중...');
  const [kospiPages, kosdaqPages] = await Promise.all([getLastPage(0), getLastPage(1)]);
  console.log(`  KOSPI ${kospiPages}페이지 + KOSDAQ ${kosdaqPages}페이지`);

  const requests = [];
  for (let p = 1; p <= kospiPages; p++) requests.push({ sosok: 0, page: p, market: 'KOSPI' });
  for (let p = 1; p <= kosdaqPages; p++) requests.push({ sosok: 1, page: p, market: 'KOSDAQ' });

  const all = [];
  const batchSize = 10;
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(r => fetchPage(r.sosok, r.page, r.market)));
    for (const r of settled) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }
    if (i + batchSize < requests.length) await new Promise(r => setTimeout(r, 300));
    process.stdout.write(`\r  진행: ${Math.min(i + batchSize, requests.length)}/${requests.length} 페이지`);
  }
  console.log(`\n  ✅ 수집 완료: ${all.length}개`);

  // 중복 제거
  const seen = new Set();
  const unique = all.filter(s => { if (seen.has(s.code)) return false; seen.add(s.code); return true; });

  // 저평가 필터: PBR 0 < x ≤ 2.0, PER 0 < x ≤ 25
  const filter = (pbrMax, perMax) =>
    unique.filter(s => s.pbr > 0 && s.pbr <= pbrMax && s.per > 0 && s.per <= perMax);

  let candidates = filter(2.0, 25);
  if (candidates.length < 30) candidates = filter(2.5, 35);
  if (candidates.length < 30) candidates = filter(3.5, 50);

  // PBR 낮은 순 정렬
  candidates.sort((a, b) => a.pbr - b.pbr);

  // KOSPI / KOSDAQ 균형 상위 100개 (AI가 선택할 수 있도록 넉넉하게)
  const kospiTop = candidates.filter(s => s.market === 'KOSPI').slice(0, 50);
  const kosdaqTop = candidates.filter(s => s.market === 'KOSDAQ').slice(0, 50);
  const top100 = [...kospiTop, ...kosdaqTop].sort((a, b) => a.pbr - b.pbr);

  const out = {
    candidates: top100,
    totalScanned: unique.length,
    filteredCount: candidates.length,
    universeSize: unique.length,
    screenedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, '../data/screenCandidates.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

  console.log(`\n✅ 완료: 전체 ${unique.length}개 → 저평가 ${candidates.length}개 → 상위 ${top100.length}개`);
  console.log(`   KOSPI ${kospiTop.length}개 / KOSDAQ ${kosdaqTop.length}개`);
  console.log(`   상위 5개: ${top100.slice(0, 5).map(s => `${s.name}(PBR:${s.pbr})`).join(', ')}`);
  console.log('   저장: server/data/screenCandidates.json');
})();
