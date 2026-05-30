/**
 * 시장 수급 캐시 레이어
 * - 추천 풀 주요 종목의 수급 데이터를 사전 수집해서 캐시
 * - TTL: 30분 (장중 갱신 주기)
 */

const TTL_MS = 30 * 60 * 1000;

const memCache = new Map();

let redis = null;
try {
  const { Redis } = require('@upstash/redis');
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (_) {}

const SUPPLY_KEY = 'stockai:market:supply';
const SUPPLY_TTL_SEC = 30 * 60;

async function setSupply(data) {
  const payload = { ...data, collectedAt: new Date().toISOString() };
  memCache.set(SUPPLY_KEY, { value: payload, expiry: Date.now() + TTL_MS });
  if (redis) {
    try {
      await redis.set(SUPPLY_KEY, JSON.stringify(payload), { ex: SUPPLY_TTL_SEC });
    } catch (_) {}
  }
}

async function getSupply() {
  if (redis) {
    try {
      const cached = await redis.get(SUPPLY_KEY);
      if (cached) return typeof cached === 'string' ? JSON.parse(cached) : cached;
    } catch (_) {}
  }
  const item = memCache.get(SUPPLY_KEY);
  if (item && Date.now() < item.expiry) return item.value;
  return null;
}

module.exports = { setSupply, getSupply };
