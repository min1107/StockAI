/**
 * 기회 종목 API
 * - 수급 이상 감지 (기관/외국인 집중 매수)
 * - 배당락일 임박 종목 (30일 이내)
 */

const { getSupply } = require('../../lib/supplyCache');
const kisRequest = require('../../lib/kisRequest');
const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');

// 고배당 대표 종목 리스트 (schedule: quarterly=분기, annual=연간)
const DIVIDEND_STOCKS = [
  { code: '138040', name: '메리츠금융지주', schedule: 'quarterly' },
  { code: '105560', name: 'KB금융',         schedule: 'quarterly' },
  { code: '055550', name: '신한지주',        schedule: 'quarterly' },
  { code: '086790', name: '하나금융지주',    schedule: 'quarterly' },
  { code: '005380', name: '현대차',          schedule: 'quarterly' },
  { code: '000270', name: '기아',            schedule: 'annual'    },
  { code: '005490', name: 'POSCO홀딩스',     schedule: 'annual'    },
  { code: '030200', name: 'KT',              schedule: 'annual'    },
  { code: '017670', name: 'SK텔레콤',        schedule: 'annual'    },
  { code: '000810', name: '삼성화재',        schedule: 'annual'    },
  { code: '001450', name: '현대해상',        schedule: 'annual'    },
  { code: '010950', name: 'S-Oil',           schedule: 'annual'    },
];

// 배당락일 임박 여부 체크 (월말 26일 기준)
function getDividendStatus(schedule) {
  const now = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const day   = now.getDate();

  const quarterMonths = schedule === 'quarterly' ? [3, 6, 9, 12] : [12];

  for (const qm of quarterMonths) {
    const exDate = new Date(year, qm - 1, 26); // 해당 월 26일
    const diffMs = exDate - now;
    const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysUntil >= 0 && daysUntil <= 30) {
      return { isUpcoming: true, daysUntil, exMonth: qm, exDay: 26 };
    }
  }
  return { isUpcoming: false };
}

// KIS 배당수익률 조회
async function fetchDividendYield(code) {
  try {
    const headers = await getAuthHeaders('FHKST01010100');
    const response = await kisRequest('get',
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`,
      {
        headers,
        params: { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code },
      }
    );
    const output = response.data.output;
    return {
      currentPrice: parseInt(output.stck_prpr) || 0,
      dividendYield: parseFloat(output.dvyd) || 0,
    };
  } catch {
    return { currentPrice: 0, dividendYield: 0 };
  }
}

// 수급 이상 감지 (단일 종목 순매수 100억 이상)
function detectAnomalies(supply) {
  if (!supply) return [];
  const anomalies = [];

  const threshold = 100; // 100억 이상

  for (const s of (supply.topInstBuy || [])) {
    if (s.dailyInst >= threshold) {
      anomalies.push({ ...s, type: 'institution', score: s.dailyInst });
    }
  }
  for (const s of (supply.topForeignBuy || [])) {
    if (s.dailyForeign >= threshold) {
      anomalies.push({ ...s, type: 'foreign', score: s.dailyForeign });
    }
  }

  // 중복 제거 (기관+외국인 동시 매수 → 통합)
  const map = {};
  for (const a of anomalies) {
    if (!map[a.code]) {
      map[a.code] = { ...a };
    } else {
      map[a.code].bothBuying = true;
      map[a.code].score += a.score;
    }
  }

  return Object.values(map).sort((a, b) => b.score - a.score);
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. 수급 데이터 (캐시)
    const supply = await getSupply();

    // 2. 수급 이상 감지
    const supplyAnomalies = detectAnomalies(supply);

    // 3. 배당락일 임박 종목 필터링
    const upcomingDividends = DIVIDEND_STOCKS
      .map(s => ({ ...s, dividendStatus: getDividendStatus(s.schedule) }))
      .filter(s => s.dividendStatus.isUpcoming)
      .sort((a, b) => a.dividendStatus.daysUntil - b.dividendStatus.daysUntil);

    // 4. 배당 임박 종목 KIS 수익률 조회 (최대 6개, 병렬)
    const divWithYield = await Promise.all(
      upcomingDividends.slice(0, 6).map(async (s) => {
        const priceData = await fetchDividendYield(s.code);
        return { ...s, ...priceData };
      })
    );

    res.status(200).json({
      supply: {
        topInstBuy:    supply?.topInstBuy    || [],
        topForeignBuy: supply?.topForeignBuy || [],
        totalInst:     supply?.totalInst     || 0,
        totalForeign:  supply?.totalForeign  || 0,
        collectedAt:   supply?.collectedAt   || null,
      },
      supplyAnomalies,
      dividendOpportunities: divWithYield,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Opportunity API error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
