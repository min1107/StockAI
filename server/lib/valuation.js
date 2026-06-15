/**
 * 💎 적정가·안전마진 엔진 (docs/AI_ENGINE.md §3-B — P2)
 *
 * 철학: 적정가는 코드가 결정론적으로 계산한다(AI 환각 금지). 같은 입력 → 같은 적정가.
 *
 * 기존 안전마진은 (52주고점-현재가)/고점 = 단순 낙폭이라 "가짜"였다. 여기서는
 * 내재가치 기반 적정가를 산출하고 진짜 안전마진(MOS)을 계산한다.
 *
 * 적정가 = 가용한 방식들의 평균 (데이터 없는 방식은 제외 — 엔진 철학 그대로):
 *   ① 그레이엄 수      √(22.5 · EPS · BPS)
 *   ② 정당 PBR(ROE)    적정PBR = ROE ÷ 요구수익률(8%);  적정가 = 적정PBR × BPS
 *   ③ 정당 PER × EPS   정당PER = 섹터PER(있으면) 또는 성장률 기반(보수적 캡)
 *
 * MOS = (적정가 − 현재가) / 적정가.  방식 간 분산이 크면 신뢰도를 자동 하향한다.
 * 적자(EPS≤0/ROE≤0)면 그레이엄·PER이 무력 → 가능한 방식만, 다 안 되면 추정불가.
 *
 * 순수 함수. 입력이 모자라면 fairValue=null로 정직하게 반환하고 절대 던지지 않는다.
 */

const REQUIRED_RETURN = 8;   // 요구수익률 8% (정당 PBR 계산용)
const isNum = (v) => typeof v === 'number' && isFinite(v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 정당 PER 추정 (5년 PER 밴드 부재 → 섹터PER·성장률로 대체).
 *  - 섹터PER이 합리적 범위(3~40)면 그것을 앵커로.
 *  - 성장률(earningsGrowth %)이 있으면 보수적으로 가산하되 상·하한 캡.
 *  - 둘 다 없으면 시장 통념 10.
 */
function justifiedPer({ sectorPer, earningsGrowth }) {
  if (isNum(sectorPer) && sectorPer >= 3 && sectorPer <= 40) {
    return sectorPer;
  }
  if (isNum(earningsGrowth)) {
    // 성장 가산형: 무성장 8.5 기준 + 성장 일부 반영, 6~25로 캡 (과대평가 방지)
    return clamp(8.5 + 1.5 * clamp(earningsGrowth, 0, 12), 6, 25);
  }
  return 10;
}

/**
 * 적정가/안전마진 계산.
 * @returns {{
 *   fairValue: number|null, marginOfSafety: number|null,
 *   methods: Array<{name:string, value:number}>, dispersion: number|null,
 *   confidence: 'high'|'medium'|'low'|'none', note: string
 * }}
 */
function computeFairValue({ price, eps, bps, roe, earningsGrowth, sectorPer } = {}) {
  const methods = [];

  // ① 그레이엄 수 — 흑자(EPS>0) + 순자산(BPS>0) 필요
  if (isNum(eps) && eps > 0 && isNum(bps) && bps > 0) {
    methods.push({ name: '그레이엄수', value: Math.sqrt(22.5 * eps * bps) });
  }

  // ② 정당 PBR(ROE) — ROE>0 + BPS>0 필요
  if (isNum(roe) && roe > 0 && isNum(bps) && bps > 0) {
    const fairPbr = clamp(roe / REQUIRED_RETURN, 0.2, 10); // 적정PBR 캡(극단치 방지)
    methods.push({ name: '정당PBR', value: fairPbr * bps });
  }

  // ③ 정당 PER × EPS — EPS>0 필요
  if (isNum(eps) && eps > 0) {
    methods.push({ name: '정당PER', value: justifiedPer({ sectorPer, earningsGrowth }) * eps });
  }

  if (methods.length === 0) {
    return {
      fairValue: null, marginOfSafety: null, methods: [], dispersion: null,
      confidence: 'none',
      note: (isNum(eps) && eps <= 0) || (isNum(roe) && roe <= 0)
        ? '적자/마이너스 지표로 적정가 추정 불가'
        : '적정가 계산에 필요한 EPS·BPS·ROE 부족',
    };
  }

  const values = methods.map(m => m.value);
  // 중앙값으로 적정가 산출 — 한 방식(특히 성장기반 정당PER)이 튀어도 강건.
  // 과대추정은 가짜 저평가 신호를 만들어 위험하므로 평균보다 보수적인 median을 쓴다.
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const fairValue = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // 분산: 변동계수(표준편차/평균). 방식 간 결과가 들쭉날쭉하면 신뢰도 down.
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const dispersion = mean > 0 ? Math.sqrt(variance) / mean : null; // 변동계수(CV)

  // 신뢰도: 방식 수 + 분산으로 등급화
  let confidence = 'medium';
  if (methods.length >= 3 && isNum(dispersion) && dispersion <= 0.25) confidence = 'high';
  else if (methods.length === 1 || (isNum(dispersion) && dispersion > 0.5)) confidence = 'low';

  // MOS(안전마진, 채점용): (적정가-현재가)/적정가 — 설계문서 B-1 정의
  const marginOfSafety = (isNum(price) && price > 0)
    ? ((fairValue - price) / fairValue) * 100
    : null;
  // 상승여력(표시용): (적정가-현재가)/현재가 — "적정가까지 +X%". 고평가도 직관적(예 -40%)
  const upside = (isNum(price) && price > 0)
    ? ((fairValue - price) / price) * 100
    : null;

  return {
    fairValue: Math.round(fairValue),
    marginOfSafety: isNum(marginOfSafety) ? Math.round(marginOfSafety * 10) / 10 : null,
    upside: isNum(upside) ? Math.round(upside * 10) / 10 : null,
    methods: methods.map(m => ({ name: m.name, value: Math.round(m.value) })),
    dispersion: isNum(dispersion) ? Math.round(dispersion * 100) / 100 : null,
    confidence,
    note: confidence === 'low'
      ? '적정가 방식 간 편차가 커 추정 신뢰도가 낮습니다 (참고용)'
      : '',
  };
}

module.exports = { computeFairValue, REQUIRED_RETURN };
