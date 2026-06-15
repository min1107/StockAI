/**
 * 🔬 백테스트 결과 캐시 (P8)
 * 모멘텀 구간별 적중률 테이블. 주 1회 cron/backtest가 갱신. 변화 느려 TTL 길게.
 */
const { Redis } = require('@upstash/redis');

const KEY = 'stockai:backtest:momentum:v1';
const TTL_SEC = 10 * 24 * 60 * 60; // 10일
const MEM_TTL = 12 * 60 * 60 * 1000;

let redis = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
  }
} catch (_) {}

let mem = null, memAt = 0;

async function setBacktest(result) {
  mem = result; memAt = Date.now();
  if (redis) { try { await redis.set(KEY, JSON.stringify(result), { ex: TTL_SEC }); } catch (_) {} }
}

async function getBacktest() {
  if (mem && Date.now() - memAt < MEM_TTL) return mem;
  if (redis) {
    try {
      const c = await redis.get(KEY);
      if (c) { mem = typeof c === 'string' ? JSON.parse(c) : c; memAt = Date.now(); return mem; }
    } catch (_) {}
  }
  // 정적 폴백
  try { return require('../data/backtest.json'); } catch (_) {}
  return null;
}

module.exports = { setBacktest, getBacktest };
