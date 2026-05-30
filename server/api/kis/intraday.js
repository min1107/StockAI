const axios = require('axios');
const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: '종목코드(code) 필요' });

    const headers = await getAuthHeaders('FHKST03010200');

    // 항상 153000(장 마감 시간)으로 요청 → 당일 전체 분봉 데이터
    const response = await axios.get(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice`,
      {
        headers,
        params: {
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_INPUT_ISCD: code,
          FID_INPUT_HOUR_1: '153000',
          FID_PW_DATA_INCU_YN: 'Y',
        },
        timeout: 10000,
      }
    );

    const output = response.data.output2 || [];
    console.log(`📊 [${code}] KIS 분봉 raw 데이터: ${output.length}개`);

    const data = output.map(item => {
      const timeStr = item.stck_cntg_hour || '';
      const hh = timeStr.slice(0, 2);
      const mm = timeStr.slice(2, 4);

      return {
        time: `${hh}:${mm}`,
        open: parseInt(item.stck_oprc) || 0,
        high: parseInt(item.stck_hgpr) || 0,
        low: parseInt(item.stck_lwpr) || 0,
        close: parseInt(item.stck_prpr) || 0,
        volume: parseInt(item.cntg_vol) || 0,
        timestamp: 0,
      };
    }).filter(d => d.open > 0).reverse();

    console.log(`✅ [${code}] 분봉 데이터: ${data.length}개`);
    res.status(200).json(data);
  } catch (error) {
    const kisError = error.response?.data;
    console.error(`KIS intraday error [${req.query.code}]:`, kisError || error.message);
    // 토큰 rate limit(EGW00133) 등은 앱에서 일봉으로 폴백하므로 빈 배열 반환
    if (kisError?.error_code === 'EGW00133') {
      return res.status(200).json([]);
    }
    res.status(500).json({ error: '분봉 데이터 조회 실패' });
  }
};
