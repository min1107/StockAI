/**
 * 섹터(업종) 흐름 API — Naver Finance 업종지수 스크래핑
 * GET /api/kis/sectors
 * Response: { sectors: [{ name, changeRate, isUp }], collectedAt }
 */

const axios = require('axios');
const iconv = require('iconv-lite');

// 15분 메모리 캐시
const CACHE = { data: null, at: 0 };
const TTL = 15 * 60 * 1000;

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 캐시 유효하면 즉시 반환
  if (CACHE.data && Date.now() - CACHE.at < TTL) {
    return res.status(200).json(CACHE.data);
  }

  try {
    const response = await axios.get(
      'https://finance.naver.com/sise/sectorJongmok.nhn?type=0',
      {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://finance.naver.com',
        },
        timeout: 8000,
      }
    );

    const html = iconv.decode(Buffer.from(response.data), 'EUC-KR');
    const sectors = parseSectors(html);

    const result = {
      sectors: sectors.slice(0, 12),
      collectedAt: new Date().toISOString(),
    };

    CACHE.data = result;
    CACHE.at = Date.now();

    return res.status(200).json(result);
  } catch (error) {
    console.error('❌ 섹터 데이터 조회 실패:', error.message);
    // 캐시가 오래됐어도 있으면 반환
    if (CACHE.data) return res.status(200).json(CACHE.data);
    return res.status(200).json({ sectors: [], collectedAt: null });
  }
};

/**
 * Naver Finance 업종지수 HTML 파싱
 * 각 TR에서 섹터명과 등락률 추출
 */
function parseSectors(html) {
  const sectors = [];

  // 각 TR 추출
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRegex.exec(html)) !== null) {
    const row = trMatch[1];

    // 섹터명: href에 sectorCode 포함된 <a> 태그
    const nameMatch = row.match(/sectorCode=[^"&]+[^>]*>([^<]+)<\/a>/);
    if (!nameMatch) continue;

    const name = nameMatch[1].trim();
    if (!name || name.length < 2) continue;

    // 숫자 컬럼 추출 (class="number" 내 텍스트)
    const numCols = [];
    const numRegex = /<td[^>]*class="number"[^>]*>([\s\S]*?)<\/td>/gi;
    let numMatch;
    while ((numMatch = numRegex.exec(row)) !== null) {
      // 태그 제거 후 숫자 추출
      const text = numMatch[1].replace(/<[^>]+>/g, '').trim();
      const val = parseFloat(text.replace(/,/g, ''));
      numCols.push(isNaN(val) ? null : val);
    }

    // 컬럼 구조: [현재값, 전일값, 전일대비, 등락률, 거래량, ...]
    // 등락률은 4번째(index 3) 또는 마지막에서 2번째
    let changeRate = null;
    if (numCols.length >= 4) {
      // 마지막 또는 index 3
      const candidate = numCols[3] ?? numCols[numCols.length - 2] ?? numCols[numCols.length - 1];
      if (candidate != null && Math.abs(candidate) < 20) {
        // 등락률은 보통 ±20% 이내
        changeRate = candidate;
      }
    }

    if (changeRate === null) continue;

    sectors.push({
      name,
      changeRate: Math.round(changeRate * 100) / 100,
      isUp: changeRate >= 0,
    });
  }

  // 등락률 절댓값 기준 정렬 (가장 많이 움직인 섹터 먼저)
  sectors.sort((a, b) => Math.abs(b.changeRate) - Math.abs(a.changeRate));

  return sectors;
}
