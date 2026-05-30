/**
 * 거시경제 데이터 캐시 레이어
 * - Redis(Upstash) 있으면 Redis 사용
 * - 없으면 인메모리 캐시로 폴백 (로컬 개발용)
 */

const TTL_MS = 15 * 60 * 1000; // 15분

// 인메모리 폴백
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

const MACRO_KEY = 'stockai:macro:context';
const MACRO_TTL_SEC = 15 * 60; // Redis TTL (초)

async function setMacro(data) {
  const payload = { ...data, collectedAt: new Date().toISOString() };

  // 인메모리 항상 저장
  memCache.set(MACRO_KEY, { value: payload, expiry: Date.now() + TTL_MS });

  // Redis 있으면 동기화
  if (redis) {
    try {
      await redis.set(MACRO_KEY, JSON.stringify(payload), { ex: MACRO_TTL_SEC });
    } catch (_) {}
  }
}

async function getMacro() {
  // Redis 먼저
  if (redis) {
    try {
      const cached = await redis.get(MACRO_KEY);
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached;
      }
    } catch (_) {}
  }

  // 인메모리 폴백
  const item = memCache.get(MACRO_KEY);
  if (item && Date.now() < item.expiry) return item.value;
  return null;
}

module.exports = { setMacro, getMacro };
