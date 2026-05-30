const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');
const kisRequest = require('../../lib/kisRequest');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { code, period = '1M' } = req.query;
    if (!code) return res.status(400).json({ error: '종목코드(code) 필요' });

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

    const output = response.data.output;

    const allData = output.map(item => ({
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

    let filteredData;
    if (period === '1d') {
      filteredData = allData.slice(-1);
    } else if (period === '5d') {
      filteredData = allData.slice(-5);
    } else if (period === '1mo') {
      filteredData = allData.slice(-20);
    } else if (period === '3mo') {
      filteredData = allData.slice(-60);
    } else {
      filteredData = allData;
    }

    res.status(200).json(filteredData);
  } catch (error) {
    console.error('KIS chart error:', error.message);
    res.status(500).json({ error: '차트 데이터 조회 실패', detail: error.response?.data, msg: error.message });
  }
};