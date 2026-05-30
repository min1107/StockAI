/**
 * KRX 전종목 스크리닝 엔드포인트
 * - Vercel Cron: 매일 오전 8시 (장 시작 전)
 * - 네이버 금융 시가총액 순위에서 전체 종목 PBR/PER/가격 수집 (KIS 호출 없음)
 * - KOSPI + KOSDAQ 전체 (~2,600개) 저평가 필터 → 후보군 캐시 저장
 * - recommend.js가 이 캐시에서 AI 추천 후보를 가져감
 */

const axios = require('axios');
const iconv = require('iconv-lite');
const { setScreenCandidates } = require('../../lib/screenCache');

const NAVER_SISE = 'https://finance.naver.com/sise/sise_market_sum.nhn';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Referer': 'https://finance.naver.com/',
};

// 한 페이지 파싱: 50개 종목의 코드/이름/가격/PER/PBR 반환
function parsePage(html, market) {
  const trRe = /<tr[^>]*onmouseover[\s\S]*?<\/tr>/gi;
  const codeRe = /code=(\d{6})[^>]*>([^<]+)</;
  const numRe = /class="number">([^<]+)</g;

  const results = [];
  let tr;
  while ((tr = trRe.exec(html)) !== null) {
    const codeM = codeRe.exec(tr[0]);
    if (!codeM) continue;
    const code = codeM[1];
    const name = codeM[2].trim();

    const nums = [];
    let nm;
    const numRe2 = /class="number">([^<]+)</g;
    while ((nm = numRe2.exec(tr[0])) !== null) {
      nums.push(nm[1].replace(/,/g, '').trim());
    }

    // 컬럼 순서: [현재가, 전일비(이미지), 등락률, 액면가, 시가총액(억), 거래량, EPS, BPS, PER, PBR, 배당금, 수익률]
    const currentPrice = parseInt(nums[0]) || 0;
    const per          = parseFloat(nums[8]) || 0;
    const pbr          = parseFloat(nums[9]) || 0;
    const marketCap    = parseInt(nums[4]) || 0; // 억원

    if (!currentPrice || currentPrice <= 0) continue;

    results.push({
      code, name, market,
      currentPrice, per, pbr, marketCap,
      symbol: code + (market === 'KOSPI' ? '.KS' : '.KQ'),
    });
  }
  return results;
}

async function fetchPage(sosok, page, market) {
  const res = await axios.get(NAVER_SISE, {
    params: { sosok, page },
    headers: HEADERS,
    responseType: 'arraybuffer',
    timeout: 10000,
  });
  const html = iconv.decode(Buffer.from(res.data), 'euc-kr');
  return parsePage(html, market);
}

async function getLastPage(sosok) {
  const res = await axios.get(NAVER_SISE, {
    params: { sosok, page: 1 },
    headers: HEADERS,
    responseType: 'arraybuffer',
    timeout: 10000,
  });
  const html = iconv.decode(Buffer.from(res.data), 'euc-kr');
  const m = html.match(/pgRR[^>]*>[\s\S]*?page=(\d+)/);
  return m ? parseInt(m[1]) : 20;
}

async function fetchAllStocks() {
  const [kospiPages, kosdaqPages] = await Promise.all([
    getLastPage(0),
    getLastPage(1),
  ]);

  console.log(`📋 KOSPI ${kospiPages}페이지 + KOSDAQ ${kosdaqPages}페이지 수집 시작...`);

  // 모든 페이지 병렬 요청
  const requests = [];
  for (let p = 1; p <= kospiPages; p++) requests.push({ sosok: 0, page: p, market: 'KOSPI' });
  for (let p = 1; p <= kosdaqPages; p++) requests.push({ sosok: 1, page: p, market: 'KOSDAQ' });

  // 10개씩 배치 (네이버 서버 부하 방지)
  const all = [];
  const batchSize = 10;
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(r => fetchPage(r.sosok, r.page, r.market))
    );
    for (const r of settled) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }
    if (i + batchSize < requests.length) await new Promise(r => setTimeout(r, 200));
  }

  // 코드 중복 제거
  const seen = new Set();
  return all.filter(s => {
    if (seen.has(s.code)) return false;
    seen.add(s.code);
    return true;
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔍 KRX 전종목 스크리닝 시작 (네이버 금융 Bulk)...');

    const allStocks = await fetchAllStocks();
    console.log(`✅ 전체 수집: ${allStocks.length}개 종목`);

    // 저평가 필터
    // PBR: 0 초과 ~ 2.0 이하 (우선선호 기준)
    // PER: 0 초과 ~ 25 이하 (적자 제외)
    const applyFilter = (pbrMax, perMax) =>
      allStocks.filter(s =>
        s.pbr > 0 && s.pbr <= pbrMax &&
        s.per > 0 && s.per <= perMax
      );

    let candidates = applyFilter(2.0, 25);
    if (candidates.length < 15) candidates = applyFilter(2.5, 35);
    if (candidates.length < 15) candidates = applyFilter(3.5, 50);

    // PBR 낮은 순 정렬
    candidates.sort((a, b) => a.pbr - b.pbr);

    // 상위 30개 캐시 (KOSPI/KOSDAQ 골고루)
    const kospiTop = candidates.filter(s => s.market === 'KOSPI').slice(0, 15);
    const kosdaqTop = candidates.filter(s => s.market === 'KOSDAQ').slice(0, 15);
    const top30 = [...kospiTop, ...kosdaqTop].sort((a, b) => a.pbr - b.pbr);

    await setScreenCandidates({
      candidates: top30,
      totalScanned: allStocks.length,
      filteredCount: candidates.length,
      universeSize: allStocks.length,
    });

    console.log(`🎯 스크리닝 결과: 전체 ${allStocks.length}개 → 저평가 ${candidates.length}개 → 상위 ${top30.length}개 캐시`);

    if (res) res.status(200).json({
      ok: true,
      totalScanned: allStocks.length,
      filteredCount: candidates.length,
      candidateCount: top30.length,
      top5: top30.slice(0, 5).map(s => `${s.name}(PBR:${s.pbr}/PER:${s.per})`),
      screenedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ 스크리닝 실패:', error.message);
    if (res) res.status(500).json({ error: error.message });
  }
};
