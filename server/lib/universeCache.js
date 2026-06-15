/**
 * 🌐 유니버스 분포 캐시 (P5-2)
 *
 * 스크리닝 크론이 수집하는 전종목 PER·PBR·시총 분포를, 종목별 상대 백분위 계산에
 * 쓰기 위해 저장한다. 풀 배열 대신 백분위 구간점(0~100, 101개)으로 압축 저장.
 * recommend/screen 과 별개 키. TTL 25h (매일 갱신 전제, 약간 여유).
 */

const { Redis } = require('@upstash/redis');

const KEY = 'stockai:universe:dist:v1';
const TTL_SEC = 25 * 60 * 60;
const MEM_TTL = 6 * 60 * 60 * 1000;

let redis = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
  }
} catch (_) {}

let mem = null, memAt = 0;

// 숫자 배열 → 101개 백분위 구간점(오름차순)
function toBreakpoints(values) {
  const arr = values.filter(v => typeof v === 'number' && isFinite(v) && v > 0).sort((a, b) => a - b);
  if (arr.length < 30) return null; // 표본 너무 적으면 무의미
  const bp = [];
  for (let k = 0; k <= 100; k++) {
    const idx = Math.round((k / 100) * (arr.length - 1));
    bp.push(arr[idx]);
  }
  return { bp, n: arr.length };
}

// 전종목 raw [{per,pbr,marketCap}] → 분포 객체
function buildDistribution(stocks) {
  return {
    per: toBreakpoints(stocks.map(s => s.per)),
    pbr: toBreakpoints(stocks.map(s => s.pbr)),
    marketCap: toBreakpoints(stocks.map(s => s.marketCap)),
    count: stocks.length,
    builtAt: new Date().toISOString(),
  };
}

async function setUniverseDistribution(stocks) {
  const dist = buildDistribution(stocks);
  mem = dist; memAt = Date.now();
  if (redis) {
    try { await redis.set(KEY, JSON.stringify(dist), { ex: TTL_SEC }); } catch (_) {}
  }
  return dist;
}

async function getUniverseDistribution() {
  if (mem && Date.now() - memAt < MEM_TTL) return mem;
  if (redis) {
    try {
      const c = await redis.get(KEY);
      if (c) { mem = typeof c === 'string' ? JSON.parse(c) : c; memAt = Date.now(); return mem; }
    } catch (_) {}
  }
  return null;
}

module.exports = { setUniverseDistribution, getUniverseDistribution, buildDistribution };
