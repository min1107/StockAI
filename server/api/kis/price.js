const axios = require('axios');
const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: '종목코드(code) 필요' });

    const headers = await getAuthHeaders('FHKST01010100');

    const response = await axios.get(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`,
      {
        headers,
        params: {
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_INPUT_ISCD: code,
        },
        timeout: 10000,
      }
    );

    const output = response.data.output;

    res.status(200).json({
      currentPrice: parseInt(output.stck_prpr),
      change: parseInt(output.prdy_vrss),
      changeRate: parseFloat(output.prdy_ctrt),
      high: parseInt(output.stck_hgpr),
      low: parseInt(output.stck_lwpr),
      open: parseInt(output.stck_oprc),
      volume: parseInt(output.acml_vol),
      marketCap: parseInt(output.hts_avls),
      fiftyTwoWeekHigh: parseInt(output.w52_hgpr) || 0,
      fiftyTwoWeekLow: parseInt(output.w52_lwpr) || 0,
      per: parseFloat(output.per) || null,
      pbr: parseFloat(output.pbr) || null,
      eps: parseInt(output.eps) || null,
      bps: parseInt(output.bps) || null,
      sector: output.bstp_kor_isnm || null,
    });
  } catch (error) {
    console.error(`KIS price error [${req.query.code}]:`, error.message);
    res.status(500).json({ error: '현재가 조회 실패' });
  }
};