/**
 * 📊 점수 엔진 (Score Engine) — docs/AI_ENGINE.md 구현
 *
 * 철학: 객관(점수 엔진) + 해석(AI) 하이브리드.
 *   - 숫자로 되는 판단은 여기(규칙)에서 투명하게 → 추천·신뢰도·팩터점수
 *   - 맥락·해석은 AI가 (이 결과를 받아서 사람 말로)
 *
 * 핵심 원칙:
 *   - 신뢰도 = 진짜 측정값(팩터 일치도 + 데이터 충실도). 가짜 숫자 금지.
 *   - 데이터 없는 팩터는 채점에서 제외하고 신뢰도를 정직하게 깎음.
 *   - 수급은 절대 금액이 아니라 시총 대비 %로 정규화(수급 착시 방지).
 *   - 함정 가드: 떨어지는 칼날 / 밸류트랩.
 *
 * 이 모듈은 순수 함수다. 입력이 없으면 null 팩터로 처리하고 절대 던지지 않는다.
 */

const { computeFairValue } = require('./valuation');
const { computeConfidence } = require('./confidence');

// ── 보수 vs 공격: 같은 데이터, 다른 가중치 (AI_ENGINE.md §3) ──────────
const WEIGHTS = {
  conservative: { value: 1.6, quality: 1.5, growth: 1.0, technical: 0.7, supply: 1.0, catalyst: 1.0 },
  aggressive:   { value: 0.8, quality: 1.0, growth: 1.5, technical: 1.6, supply: 1.5, catalyst: 1.0 },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isNum = (v) => typeof v === 'number' && isFinite(v);

/**
 * 팩터 결과 헬퍼.
 * score: -2 ~ +2 (없으면 null), label: 사람이 읽을 한 줄, detail: 근거 수치
 */
function factor(key, name, score, label, detail) {
  const available = isNum(score);
  return {
    key,
    name,
    score: available ? clamp(Math.round(score), -2, 2) : null,
    available,
    label: label || (available ? '' : '데이터 없음'),
    detail: detail || '',
  };
}

// ── ① 밸류에이션 — "싼가?" ────────────────────────────────────────────
// 핵심은 적정가 대비 안전마진(MOS, B-1). 적정가 없으면 PER·PBR로 폴백.
function scoreValuation({ per, pbr, peg, dividendYield, sectorPer, fairValue, marginOfSafety, upside, fairValueConfidence }) {
  // 적정가가 계산됐으면 안전마진을 주 근거로 (설계문서 B-1: 안전마진 가중 50%)
  if (isNum(fairValue) && isNum(marginOfSafety)) {
    let s;
    const mos = marginOfSafety;
    if (mos >= 30) s = 2;
    else if (mos >= 10) s = 1;
    else if (mos > -10) s = 0;
    else if (mos > -30) s = -1;
    else s = -2;

    const gap = isNum(upside) ? upside : mos; // 표시용 상승여력
    const bits = [`적정가 ${fairValue.toLocaleString()}원 (적정가까지 ${gap >= 0 ? '+' : ''}${gap.toFixed(0)}%)`];

    // PER·PBR로 보조 보정 (적정가가 주, ±1 범위 내에서만 미세 조정)
    let adj = 0;
    if (isNum(per) && per > 0) {
      const ref = isNum(sectorPer) && sectorPer > 0 ? sectorPer : 12;
      if (per / ref <= 0.7) { adj += 0.5; bits.push(`PER ${per.toFixed(1)} (기준 대비 저렴)`); }
      else if (per / ref >= 1.4) { adj -= 0.5; bits.push(`PER ${per.toFixed(1)} (기준 대비 비쌈)`); }
      else bits.push(`PER ${per.toFixed(1)}`);
    }
    if (isNum(pbr) && pbr > 0) {
      if (pbr < 1) { adj += 0.5; bits.push(`PBR ${pbr.toFixed(2)} (순자산 이하)`); }
      else if (pbr > 3) { adj -= 0.5; bits.push(`PBR ${pbr.toFixed(2)}`); }
    }
    s = clamp(Math.round(s + adj), -2, 2);

    // 적정가 신뢰도 낮으면 라벨에 명시
    if (fairValueConfidence === 'low') bits.push('적정가 신뢰도 낮음(참고용)');

    const label = s >= 2 ? '저평가' : s >= 1 ? '다소 저평가' : s <= -2 ? '고평가' : s <= -1 ? '다소 고평가' : '적정';
    return factor('value', '밸류에이션', s, label, bits.join(' · '));
  }

  // ── 폴백: 적정가 못 구할 때 PER·PBR 상대 평가 ──
  if (!isNum(per) && !isNum(pbr)) {
    return factor('value', '밸류에이션', null, '데이터 없음 (적정가·PER·PBR 미연동)');
  }
  let s = 0;
  const bits = [];

  if (isNum(per) && per > 0) {
    const ref = isNum(sectorPer) && sectorPer > 0 ? sectorPer : 12; // 섹터평균 없으면 시장 통념 12
    const rel = per / ref;
    if (rel <= 0.6) { s += 2; bits.push(`PER ${per.toFixed(1)} (기준 ${ref}의 ${Math.round(rel * 100)}%, 저평가)`); }
    else if (rel <= 0.85) { s += 1; bits.push(`PER ${per.toFixed(1)} (기준 대비 다소 저평가)`); }
    else if (rel >= 1.5) { s -= 2; bits.push(`PER ${per.toFixed(1)} (기준 ${ref}의 ${Math.round(rel * 100)}%, 고평가)`); }
    else if (rel >= 1.15) { s -= 1; bits.push(`PER ${per.toFixed(1)} (다소 고평가)`); }
    else { bits.push(`PER ${per.toFixed(1)} (적정)`); }
  } else if (isNum(per) && per <= 0) {
    s -= 1; bits.push('PER 음수 (적자)');
  }

  if (isNum(pbr) && pbr > 0) {
    if (pbr < 1) { s += 1; bits.push(`PBR ${pbr.toFixed(2)} (순자산 이하)`); }
    else if (pbr > 3) { s -= 1; bits.push(`PBR ${pbr.toFixed(2)} (자산 대비 고평가)`); }
    else bits.push(`PBR ${pbr.toFixed(2)}`);
  }

  if (isNum(peg) && peg > 0) {
    if (peg < 1) { s += 1; bits.push(`PEG ${peg.toFixed(2)} (성장 대비 저렴)`); }
    else if (peg > 2) { s -= 1; bits.push(`PEG ${peg.toFixed(2)} (성장 대비 비쌈)`); }
  }

  if (isNum(dividendYield) && dividendYield >= 3) { s += 1; bits.push(`배당 ${dividendYield.toFixed(1)}%`); }

  const label = s >= 2 ? '저평가' : s >= 1 ? '다소 저평가' : s <= -2 ? '고평가' : s <= -1 ? '다소 고평가' : '적정';
  return factor('value', '밸류에이션', s, label, bits.join(' · '));
}

// ── ② 품질 — "좋은 기업인가?" (버핏 핵심) ─────────────────────────────
// ROE(≈EPS/BPS), 영업이익률, 부채비율, 흑자 지속, FCF
function scoreQuality({ roe, eps, bps, operatingMargin, netMargin, debtRatio }) {
  // ROE 직접 없으면 EPS/BPS로 추정
  let roeVal = roe;
  if (!isNum(roeVal) && isNum(eps) && isNum(bps) && bps > 0) {
    roeVal = (eps / bps) * 100;
  }
  // 마진: 영업이익률 우선, 없으면 순이익률(KIS sale_ntin_rate) 사용
  const margin = isNum(operatingMargin) ? operatingMargin : netMargin;
  const marginLabel = isNum(operatingMargin) ? '영업이익률' : '순이익률';
  if (!isNum(roeVal) && !isNum(margin) && !isNum(debtRatio)) {
    return factor('quality', '품질', null, '데이터 없음 (재무 미연동)');
  }
  let s = 0;
  const bits = [];

  if (isNum(roeVal)) {
    if (roeVal >= 15) { s += 2; bits.push(`ROE ${roeVal.toFixed(0)}% (우수)`); }
    else if (roeVal >= 8) { s += 1; bits.push(`ROE ${roeVal.toFixed(0)}% (양호)`); }
    else if (roeVal < 0) { s -= 2; bits.push(`ROE ${roeVal.toFixed(0)}% (적자)`); }
    else { bits.push(`ROE ${roeVal.toFixed(0)}% (낮음)`); }
  }
  if (isNum(margin)) {
    if (margin >= 10) { s += 1; bits.push(`${marginLabel} ${margin.toFixed(0)}%`); }
    else if (margin < 0) { s -= 1; bits.push(`${marginLabel} 적자`); }
    else { bits.push(`${marginLabel} ${margin.toFixed(0)}%`); }
  }
  if (isNum(debtRatio)) {
    if (debtRatio <= 100) { s += 1; bits.push(`부채비율 ${debtRatio.toFixed(0)}% (건전)`); }
    else if (debtRatio >= 200) { s -= 1; bits.push(`부채비율 ${debtRatio.toFixed(0)}% (높음)`); }
  }

  const label = s >= 2 ? '우량' : s >= 1 ? '양호' : s <= -2 ? '취약' : s <= -1 ? '주의' : '보통';
  return factor('quality', '품질', s, label, bits.join(' · '));
}

// ── ③ 성장 — "크고 있나?" ─────────────────────────────────────────────
function scoreGrowth({ revenueGrowth, earningsGrowth, estimateTrend }) {
  if (!isNum(revenueGrowth) && !isNum(earningsGrowth)) {
    return factor('growth', '성장', null, '데이터 없음 (성장률 미연동)');
  }
  let s = 0;
  const bits = [];
  if (isNum(earningsGrowth)) {
    if (earningsGrowth >= 20) { s += 2; bits.push(`이익성장 ${earningsGrowth.toFixed(0)}%`); }
    else if (earningsGrowth >= 10) { s += 1; bits.push(`이익성장 ${earningsGrowth.toFixed(0)}%`); }
    else if (earningsGrowth < 0) { s -= 2; bits.push(`이익역성장 ${earningsGrowth.toFixed(0)}%`); }
  }
  if (isNum(revenueGrowth)) {
    if (revenueGrowth >= 15) { s += 1; bits.push(`매출성장 ${revenueGrowth.toFixed(0)}%`); }
    else if (revenueGrowth < 0) { s -= 1; bits.push(`매출감소 ${revenueGrowth.toFixed(0)}%`); }
  }
  if (estimateTrend === 'up') { s += 1; bits.push('추정 상향'); }
  else if (estimateTrend === 'down') { s -= 1; bits.push('추정 하향'); }

  const label = s >= 2 ? '고성장' : s >= 1 ? '성장' : s <= -2 ? '역성장' : s <= -1 ? '둔화' : '정체';
  return factor('growth', '성장', s, label, bits.join(' · '));
}

// ── ④ 모멘텀·기술 — "흐름은?" ─────────────────────────────────────────
// QuantAnalysis.js의 0~100 종합점수 + 보조 신호. 시장 대비 상대강도(있으면).
function scoreTechnical({ quantScore, rsi, macdSignal, relativeStrength, pricePosition }) {
  if (!isNum(quantScore) && !isNum(rsi) && !macdSignal) {
    return factor('technical', '모멘텀·기술', null, '데이터 없음 (차트 부족)');
  }
  let s = 0;
  const bits = [];

  if (isNum(quantScore)) {
    // 0~100 → -2~+2 매핑 (50 중립)
    if (quantScore >= 70) s += 2;
    else if (quantScore >= 58) s += 1;
    else if (quantScore <= 30) s -= 2;
    else if (quantScore <= 42) s -= 1;
    bits.push(`기술점수 ${quantScore}/100`);
  } else {
    // quantScore 없을 때 RSI/MACD로 보조 채점
    if (isNum(rsi)) {
      if (rsi <= 30) s += 1;
      else if (rsi >= 70) s -= 1;
    }
    if (macdSignal === '골든크로스') s += 1;
    else if (macdSignal === '데드크로스') s -= 1;
  }

  if (isNum(rsi)) bits.push(`RSI ${Math.round(rsi)}`);
  if (macdSignal && macdSignal !== '횡보') bits.push(`MACD ${macdSignal}`);
  if (isNum(relativeStrength)) {
    if (relativeStrength > 0) { s += 1; bits.push(`시장 대비 +${relativeStrength.toFixed(1)}%p (아웃퍼폼)`); }
    else { s -= 0; bits.push(`시장 대비 ${relativeStrength.toFixed(1)}%p`); }
  }

  const label = s >= 2 ? '강세' : s >= 1 ? '상승' : s <= -2 ? '약세' : s <= -1 ? '하락' : '중립';
  return factor('technical', '모멘텀·기술', s, label, bits.join(' · '));
}

// ── ⑤ 수급 — "큰손이 사나?" (시총 대비 정규화) ────────────────────────
// supply.monthly.total(억원), marketCap(원). 시총 대비 %로 정규화 → 착시 방지.
function scoreSupply({ monthlyTotalEok, weeklyTotalEok, marketCap, shortRatio }) {
  if (!isNum(monthlyTotalEok) && !isNum(weeklyTotalEok)) {
    return factor('supply', '수급', null, '데이터 없음');
  }
  let s = 0;
  const bits = [];

  const net = isNum(monthlyTotalEok) ? monthlyTotalEok : weeklyTotalEok;
  const period = isNum(monthlyTotalEok) ? '월간' : '주간';

  if (isNum(marketCap) && marketCap > 0) {
    const netWon = net * 1e8;            // 억원 → 원
    const pct = (netWon / marketCap) * 100; // 시총 대비 %
    if (pct >= 1.0) { s += 2; bits.push(`${period} 순매수 시총 대비 +${pct.toFixed(2)}% (강한 매집)`); }
    else if (pct >= 0.3) { s += 1; bits.push(`${period} 순매수 시총 대비 +${pct.toFixed(2)}%`); }
    else if (pct <= -1.0) { s -= 2; bits.push(`${period} 순매도 시총 대비 ${pct.toFixed(2)}% (대량 이탈)`); }
    else if (pct <= -0.3) { s -= 1; bits.push(`${period} 순매도 시총 대비 ${pct.toFixed(2)}%`); }
    else bits.push(`${period} 수급 중립 (시총 대비 ${pct.toFixed(2)}%)`);
  } else {
    // 시총 모를 때: 절대 금액으로 약하게만 (착시 위험 → 점수 폭 제한)
    if (net >= 10000) { s += 1; bits.push(`${period} 순매수 ${net.toFixed(0)}억 (시총 미반영)`); }
    else if (net <= -10000) { s -= 1; bits.push(`${period} 순매도 ${net.toFixed(0)}억 (시총 미반영)`); }
    else bits.push(`${period} 수급 ${net.toFixed(0)}억`);
  }

  if (isNum(shortRatio) && shortRatio >= 5) { s -= 1; bits.push(`공매도 비중 ${shortRatio.toFixed(1)}%`); }

  const label = s >= 2 ? '강한 매집' : s >= 1 ? '매수 우위' : s <= -2 ? '대량 이탈' : s <= -1 ? '매도 우위' : '중립';
  return factor('supply', '수급', s, label, bits.join(' · '));
}

// ── ⑥ 심리·촉매 — "이벤트?" ───────────────────────────────────────────
function scoreCatalyst({ newsSentiment, newsCount, earningsSurprise, estimateRevision, upcomingCatalyst }) {
  if (!newsSentiment && !isNum(earningsSurprise) && !estimateRevision) {
    return factor('catalyst', '심리·촉매', null, '데이터 없음');
  }
  let s = 0;
  const bits = [];

  // '긍정' / '긍정적' / '매우 긍정적' / 'positive' 등 모두 인식. '매우'면 +2.
  const sent = String(newsSentiment || '');
  const isPos = sent.includes('긍정') || sent.toLowerCase().includes('positive');
  const isNeg = sent.includes('부정') || sent.toLowerCase().includes('negative');
  const strong = sent.includes('매우');
  if (isPos) { s += strong ? 2 : 1; bits.push(`뉴스 ${strong ? '매우 ' : ''}긍정${isNum(newsCount) ? ` ${newsCount}건` : ''}`); }
  else if (isNeg) { s -= strong ? 2 : 1; bits.push(`뉴스 ${strong ? '매우 ' : ''}부정${isNum(newsCount) ? ` ${newsCount}건` : ''}`); }
  else if (newsSentiment) bits.push('뉴스 중립');

  if (isNum(earningsSurprise)) {
    if (earningsSurprise > 0) { s += 1; bits.push(`실적 서프라이즈 +${earningsSurprise.toFixed(0)}%`); }
    else if (earningsSurprise < 0) { s -= 1; bits.push(`실적 쇼크 ${earningsSurprise.toFixed(0)}%`); }
  }
  if (estimateRevision === 'up') { s += 1; bits.push('추정 상향'); }
  else if (estimateRevision === 'down') { s -= 1; bits.push('추정 하향'); }
  if (upcomingCatalyst) bits.push(`예정: ${upcomingCatalyst}`);

  const label = s >= 2 ? '강한 호재' : s >= 1 ? '호재' : s <= -2 ? '강한 악재' : s <= -1 ? '악재' : '중립';
  return factor('catalyst', '심리·촉매', s, label, bits.join(' · '));
}

// ── 함정 가드 (AI_ENGINE.md §7) ───────────────────────────────────────
function detectGuards({ factors, marginOfSafety, supplyScore, qualityScore, technicalScore }) {
  const guards = [];

  // 떨어지는 칼날: 깊은 할인 + (수급 이탈 OR 기술 약세)
  if (isNum(marginOfSafety) && marginOfSafety > 30) {
    const bleeding = (isNum(supplyScore) && supplyScore < 0) || (isNum(technicalScore) && technicalScore < 0);
    if (bleeding) {
      guards.push({
        key: 'falling_knife',
        triggered: true,
        text: `떨어지는 칼날 경계: 고점 대비 ${marginOfSafety.toFixed(0)}% 하락이지만 ${isNum(supplyScore) && supplyScore < 0 ? '수급 이탈' : '기술 약세'} 동반 — 저점 확인 전 분할 진입 권장`,
        penalty: -2,
      });
    } else {
      guards.push({ key: 'falling_knife', triggered: false, text: `깊은 할인(${marginOfSafety.toFixed(0)}%)이나 수급·기술이 받쳐줌 (칼날 아님)`, penalty: 0 });
    }
  }

  // 밸류트랩: 싸지만(밸류 +) 품질 나쁨(품질 -) → 가치 점수 무효화
  const valueF = factors.find(f => f.key === 'value');
  if (valueF && isNum(valueF.score) && valueF.score > 0 && isNum(qualityScore) && qualityScore < 0) {
    guards.push({
      key: 'value_trap',
      triggered: true,
      text: '밸류트랩 경계: 싸 보이지만 품질(ROE·부채)이 받쳐주지 않음 — 가치 점수 신뢰 하향',
      penalty: -2,
    });
  }

  return guards;
}

// ── 종합 점수 → 추천 (AI_ENGINE.md §4) ────────────────────────────────
function toRecommendation(weightedScore, isHolding) {
  // weightedScore: 가중 합을 -100~+100 정규화한 값
  if (weightedScore >= 40) return isHolding ? '추가매수' : '매수';
  if (weightedScore >= 15) return isHolding ? '보유' : '관심';
  if (weightedScore > -15) return isHolding ? '보유' : '관망';
  if (weightedScore > -40) return isHolding ? '일부매도' : '관망';
  return isHolding ? '전량매도' : '관망';
}

/**
 * 메인 진입점.
 * @param {object} input - 정규화된 종목 데이터 (아래 buildEngineInput로 만들면 편함)
 * @param {'conservative'|'aggressive'} mode
 * @returns {object} 점수 엔진 결과 (추천·신뢰도·팩터별 점수·가드·근거)
 */
function runScoreEngine(input = {}, mode = 'conservative') {
  const w = WEIGHTS[mode] || WEIGHTS.conservative;

  const factors = [
    scoreValuation(input.valuation || {}),
    scoreQuality(input.quality || {}),
    scoreGrowth(input.growth || {}),
    scoreTechnical(input.technical || {}),
    scoreSupply(input.supply || {}),
    scoreCatalyst(input.catalyst || {}),
  ];

  const wmap = { value: w.value, quality: w.quality, growth: w.growth, technical: w.technical, supply: w.supply, catalyst: w.catalyst };

  // 가중 점수 (있는 팩터만)
  let weightedSum = 0, weightSum = 0;
  for (const f of factors) {
    if (!f.available) continue;
    const fw = wmap[f.key] || 1;
    weightedSum += f.score * fw;
    weightSum += fw;
  }
  // 가용 팩터의 가중 평균을 -2~+2 → -100~+100 으로
  const avg = weightSum > 0 ? weightedSum / weightSum : 0;
  let normScore = (avg / 2) * 100;

  // 함정 가드 적용 (점수 보정)
  const supplyScore = factors.find(f => f.key === 'supply')?.score;
  const qualityScore = factors.find(f => f.key === 'quality')?.score;
  const technicalScore = factors.find(f => f.key === 'technical')?.score;
  const guards = detectGuards({
    factors,
    marginOfSafety: input.marginOfSafety,
    supplyScore, qualityScore, technicalScore,
  });
  const guardPenalty = guards.filter(g => g.triggered).reduce((a, g) => a + (g.penalty || 0), 0);
  normScore = clamp(normScore + guardPenalty * 8, -100, 100); // 가드 1건당 약 8점

  // ── 신뢰도 정식 산출 (AI_ENGINE.md §6): 커버리지·일치도·과거적중률 ──
  const avail = factors.filter(f => f.available);
  const conf = computeConfidence(factors, {
    trackRecord: isNum(input.trackRecord) ? input.trackRecord : 0.5, // P8 백테스트 전 중립
    confidencePenalty: guards.some(g => g.triggered) ? 12 : 0,
  });
  const confidence = conf.confidence;

  const recommendation = toRecommendation(normScore, !!input.isHolding);

  // 진행방향 정렬된 근거 (큰 절댓값 팩터 우선)
  const evidence = avail
    .filter(f => f.score !== 0)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .map(f => `${f.name}: ${f.label}${f.detail ? ` — ${f.detail}` : ''}`);

  return {
    mode,
    recommendation,
    score: Math.round(normScore),        // -100 ~ +100
    confidence,                          // 25 ~ 95 (정식 산출)
    confidenceBasis: conf.confidenceBasis,  // 신뢰도 근거 분해 (커버리지/일치도/적중률)
    factors: factors.map(f => ({ ...f, weight: wmap[f.key] })),
    guards,
    dataCompleteness: conf.coverage,
    agreement: conf.agreement,
    evidence,
    missingFactors: factors.filter(f => !f.available).map(f => f.name),
    valuation: input.fairValueResult || null,   // 적정가·안전마진 (프론트 노출용)
    universeRank: input.universeRank || null,   // 유니버스 백분위 (P5-2)
    calendar: input.calendar || null,           // 이벤트 캘린더 D-day (P6)
  };
}

/**
 * 화면/엔드포인트에서 넘어오는 raw stockData를 엔진 입력 형태로 정규화.
 * 빠진 값은 그대로 두면 엔진이 알아서 null 팩터 처리한다.
 */
function buildEngineInput(stockData = {}) {
  const price = stockData.price || stockData.currentPrice || 0;
  const high = stockData.fiftyTwoWeekHigh || 0;
  // 52주 고점 대비 낙폭 — '떨어지는 칼날' 가드 전용 (내재가치 안전마진과는 다름)
  const drawdownFrom52w = high > 0 ? ((high - price) / high) * 100 : null;
  const supply = stockData.supplyAnalysis || {};
  const quant = stockData.quantAnalysis || {};

  // 내재가치 기반 적정가·안전마진 (결정론 계산)
  const fv = computeFairValue({
    price,
    eps: stockData.eps ?? null,
    bps: stockData.bps ?? null,
    roe: stockData.roe ?? null,
    earningsGrowth: stockData.earningsGrowth ?? null,
    sectorPer: stockData.sectorPer ?? null,
  });

  return {
    isHolding: !!stockData.portfolioHolding,
    marginOfSafety: drawdownFrom52w,   // 가드용 낙폭
    fairValueResult: fv,               // runScoreEngine이 결과에 노출
    valuation: {
      per: stockData.per ?? null,
      pbr: stockData.pbr ?? null,
      peg: stockData.peg ?? null,
      dividendYield: stockData.dividendYield ?? null,
      sectorPer: stockData.sectorPer ?? null,
      fairValue: fv.fairValue,
      marginOfSafety: fv.marginOfSafety,   // 내재가치 기반 안전마진 (밸류 팩터 주 근거)
      upside: fv.upside,                   // 표시용 상승여력
      fairValueConfidence: fv.confidence,
    },
    quality: {
      roe: stockData.roe ?? null,
      eps: stockData.eps ?? null,
      bps: stockData.bps ?? null,
      operatingMargin: stockData.operatingMargin ?? null,
      netMargin: stockData.netMargin ?? null,
      debtRatio: stockData.debtRatio ?? null,
    },
    growth: {
      revenueGrowth: stockData.revenueGrowth ?? null,
      earningsGrowth: stockData.earningsGrowth ?? null,
      estimateTrend: stockData.estimateTrend ?? null,
    },
    technical: {
      quantScore: quant.score ?? null,
      rsi: quant.rsi ?? null,
      macdSignal: quant.macdSignal ?? null,
      relativeStrength: stockData.relativeStrength ?? null,
      pricePosition: stockData.pricePosition ?? null,
    },
    supply: {
      monthlyTotalEok: supply.monthly?.total ?? null,
      weeklyTotalEok: supply.weekly?.total ?? null,
      marketCap: stockData.marketCap ?? null,
      shortRatio: stockData.shortRatio ?? null,
    },
    catalyst: {
      newsSentiment: stockData.newsSentiment ?? null,
      newsCount: stockData.newsCount ?? null,
      earningsSurprise: stockData.earningsSurprise ?? null,
      estimateRevision: stockData.estimateRevision ?? null,
      upcomingCatalyst: stockData.upcomingCatalyst ?? null,
    },
  };
}

/**
 * 정량 × 정성 교차검증 (AI_ENGINE.md §5) — 결정론 코드.
 * 정량 품질(숫자)과 정성 사업가치(AI 판단)를 교차해 가치함정 등을 가른다.
 * 정성은 결론을 뒤집지 못하고 '판정·경고'에만 관여한다(설계 원칙).
 *
 * @param {number|null} qualityScore - 품질 팩터 점수(-2~+2)
 * @param {'강'|'중'|'약'|'판단보류'|null} bizStrength - AI 사업가치 종합
 * @returns {{verdict:string, valueTrap:boolean, text:string, confidencePenalty:number}}
 */
function crossCheckBusinessValue(qualityScore, bizStrength) {
  const q = isNum(qualityScore)
    ? (qualityScore >= 1 ? 'high' : qualityScore <= -1 ? 'low' : 'mid')
    : 'unknown';
  const biz = bizStrength === '강' ? 'strong'
            : bizStrength === '약' ? 'weak'
            : bizStrength === '중' ? 'mid'
            : 'unknown';

  // 정성·정량 중 하나라도 모르면 교차검증 보류
  if (q === 'unknown' || biz === 'unknown') {
    return {
      verdict: '판단보류',
      valueTrap: false,
      text: '정량 품질 또는 정성 사업가치 근거가 부족해 교차검증을 보류합니다.',
      confidencePenalty: 0,
    };
  }

  if (q === 'high' && biz === 'strong')
    return { verdict: '진짜 우량', valueTrap: false, text: '재무(정량)와 사업가치(정성)가 모두 강함 — 장기 보유 적합', confidencePenalty: 0 };
  if (q === 'high' && biz === 'weak')
    return { verdict: '가치 함정 경고', valueTrap: true, text: '숫자는 좋아 보이나 사업·해자가 약함 — 싸 보여도 함정일 수 있어 가치 판단 신뢰 하향', confidencePenalty: 12 };
  if (q === 'high' && biz === 'mid')
    return { verdict: '우량', valueTrap: false, text: '재무는 우량, 사업가치는 보통 — 무난하나 해자 확인 필요', confidencePenalty: 0 };
  if (q === 'mid' && biz === 'strong')
    return { verdict: '성장 후보', valueTrap: false, text: '재무는 보통이나 사업·해자가 강함 — 지금 비싸도 워치리스트 대상', confidencePenalty: 0 };
  if (q === 'low' && biz === 'strong')
    return { verdict: '혼조', valueTrap: false, text: '사업은 강하나 재무가 취약 — 재무 개선 확인 전 신중', confidencePenalty: 6 };
  if (q === 'low' && biz === 'weak')
    return { verdict: '회피', valueTrap: true, text: '재무도 사업도 약함 — 회피 권장', confidencePenalty: 12 };

  return { verdict: '중립', valueTrap: false, text: '정량·정성이 뚜렷한 신호를 주지 않음', confidencePenalty: 0 };
}

module.exports = {
  runScoreEngine, buildEngineInput, crossCheckBusinessValue, WEIGHTS,
  // 발굴(recommend.js)에서 표현·가드를 통일하기 위해 공유 (B안)
  scoreValuation, scoreQuality, detectGuards, toRecommendation,
};
