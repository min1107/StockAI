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
const { setUniverseDistribution } = require('../../lib/universeCache');

const NAVER_SISE = 'https://finance.naver.com/sise/sise_market_sum.nhn';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Referer': 'https://finance.naver.com/',
};

// 한 페이지 파싱: 50개 종목의 코드/이름/가격/PER/ROE/시총 반환
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

    // 네이버 기본 컬럼(number 셀 순서): [0]현재가 [1]전일비(img) [2]등락률 [3]액면가
    //   [4]시가총액(억) [5]상장주식수 [6]외국인비율 [7]거래량 [8]PER [9]ROE
    //   ⚠️ 기본 화면엔 PBR/EPS/BPS 컬럼 없음. PBR은 recommend.js가 KIS로 보강.
    const currentPrice = parseInt(nums[0]) || 0;
    const perRaw       = parseFloat(nums[8]) || 0;
    const roeRaw       = parseFloat(nums[9]) || 0;
    const marketCap    = parseInt(nums[4]) || 0; // 억원

    if (!currentPrice || currentPrice <= 0) continue;

    // sanity: 명백한 비정상 범위는 0 처리(필터가 걸러냄) → 분포·파싱률 오염 방지
    const per = (perRaw > 0 && perRaw <= 2000) ? perRaw : 0;
    const roe = (roeRaw >= -200 && roeRaw <= 1000) ? roeRaw : 0; // ROE는 음수 가능(적자)

    results.push({
      code, name, market,
      currentPrice, per, roe, marketCap,
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

  // Cron 보안(fail-closed): 실제 HTTP 요청(res 존재)일 때만 검사. CRON_SECRET 미설정 시에도 차단. 내부 호출(res=null)은 통과.
  if (res && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔍 KRX 전종목 스크리닝 시작 (네이버 금융 Bulk)...');

    const allStocks = await fetchAllStocks();
    console.log(`✅ 전체 수집: ${allStocks.length}개 종목`);

    // 🆕 검증 게이트(B-1): 데이터 건전성 미달이면 캐시를 덮어쓰지 않고 last-good 유지
    const validRate = allStocks.length
      ? allStocks.filter(s => s.per > 0 && s.roe > 0).length / allStocks.length
      : 0;
    const dataReasons = [];
    if (allStocks.length < 2000) dataReasons.push('universe_too_small'); // 정상이면 ~2,600개
    if (validRate < 0.20) dataReasons.push('parse_rate_low');            // PER/ROE 파싱률 급락 = 컬럼 밀림 의심
    if (dataReasons.length > 0) {
      console.warn(`⚠️ 스크리닝 검증 실패 → 캐시 미갱신(last-good 유지): ${dataReasons.join(', ')} (수집 ${allStocks.length}개, 파싱률 ${(validRate * 100).toFixed(0)}%)`);
      if (res) return res.status(200).json({
        ok: false,
        health: 'degraded',
        reasons: dataReasons,
        totalScanned: allStocks.length,
        parseRate: Number(validRate.toFixed(3)),
      });
      return;
    }

    // 🆕 이상치 가드: 명백한 비정상치(컬럼밀림 가짜값·초소형 부실주) 배제
    //  - PER < 2  : 정상기업엔 거의 없는 값 → 데이터 이상치로 간주
    //  - ROE > 80%: 비지속/이상치(예: 일정실업 130%) 컷
    //  - 시총 < 500억: 초소형 잡주 컷 (중소형 강소기업은 보존)
    const PER_MIN = 2;
    const ROE_MAX = 80;
    const MCAP_MIN = 500; // 억원
    const isSaneValue = (s) => s.per >= PER_MIN && s.roe <= ROE_MAX; // 가짜 지표값 제외
    const isSaneStock = (s) => isSaneValue(s) && s.marketCap >= MCAP_MIN; // 잡주까지 제외

    // 🆕 P5: 전종목 PER·ROE·시총 분포를 유니버스 랭킹용으로 캐시 (기존엔 버려지던 데이터)
    //   가짜 지표값(PER<2·ROE>80)은 분포 백분위를 오염시키므로 제외, 시총 범위는 대표성 위해 유지
    try {
      const distInput = allStocks.filter(s => s.per > 0 && isSaneValue(s));
      const dist = await setUniverseDistribution(distInput);
      console.log(`📊 유니버스 분포 캐시: PER/ROE/시총 (정제표본 ${dist.count}/${allStocks.length})`);
    } catch (e) { console.warn('유니버스 분포 캐시 실패:', e.message); }

    // 저평가 + 수익성 필터 (저PER & 고ROE) + 이상치 가드
    //  - PER: PER_MIN 이상 ~ perMax 이하 (적자·이상치 제외, 저평가)
    //  - ROE: roeMin 이상 ~ ROE_MAX 이하 (수익성 있되 비정상 고ROE 배제)
    //  - 시총: MCAP_MIN 이상 (초소형 잡주 배제)
    const applyFilter = (perMax, roeMin) =>
      allStocks.filter(s =>
        s.per <= perMax &&
        s.roe >= roeMin &&
        isSaneStock(s)
      );

    let candidates = applyFilter(12, 12);            // 싸고 수익성 좋은
    if (candidates.length < 20) candidates = applyFilter(18, 8);
    if (candidates.length < 20) candidates = applyFilter(25, 5);

    // 품질-가치 점수(ROE/PER)로 정렬: 수익성 높고 가격 쌀수록 상위
    const qvScore = (s) => s.roe / s.per;
    candidates.sort((a, b) => qvScore(b) - qvScore(a));

    // 상위 60개 프리리스트 캐시 (KOSPI/KOSDAQ 골고루) — recommend.js가 KIS로 PBR·배당 보강 후 최종 선별
    const kospiTop = candidates.filter(s => s.market === 'KOSPI').slice(0, 30);
    const kosdaqTop = candidates.filter(s => s.market === 'KOSDAQ').slice(0, 30);
    const prelist = [...kospiTop, ...kosdaqTop].sort((a, b) => qvScore(b) - qvScore(a));

    // 🆕 검증 게이트(B-1): 최종 후보가 비정상적으로 적으면 저장 안 함(last-good 유지)
    if (candidates.length < 10) {
      console.warn(`⚠️ 스크리닝 후보 부족 → 캐시 미갱신(last-good 유지): 저평가 ${candidates.length}개`);
      if (res) return res.status(200).json({
        ok: false,
        health: 'degraded',
        reasons: ['too_few_candidates'],
        totalScanned: allStocks.length,
        parseRate: Number(validRate.toFixed(3)),
        filteredCount: candidates.length,
      });
      return;
    }

    await setScreenCandidates({
      candidates: prelist,
      totalScanned: allStocks.length,
      filteredCount: candidates.length,
      universeSize: allStocks.length,
      parseRate: Number(validRate.toFixed(3)),
      health: 'ok',
    });

    console.log(`🎯 스크리닝 결과: 전체 ${allStocks.length}개 → 저평가 ${candidates.length}개 → 상위 ${prelist.length}개 캐시 (파싱률 ${(validRate * 100).toFixed(0)}%)`);

    if (res) res.status(200).json({
      ok: true,
      health: 'ok',
      totalScanned: allStocks.length,
      filteredCount: candidates.length,
      candidateCount: prelist.length,
      parseRate: Number(validRate.toFixed(3)),
      top5: prelist.slice(0, 5).map(s => `${s.name}(ROE:${s.roe}/PER:${s.per})`),
      screenedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ 스크리닝 실패:', error.message);
    if (res) res.status(500).json({ error: error.message });
  }
};
