/**
 * ⚖️ 리스크 정량화 · 포지션 사이징 (docs/AI_ENGINE.md §11)
 *
 * 종가 시계열로 결정론 계산:
 *   - 변동성(연율화)  : 일간수익률 표준편차 × √252
 *   - MDD             : 최대 고점→저점 낙폭
 *   - 하방(95%)       : 보유기간 1.65σ 예상 최대 손실폭
 *   - 베타            : 시장(KOSPI) 시계열이 주어지면 cov/var, 없으면 null
 *
 * 포지션 사이징: 변동성↑·신뢰도↓·가치함정이면 비중을 줄인다(포트 X% 이내).
 * 데이터 부족하면 null 반환(엔진처럼 정직하게).
 */

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r1 = (x) => Math.round(x * 10) / 10;

function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
function dailyReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) out.push(closes[i] / closes[i - 1] - 1);
  }
  return out;
}
function maxDrawdown(closes) {
  let peak = closes[0], mdd = 0;
  for (const p of closes) {
    if (p > peak) peak = p;
    if (peak > 0) mdd = Math.min(mdd, p / peak - 1);
  }
  return Math.abs(mdd); // 0~1
}
function beta(stockRets, marketRets) {
  const n = Math.min(stockRets.length, marketRets.length);
  if (n < 20) return null;
  const s = stockRets.slice(-n), m = marketRets.slice(-n);
  const ms = mean(s), mm = mean(m);
  let cov = 0, varm = 0;
  for (let i = 0; i < n; i++) { cov += (s[i] - ms) * (m[i] - mm); varm += (m[i] - mm) ** 2; }
  return varm > 0 ? cov / varm : null;
}

/**
 * @param {object} p
 * @param {number[]} p.closes - 종가 시계열(최근순 아님, 시간순 오름차순 가정)
 * @param {number[]} [p.marketCloses] - 시장(KOSPI) 종가 시계열
 * @param {number} [p.confidence=60] - 엔진 신뢰도(0~100)
 * @param {boolean} [p.valueTrap=false]
 * @param {number} [p.holdingMonths=6]
 */
function computeRisk({ closes, marketCloses, confidence = 60, valueTrap = false, holdingMonths = 6 } = {}) {
  if (!Array.isArray(closes) || closes.length < 20) {
    return null; // 표본 부족 → 리스크 산출 불가
  }
  const rets = dailyReturns(closes);
  if (rets.length < 15) return null;

  const dVol = stdev(rets);
  const annVol = dVol * Math.sqrt(252) * 100;          // 연율화 변동성 %
  const mdd = maxDrawdown(closes) * 100;               // 최대낙폭 %
  const holdVol = dVol * Math.sqrt(21 * holdingMonths); // 보유기간 변동성
  const downside95 = 1.65 * holdVol * 100;             // 95% 신뢰 하방 손실폭 %

  let b = null;
  if (Array.isArray(marketCloses) && marketCloses.length >= 20) {
    b = beta(rets, dailyReturns(marketCloses));
  }

  // ── 포지션 사이징 (결정론) ──
  const BASE = 10;          // 단일 종목 최대 권장 비중(%)
  const TARGET_VOL = 30;    // 기준 변동성(%)
  const volAdj = clamp(TARGET_VOL / Math.max(annVol, TARGET_VOL), 0.3, 1); // 변동성↑ → 비중↓
  const confAdj = clamp(confidence / 100, 0.4, 1);                          // 신뢰도↓ → 비중↓
  let pos = BASE * volAdj * confAdj;
  if (valueTrap) pos *= 0.5;                                                // 가치함정 → 절반
  const positionSizePct = clamp(Math.round(pos), 1, BASE);

  const riskGrade = annVol < 25 ? '낮음' : annVol < 40 ? '보통' : annVol < 60 ? '높음' : '매우 높음';

  return {
    volatility: r1(annVol),
    mdd: r1(mdd),
    downside: r1(downside95),
    beta: b !== null ? r1(b) : null,
    positionSizePct,
    riskGrade,
    holdingMonths,
    note: `최근 ${closes.length}거래일 기준. 하방은 보유 ${holdingMonths}개월·95% 신뢰 추정`,
  };
}

module.exports = { computeRisk };
