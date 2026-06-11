/**
 * 웹 푸시 구독(subscription) 저장 레이어
 * - Upstash Redis HASH(endpoint → 구독 JSON)에 영구 저장
 * - 같은 endpoint 재구독 시 자동 덮어쓰기(중복 방지)
 */

const memMap = new Map();

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

const SUBS_KEY = 'stockai:push:subs';

async function addSub(sub) {
  if (!sub || !sub.endpoint) return;
  memMap.set(sub.endpoint, sub);
  if (redis) {
    try { await redis.hset(SUBS_KEY, { [sub.endpoint]: JSON.stringify(sub) }); } catch (_) {}
  }
}

async function removeSub(endpoint) {
  if (!endpoint) return;
  memMap.delete(endpoint);
  if (redis) {
    try { await redis.hdel(SUBS_KEY, endpoint); } catch (_) {}
  }
}

async function getAllSubs() {
  if (redis) {
    try {
      const all = await redis.hgetall(SUBS_KEY);
      if (all) return Object.values(all).map(v => (typeof v === 'string' ? JSON.parse(v) : v));
    } catch (_) {}
  }
  return [...memMap.values()];
}

module.exports = { addSub, removeSub, getAllSubs };
