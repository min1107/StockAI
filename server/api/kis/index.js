const axios = require('axios');
const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');

const fetchIndex = async (indexCode) => {
  const headers = await getAuthHeaders('FHPUP02100000');
  const response = await axios.get(
    `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-index-price`,
    {
      headers,
      params: {
        FID_COND_MRKT_DIV_CODE: 'U',
        FID_INPUT_ISCD: indexCode,
      },
      timeout: 20000,
    }
  );
  const o = response.data.output;
  if (!o || !o.bstp_nmix_prpr) throw new Error(`지수 데이터 없음: ${indexCode}`);
  return {
    price: parseFloat(o.bstp_nmix_prpr),
    change: parseFloat(o.bstp_nmix_prdy_vrss),
    changeRate: parseFloat(o.bstp_nmix_prdy_ctrt),
    high: parseFloat(o.bstp_nmix_hgpr),
    low: parseFloat(o.bstp_nmix_lwpr),
  };
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const [kospiResult, kosdaqResult] = await Promise.allSettled([
      fetchIndex('0001'),
      fetchIndex('1001'),
    ]);

    const kospi = kospiResult.status === 'fulfilled' ? kospiResult.value : null;
    const kosdaq = kosdaqResult.status === 'fulfilled' ? kosdaqResult.value : null;

    if (!kospi && !kosdaq) {
      console.error('Index API error: 양쪽 모두 실패');
      return res.status(500).json({ error: '시장 지수 조회 실패' });
    }

    res.status(200).json({ kospi, kosdaq });
  } catch (error) {
    console.error('Index API error:', error.message);
    res.status(500).json({ error: '시장 지수 조회 실패' });
  }
};
