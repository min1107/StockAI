/**
 * 시장 뉴스 캐시 레이어
 * - Redis(Upstash) 있으면 Redis 사용
 * - 없으면 인메모리 캐시로 폴백 (로컬 개발용)
 */

const TTL_MS = 60 * 60 * 1000; // 1시간

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

const NEWS_KEY = 'stockai:market:news';
const NEWS_TTL_SEC = 60 * 60;

async function setNews(data) {
  const payload = { ...data, collectedAt: new Date().toISOString() };
  memCache.set(NEWS_KEY, { value: payload, expiry: Date.now() + TTL_MS });
  if (redis) {
    try {
      await redis.set(NEWS_KEY, JSON.stringify(payload), { ex: NEWS_TTL_SEC });
    } catch (_) {}
  }
}

async function getNews() {
  if (redis) {
    try {
      const cached = await redis.get(NEWS_KEY);
      if (cached) return typeof cached === 'string' ? JSON.parse(cached) : cached;
    } catch (_) {}
  }
  const item = memCache.get(NEWS_KEY);
  if (item && Date.now() < item.expiry) return item.value;
  return null;
}

module.exports = { setNews, getNews };
