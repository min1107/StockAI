/**
 * 종목 스크리닝 결과 캐시
 * - 매일 오전 8시 cron/screen.js가 KRX 전체 스크리닝 결과를 저장
 * - TTL: 24시간
 * - recommend.js가 이 캐시에서 후보군을 가져옴
 */

const TTL_MS = 24 * 60 * 60 * 1000;
const LASTGOOD_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 마지막 정상 스크리닝은 7일 보존

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
const SCREEN_LASTGOOD_KEY = 'stockai:screen:candidates:lastgood';
const SCREEN_TTL_SEC = 24 * 60 * 60;
const LASTGOOD_TTL_SEC = 7 * 24 * 60 * 60;

// 검증을 통과한 결과만 저장된다(screen.js가 게이트). 현재값 + 마지막 정상값 둘 다 기록.
async function setScreenCandidates(data) {
  const payload = { ...data, screenedAt: new Date().toISOString() };
  memCache.set(SCREEN_KEY, { value: payload, expiry: Date.now() + TTL_MS });
  memCache.set(SCREEN_LASTGOOD_KEY, { value: payload, expiry: Date.now() + LASTGOOD_TTL_MS });
  if (redis) {
    try {
      await redis.set(SCREEN_KEY, JSON.stringify(payload), { ex: SCREEN_TTL_SEC });
      await redis.set(SCREEN_LASTGOOD_KEY, JSON.stringify(payload), { ex: LASTGOOD_TTL_SEC });
    } catch (_) {}
  }
}

async function getScreenCandidates() {
  // 1) 현재값 (24h)
  if (redis) {
    try {
      const cached = await redis.get(SCREEN_KEY);
      if (cached) return typeof cached === 'string' ? JSON.parse(cached) : cached;
    } catch (_) {}
  }
  const item = memCache.get(SCREEN_KEY);
  if (item && Date.now() < item.expiry) return item.value;

  // 2) 마지막 정상값 (7d) — 크롤링 실패/검증 미통과로 현재값이 비어도 발굴 종목 유지
  if (redis) {
    try {
      const lg = await redis.get(SCREEN_LASTGOOD_KEY);
      if (lg) return typeof lg === 'string' ? JSON.parse(lg) : lg;
    } catch (_) {}
  }
  const lgItem = memCache.get(SCREEN_LASTGOOD_KEY);
  if (lgItem && Date.now() < lgItem.expiry) return lgItem.value;

  // 3) 정적 파일 폴백 (로컬에서 buildScreenDB.js로 생성)
  try {
    return require('../data/screenCandidates.json');
  } catch (_) {}
  return null;
}

module.exports = { setScreenCandidates, getScreenCandidates };
