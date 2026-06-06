const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');
const kisRequest = require('../../lib/kisRequest');
const { Redis } = require('@upstash/redis');

let redis = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (_) {}

// 장중 15분, 장 마감 후 30분 캐시
const TTL = {
  '1d':  15 * 60,
  '5d':  20 * 60,
  '1mo': 30 * 60,
  '3mo': 30 * 60,
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { code, period = '1M' } = req.query;
    if (!code) return res.status(400).json({ error: '종목코드(code) 필요' });

    // 캐시 확인
    const cacheKey = `stockai:chart:${code}:${period}`;
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
          res.setHeader('X-Cache', 'HIT');
          return res.status(200).json(data);
        }
      } catch (_) {}
    }

    const headers = await getAuthHeaders('FHKST01010400');
    const response = await kisRequest('get',
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-price`,
      {
        headers,
        params: {
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_INPUT_ISCD: code,
          FID_PERIOD_DIV_CODE: 'D',
          FID_ORG_ADJ_PRC: '0',
        },
      }
    );

    const allData = (response.data.output || []).map(item => ({
      time: `${item.stck_bsop_date.slice(4, 6)}/${item.stck_bsop_date.slice(6, 8)}`,
      open: parseInt(item.stck_oprc),
      high: parseInt(item.stck_hgpr),
      low: parseInt(item.stck_lwpr),
      close: parseInt(item.stck_clpr),
      volume: parseInt(item.acml_vol || 0),
      timestamp: new Date(
        item.stck_bsop_date.slice(0, 4),
        parseInt(item.stck_bsop_date.slice(4, 6)) - 1,
        item.stck_bsop_date.slice(6, 8)
      ).getTime() / 1000,
    })).reverse();

    const sliceMap = { '1d': -1, '5d': -5, '1mo': -20, '3mo': -60 };
    const filteredData = sliceMap[period] != null ? allData.slice(sliceMap[period]) : allData;

    // 캐시 저장
    if (redis && filteredData.length > 0) {
      try {
        await redis.set(cacheKey, JSON.stringify(filteredData), { ex: TTL[period] || 1800 });
      } catch (_) {}
    }

    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(filteredData);
  } catch (error) {
    console.error('KIS chart error:', error.message);
    res.status(500).json({ error: '차트 데이터 조회 실패', detail: error.response?.data, msg: error.message });
  }
};
