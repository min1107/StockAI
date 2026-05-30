const axios = require('axios');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const RETRYABLE = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EPIPE'];

/**
 * KIS API 요청 with 자동 재시도 (socket hang up / ECONNRESET 대응)
 * @param {string} method - 'get' | 'post'
 * @param {string} url
 * @param {object} config - axios config (headers, params, data, timeout 등)
 * @param {number} maxRetries - 최대 시도 횟수 (기본 3)
 */
const kisRequest = async (method, url, config = {}, maxRetries = 3) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await axios({ method, url, timeout: 12000, ...config });
    } catch (err) {
      lastError = err;

      const isRetryable =
        RETRYABLE.includes(err.code) ||
        err.message?.includes('socket hang up') ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('network error');

      if (!isRetryable || attempt === maxRetries) throw err;

      const delay = attempt * 600; // 600ms → 1200ms
      console.warn(`⚠️ KIS 재시도 ${attempt}/${maxRetries} (${delay}ms):`, err.message);
      await sleep(delay);
    }
  }

  throw lastError;
};

module.exports = kisRequest;
