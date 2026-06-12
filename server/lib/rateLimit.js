/**
 * 간단한 IP 기반 rate limiting (Upstash Redis, 고정 윈도우)
 * - Redis 없거나 오류 시 통과(fail-open) — 보호 장치가 앱을 깨지 않게
 */

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

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
}

// 허용이면 true 반환. 초과면 res에 429 보내고 false 반환.
async function rateLimit(req, res, { bucket, limit, windowSec }) {
  if (!redis) return true; // Redis 미설정 → 통과
  try {
    const ip = clientIp(req);
    const key = `rl:${bucket}:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);
    if (count > limit) {
      res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
      return false;
    }
    return true;
  } catch (_) {
    return true; // Redis 오류 → 통과(fail-open)
  }
}

module.exports = { rateLimit };
