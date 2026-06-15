/**
 * 🔬 모멘텀 백테스트 크론 (P8)
 *
 * 표본 종목들의 과거 일봉으로 모멘텀 신호 구간별 방향 적중률 테이블을 만들어 캐시.
 * 주 1회 실행(분포 느리게 변함). 수동 트리거로 워밍 가능.
 */

const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');
const kisRequest = require('../../lib/kisRequest');
const { runBacktest } = require('../../lib/backtest');
const { setBacktest } = require('../../lib/backtestCache');

// 표본: 유동성 큰 대·중형주 (모멘텀 통계 안정). 시장 대표성 위해 섹터 분산.
const SAMPLE = [
  '005930', '000660', '005380', '051910', '035420', '035720', '005490', '012330',
  '068270', '105560', '055550', '015760', '017670', '032830', '009150', '096770',
  '066570', '003550', '034730', '011200',
];

const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

// 과거 일봉 종가(시간 오름차순) — inquire-daily-itemchartprice (최대 ~100행)
async function fetchDailyCloses(code) {
  try {
    const headers = await getAuthHeaders('FHKST03010100');
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - 200); // ~100 거래일 확보
    const resp = await kisRequest('get', `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`, {
      headers,
      params: {
        FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code,
        FID_INPUT_DATE_1: ymd(start), FID_INPUT_DATE_2: ymd(end),
        FID_PERIOD_DIV_CODE: 'D', FID_ORG_ADJ_PRC: '0',
      },
    });
    const rows = resp.data?.output2 || [];
    // 최신순으로 오므로 역순 정렬, 종가만
    return rows
      .map(r => parseFloat(r.stck_clpr))
      .filter(v => isFinite(v) && v > 0)
      .reverse();
  } catch (err) {
    console.warn(`백테스트 일봉 실패 [${code}]:`, err.response?.status || err.message);
    return [];
  }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (res && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const seriesList = [];
    // KIS 부하 분산 위해 소규모 배치 순차
    for (const code of SAMPLE) {
      const closes = await fetchDailyCloses(code);
      if (closes.length >= 45) seriesList.push(closes);
    }
    if (seriesList.length < 5) {
      if (res) res.status(502).json({ error: '백테스트 표본 부족', got: seriesList.length });
      return;
    }

    const result = runBacktest(seriesList);
    result.stocksUsed = seriesList.length;
    await setBacktest(result);

    console.log(`🔬 백테스트 완료: ${seriesList.length}종목, 구간 ${Object.keys(result.table).length}`);
    if (res) res.status(200).json({ ok: true, stocksUsed: seriesList.length, table: result.table, builtAt: result.builtAt });
  } catch (error) {
    console.error('❌ 백테스트 실패:', error.message);
    if (res) res.status(500).json({ error: error.message });
  }
};
