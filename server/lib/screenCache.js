/**
 * 종목 스크리닝 결과 캐시
 * - 매일 오전 8시 cron/screen.js가 KRX 전체 스크리닝 결과를 저장
 * - TTL: 24시간
 * - recommend.js가 이 캐시에서 후보군을 가져옴
 */

const TTL_MS = 24 * 60 * 60 * 1000;

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

const SCREEN_KEY = 'stockai:screen:candidates';
const SCREEN_TTL_SEC = 24 * 60 * 60;

async function setScreenCandidates(data) {
  const payload = { ...data, screenedAt: new Date().toISOString() };
  memCache.set(SCREEN_KEY, { value: payload, expiry: Date.now() + TTL_MS });
  if (redis) {
    try {
      await redis.set(SCREEN_KEY, JSON.stringify(payload), { ex: SCREEN_TTL_SEC });
    } catch (_) {}
  }
}

async function getScreenCandidates() {
  if (redis) {
    try {
      const cached = await redis.get(SCREEN_KEY);
      if (cached) return typeof cached === 'string' ? JSON.parse(cached) : cached;
    } catch (_) {}
  }
  const item = memCache.get(SCREEN_KEY);
  if (item && Date.now() < item.expiry) return item.value;
  // 정적 파일 폴백 (로컬에서 buildScreenDB.js로 생성)
  try {
    return require('../data/screenCandidates.json');
  } catch (_) {}
  return null;
}

module.exports = { setScreenCandidates, getScreenCandidates };
