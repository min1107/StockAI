const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');
const kisRequest = require('../../lib/kisRequest');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { codes } = req.query;
    if (!codes) return res.status(400).json({ error: '종목코드(codes) 필요 (쉼표 구분)' });

    const codeList = codes.split(',').map(c => c.trim()).filter(Boolean);
    if (codeList.length === 0) return res.status(400).json({ error: '종목코드가 없습니다' });

    const results = {};

    for (const code of codeList) {
      try {
        const headers = await getAuthHeaders('FHKST01010100');
        const response = await kisRequest('get',
          `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`,
          {
            headers,
            params: {
              FID_COND_MRKT_DIV_CODE: 'J',
              FID_INPUT_ISCD: code,
            },
          }
        );

        const output = response.data.output;
        results[code] = {
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
          sector: output.bstp_kor_isnm || null,
        };
      } catch (err) {
        console.error(`KIS prices error [${code}]:`, err.message);
        results[code] = { error: true };
      }

      // KIS API rate limit 방지 (200ms 간격)
      if (codeList.indexOf(code) < codeList.length - 1) {
        await delay(200);
      }
    }

    res.status(200).json(results);
  } catch (error) {
    console.error('KIS prices batch error:', error.message);
    res.status(500).json({ error: '배치 조회 실패' });
  }
};
