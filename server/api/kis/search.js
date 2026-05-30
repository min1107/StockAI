const axios = require('axios');
const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');

// KIS 단건 종목 조회 (코드 직접 검색)
const searchByCode = async (headers, code) => {
  const response = await axios.get(
    `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/search-stock-info`,
    {
      headers,
      params: {
        PRDT_TYPE_CD: '300',
        PDNO: code,
      },
      timeout: 5000,
    }
  );
  return response.data.output || [];
};

// KIS 종목명 검색
const searchByName = async (headers, name) => {
  const response = await axios.get(
    `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/search-stock-info`,
    {
      headers,
      params: {
        PRDT_TYPE_CD: '300',
        PDNO: '',
        PRDT_NAME: name,
      },
      timeout: 5000,
    }
  );
  return response.data.output || [];
};

const mapItem = (item) => {
  // mktid: 01=KOSPI, 02=KOSDAQ
  const isKospi = item.mktid === '01' || item.std_pdno;
  return {
    symbol: item.pdno + (isKospi ? '.KS' : '.KQ'),
    name: item.prdt_name || item.prdt_abrv_name,
    code: item.pdno,
    exchange: isKospi ? 'KSC' : 'KOE',
    type: 'EQUITY',
  };
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { keyword } = req.query;
    if (!keyword || keyword.trim().length === 0) {
      return res.status(200).json([]);
    }

    const headers = await getAuthHeaders('CTPF1604R');
    const isCodeSearch = /^\d+$/.test(keyword.trim());

    let output = [];
    if (isCodeSearch) {
      output = await searchByCode(headers, keyword.trim());
    } else {
      // 이름 검색 시도, 실패하면 빈 배열
      try {
        output = await searchByName(headers, keyword.trim());
      } catch {
        output = [];
      }
    }

    const results = output
      .filter(item => item.pdno && (item.prdt_name || item.prdt_abrv_name))
      .map(mapItem);

    res.status(200).json(results);
  } catch (error) {
    console.error('KIS search error:', error.message);
    res.status(200).json([]);
  }
};