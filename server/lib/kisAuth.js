const axios = require('axios');
const { Redis } = require('@upstash/redis');

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';
const TOKEN_KEY = 'kis_token_v2';
const LOCK_KEY  = 'kis_token_lock_v2';

// Upstash Redis 클라이언트
let redis = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log('✅ Redis 클라이언트 초기화 완료');
  }
} catch (e) {
  console.error('❌ Redis 초기화 실패:', e.message);
}

// Redis에서 토큰 읽기
const getTokenFromRedis = async () => {
  if (!redis) return null;
  // 3초 타임아웃 + 1회 재시도
  const tryGet = () => Promise.race([
    redis.get(TOKEN_KEY),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Redis timeout')), 3000)),
  ]);
  for (let i = 0; i < 2; i++) {
    try {
      const token = await tryGet();
      if (token && typeof token === 'string' && token.length > 10) return token;
      return null;
    } catch (e) {
      if (i === 0) {
        console.warn('⚠️ Redis 읽기 실패, 재시도...', e.message);
        await new Promise(r => setTimeout(r, 1000));
      } else {
        console.warn('⚠️ Redis 읽기 최종 실패:', e.message);
      }
    }
  }
  return null;
};

// Redis에 토큰 저장 (22시간)
const saveTokenToRedis = async (token) => {
  if (!redis) return;
  try {
    // set with EX 옵션 (setex 대신 - 더 안정적)
    await redis.set(TOKEN_KEY, token, { ex: 22 * 60 * 60 });
    console.log('✅ Redis에 토큰 저장 완료 (22시간)');
  } catch (e) {
    console.error('❌ Redis 저장 실패:', e.message);
  }
};

// 새 토큰 발급
const issueNewToken = async () => {
  console.log('🔑 KIS 신규 토큰 발급 중...');
  const response = await axios.post(
    `${KIS_BASE_URL}/oauth2/tokenP`,
    {
      grant_type: 'client_credentials',
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  const token = response.data.access_token;
  console.log('✅ KIS 토큰 발급 완료');
  await saveTokenToRedis(token);
  return token;
};

// ─── 메인: 토큰 가져오기 ───────────────────────────────────
// 우선순위: ① Redis → ② 신규 발급 (동시 발급 방지)
// ────────────────────────────────────────────────────────────
let localToken = null;          // 같은 인스턴스 내 재사용
let localTokenExpiry = 0;       // 토큰 만료 시각 (ms)
let issuingPromise = null;      // 같은 인스턴스 내 동시 발급 방지

const getAccessToken = async () => {
  // ① 같은 인스턴스 내 메모리 캐시 (만료 전인 경우에만)
  if (localToken && Date.now() < localTokenExpiry) {
    return localToken;
  }
  // 만료된 경우 초기화
  localToken = null;

  // ② Redis에서 조회 (다른 인스턴스가 발급한 토큰 재사용)
  const redisToken = await getTokenFromRedis();
  if (redisToken) {
    console.log('♻️ Redis 토큰 재사용 (발급 없음)');
    localToken = redisToken;
    return localToken;
  }

  // ③ Redis에도 없음 → 신규 발급 (같은 인스턴스 내 중복 방지)
  if (issuingPromise) {
    console.log('⏳ 같은 인스턴스 내 발급 대기...');
    return issuingPromise;
  }

  // ④ 분산 락: 다른 Vercel 인스턴스가 발급 중인지 확인
  if (redis) {
    try {
      const locked = await redis.set(LOCK_KEY, '1', { nx: true, ex: 20 });
      if (!locked) {
        // 다른 인스턴스가 발급 중 → 최대 10초 대기 후 Redis 재조회
        console.log('⏳ 다른 인스턴스 발급 중, 대기...');
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const waited = await getTokenFromRedis();
          if (waited) {
            console.log('♻️ 대기 후 Redis 토큰 재사용');
            localToken = waited;
            return localToken;
          }
        }
        // 10초 대기 후에도 토큰 없음 → 락이 죽은 인스턴스에 걸린 것
        // 강제로 락 해제 후 발급 (ex: 20초 TTL이므로 중복 발급 위험 최소화)
        console.log('⚠️ 락 만료 대기 후 강제 발급 시도');
        try { await redis.del(LOCK_KEY); } catch (_) {}
        const retryLocked = await redis.set(LOCK_KEY, '1', { nx: true, ex: 20 });
        if (!retryLocked) {
          // 다른 인스턴스가 동시에 획득 → Redis에서 완성된 토큰 재조회 후 반환
          const finalWait = await getTokenFromRedis();
          if (finalWait) { localToken = finalWait; return localToken; }
        }
      }
    } catch (_) {}
  }

  // ⑤ 실제 발급
  issuingPromise = issueNewToken()
    .then(token => {
      localToken = token;
      localTokenExpiry = Date.now() + 21.5 * 60 * 60 * 1000; // 21.5시간 (Redis 22h보다 30분 빨리 만료)
      return token;
    })
    .finally(async () => {
      issuingPromise = null;
      if (redis) {
        try { await redis.del(LOCK_KEY); } catch (_) {}
      }
    });

  return issuingPromise;
};

const getAuthHeaders = async (trId) => {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json; charset=utf-8',
    authorization: `Bearer ${token}`,
    appkey: process.env.KIS_APP_KEY,
    appsecret: process.env.KIS_APP_SECRET,
    tr_id: trId,
  };
};

module.exports = { KIS_BASE_URL, getAccessToken, getAuthHeaders };
