/**
 * 🔬 모멘텀 백테스트 (docs/AI_ENGINE.md §6·§8 — trackRecord 실측)
 *
 * 전체 멀티팩터 엔진은 과거 펀더멘털·수급·정성 스냅샷이 없어 백테스트 불가.
 * 가격 시계열로 재현 가능한 "모멘텀 신호"만 백테스트한다:
 *   - 1개월(=lookback) 모멘텀으로 신호 구간 분류
 *   - 이후 1개월(=horizon) 방향이 신호와 같았는지(적중) 집계
 *   → 구간별 방향 적중률(hitRate)을 신뢰도 공식의 trackRecord로 사용.
 *
 * 순수 함수. trackRecord는 "지금 이 모멘텀 패턴의 과거 방향 신뢰도"를 뜻한다.
 */

const LOOKBACK = 20;   // 약 1개월(거래일)
const HORIZON = 20;    // 이후 1개월
const MIN_SAMPLES = 30;

const ret = (a, b) => (a > 0 ? b / a - 1 : 0);

// 모멘텀(%) → 구간 라벨
function momentumBucket(momPct) {
  if (momPct >= 10) return '강한상승';
  if (momPct >= 3) return '상승';
  if (momPct > -3) return '중립';
  if (momPct > -10) return '하락';
  return '강한하락';
}

// 최근 종가 배열로 현재 모멘텀 구간 (lookback+1개 필요)
function currentBucket(closes) {
  if (!Array.isArray(closes) || closes.length < LOOKBACK + 1) return null;
  const c = closes.slice(-(LOOKBACK + 1));
  return momentumBucket(ret(c[0], c[c.length - 1]) * 100);
}

// 한 종목 시계열을 슬라이드하며 구간별 (적중, 표본) 누적
function accumulate(closes, acc) {
  if (!Array.isArray(closes) || closes.length < LOOKBACK + HORIZON + 1) return;
  for (let t = LOOKBACK; t + HORIZON < closes.length; t++) {
    const mom = ret(closes[t - LOOKBACK], closes[t]) * 100;
    const bucket = momentumBucket(mom);
    const fwd = ret(closes[t], closes[t + HORIZON]);
    // 방향 적중: 상승신호→이후 상승, 하락신호→이후 하락. 중립은 추세지속 안봄(집계 제외).
    let hit;
    if (bucket === '강한상승' || bucket === '상승') hit = fwd > 0;
    else if (bucket === '강한하락' || bucket === '하락') hit = fwd < 0;
    else return acc; // 중립 제외
    acc[bucket] = acc[bucket] || { hits: 0, samples: 0 };
    acc[bucket].samples++;
    if (hit) acc[bucket].hits++;
  }
  return acc;
}

// 여러 종목 시계열 → 구간별 적중률 테이블
function runBacktest(seriesList) {
  const acc = {};
  for (const closes of seriesList) accumulate(closes, acc);
  const table = {};
  for (const [bucket, v] of Object.entries(acc)) {
    table[bucket] = {
      hitRate: v.samples ? Math.round((v.hits / v.samples) * 1000) / 1000 : null,
      samples: v.samples,
    };
  }
  return { table, builtAt: new Date().toISOString(), lookback: LOOKBACK, horizon: HORIZON };
}

/**
 * 현재 모멘텀 구간 → trackRecord(0~1).
 * 표본이 충분한 구간만 실측치, 아니면 0.5 중립.
 * @returns {{trackRecord:number, bucket:string|null, samples:number, measured:boolean}}
 */
function getTrackRecord(backtest, closes) {
  const bucket = currentBucket(closes);
  if (!bucket || bucket === '중립' || !backtest || !backtest.table || !backtest.table[bucket]) {
    return { trackRecord: 0.5, bucket: bucket || null, samples: 0, measured: false };
  }
  const e = backtest.table[bucket];
  if (!e || e.samples < MIN_SAMPLES || e.hitRate === null) {
    return { trackRecord: 0.5, bucket, samples: e ? e.samples : 0, measured: false };
  }
  return { trackRecord: e.hitRate, bucket, samples: e.samples, measured: true };
}

module.exports = { runBacktest, getTrackRecord, currentBucket, momentumBucket, accumulate, LOOKBACK, HORIZON };
