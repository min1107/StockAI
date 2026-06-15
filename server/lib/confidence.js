/**
 * 🎯 신뢰도 산출 (docs/AI_ENGINE.md §6) — 결정론 코드.
 *
 * confidence = 0.4·커버리지 + 0.3·신호일치도 + 0.3·과거적중률
 *   - 커버리지   : 사용 가능한 팩터 수 / 전체 (데이터 충실도)
 *   - 신호일치도 : 가용 팩터들이 같은 방향을 가리키는 정도
 *   - 과거적중률 : 이 신호조합의 백테스트 hit-rate. P8 백테스트 전엔 0.5 중립.
 *
 * "모르면 모른다" — track record가 아직 없으므로 신뢰도는 의도적으로 만점 근처에
 * 도달하지 않는다(최대 ~85%). 가치함정 등 가드가 켜지면 추가 하향.
 *
 * 반환에 confidenceBasis(각 구성요소 %)를 포함해 "왜 이 신뢰도인가"를 투명하게 공개.
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r = (x) => Math.round(x);

// 가용 팩터들의 부호 일치도 (0.5 반반 ~ 1 완전일치)
function signalAgreement(factors) {
  const signs = factors
    .filter(f => f.available)
    .map(f => Math.sign(f.score))
    .filter(s => s !== 0);
  if (!signs.length) return 0.5;
  const pos = signs.filter(s => s > 0).length;
  const neg = signs.filter(s => s < 0).length;
  return Math.max(pos, neg) / signs.length;
}

/**
 * @param {object[]} factors - 팩터 배열({available, score})
 * @param {object} opts - { trackRecord(0~1)=0.5, confidencePenalty(0~) , minFloor=25, maxCap=95 }
 */
function computeConfidence(factors, opts = {}) {
  const { trackRecord = 0.5, confidencePenalty = 0, minFloor = 25, maxCap = 95 } = opts;

  const total = factors.length || 1;
  const coverage = factors.filter(f => f.available).length / total; // 0~1
  const agreement = signalAgreement(factors);                        // 0.5~1
  const track = clamp(trackRecord, 0, 1);

  let pct = (0.4 * coverage + 0.3 * agreement + 0.3 * track) * 100;
  pct -= confidencePenalty;
  const confidence = r(clamp(pct, minFloor, maxCap));

  return {
    confidence,
    coverage: r(coverage * 100),
    agreement: r(agreement * 100),
    confidenceBasis: {
      coverage: r(coverage * 100),
      agreement: r(agreement * 100),
      trackRecord: r(track * 100),
      trackRecordNote: trackRecord === 0.5 ? '백테스트 전 중립값(0.5)' : '',
    },
  };
}

module.exports = { computeConfidence, signalAgreement };
