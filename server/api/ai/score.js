/**
 * 🧠 점수 엔진 + AI 해석 엔드포인트 (docs/AI_ENGINE.md 구현)
 *
 * 기존 /ai/analyze 와의 차이:
 *   - analyze : AI가 추천·신뢰도·목표가를 전부 "생성"(지어냄)
 *   - score   : 점수 엔진이 추천·신뢰도·팩터점수를 "계산"하고, AI는 그걸 "해석"만
 *
 * 흐름:
 *   1. buildEngineInput → runScoreEngine 으로 객관적 점수/추천/신뢰도/팩터 산출
 *   2. 그 결과 + 매크로/뉴스 맥락을 AI에게 주고 "해석 코멘트"만 요청
 *   3. 엔진 숫자(추천·신뢰도·팩터)는 AI가 못 바꾸게 그대로 반환
 *
 * 기존 analyze.js 는 건드리지 않는다. 나란히 두고 비교 후 교체 판단.
 */

const Groq = require('groq-sdk');
const { runScoreEngine, buildEngineInput, crossCheckBusinessValue } = require('../../lib/scoreEngine');
const { getMacroForAI, getNewsForAI, getSupplyForAI } = require('../macro/context');
const { getUniverseDistribution } = require('../../lib/universeCache');
const { rankStock } = require('../../lib/universe');
const { buildCalendar } = require('../../lib/calendar');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 목표가/손절가는 추천 강도에 따라 규칙으로 계산 (AI가 지어내지 않음)
function priceTargets(price, recommendation, mode) {
  const up = {
    매수: mode === 'aggressive' ? 0.15 : 0.10,
    추가매수: mode === 'aggressive' ? 0.15 : 0.10,
    관심: 0.07,
    보유: 0.07,
    관망: 0.05,
    일부매도: 0.03,
    전량매도: 0.0,
  }[recommendation] ?? 0.07;
  const down = mode === 'aggressive' ? 0.08 : 0.10; // 손절 폭
  return {
    targetPrice: Math.round(price * (1 + up)),
    stopLoss: Math.round(price * (1 - down)),
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const mode = req.query.type || req.body.type || 'conservative';
  const stockData = req.body || {};
  const price = stockData.price || stockData.currentPrice || 0;

  // 1) 점수 엔진 — 객관적 계산 (+ 유니버스 백분위 랭킹 주입)
  const input = buildEngineInput(stockData);
  try {
    const dist = await getUniverseDistribution();
    if (dist) input.universeRank = rankStock({ per: stockData.per, pbr: stockData.pbr, marketCap: stockData.marketCap }, dist);
  } catch (_) { /* 분포 없으면 랭킹 생략 */ }
  // 이벤트 캘린더 (DART 결산월·배당으로 D-day 추정)
  const dp = stockData.dartProfile;
  input.calendar = buildCalendar({
    settleMonth: dp?.settleMonth,
    hasDividend: !!(dp?.dividend && (dp.dividend.payoutRatio || dp.dividend.yieldRate)),
  });
  const engine = runScoreEngine(input, mode);
  const base = priceTargets(price, engine.recommendation, mode);
  // 목표가: 적정가가 신뢰가능하게 계산됐으면 그것을, 아니면 추천강도 기반 폴백
  const fv = engine.valuation;
  const useFair = fv && Number.isFinite(fv.fairValue) && (fv.confidence === 'high' || fv.confidence === 'medium');
  const targetPrice = useFair ? fv.fairValue : base.targetPrice;
  const stopLoss = base.stopLoss;

  // 2) 맥락 수집 (AI 해석 재료)
  let macroSection = '';
  try {
    const [{ text: macroText }, newsText, marketSupplyText] = await Promise.all([
      getMacroForAI(), getNewsForAI(), getSupplyForAI(),
    ]);
    macroSection = [macroText, newsText, marketSupplyText].filter(Boolean).join('\n\n');
  } catch (_) { /* 맥락 없으면 엔진 결과만으로 해석 */ }

  // 3) 엔진 결과를 AI가 "해석"하도록 (숫자 생성 금지)
  const factorLines = engine.factors
    .map(f => f.available
      ? `- ${f.name}: ${f.score >= 0 ? '+' : ''}${f.score} (${f.label})${f.detail ? ` — ${f.detail}` : ''}`
      : `- ${f.name}: 데이터 없음`)
    .join('\n');
  const guardLines = engine.guards.length
    ? engine.guards.map(g => `- ${g.triggered ? '⚠ ' : ''}${g.text}`).join('\n')
    : '- 특이 함정 신호 없음';

  const engineBlock = `[점수 엔진 결과 — 이 숫자는 확정값이며 바꾸지 말 것]
종목: ${stockData.name || ''}
관점: ${mode === 'aggressive' ? '공격(모멘텀)' : '보수(가치)'}
종합 추천: ${engine.recommendation}
종합 점수: ${engine.score} (-100~+100)
신뢰도: ${engine.confidence}% (팩터 일치도 ${engine.agreement}%, 데이터 충실도 ${engine.dataCompleteness}%)
${fv && Number.isFinite(fv.fairValue)
  ? `적정가(코드 계산): ${fv.fairValue.toLocaleString()}원 / 안전마진: ${fv.marginOfSafety >= 0 ? '+' : ''}${fv.marginOfSafety}% (산출방식: ${fv.methods.map(m => m.name).join('·')}, 신뢰도 ${fv.confidence})`
  : `적정가: ${fv?.note || '추정 불가'}`}
${engine.missingFactors.length ? `미연동 팩터: ${engine.missingFactors.join(', ')} (신뢰도에 정직하게 반영됨)` : ''}
${engine.universeRank && engine.universeRank.items.length
  ? `유니버스 상대 위치(전종목 ${engine.universeRank.universeSize}개 대비): ${engine.universeRank.items.map(i => i.label).join(' · ')}${engine.universeRank.valueSummary ? ` → ${engine.universeRank.valueSummary}` : ''}`
  : ''}
${engine.calendar && engine.calendar.length
  ? `다가오는 일정(추정): ${engine.calendar.map(e => `${e.event} D-${e.dday}(${e.date})`).join(' · ')}`
  : ''}

[팩터별 점수]
${factorLines}

[함정 가드]
${guardLines}
${macroSection ? `\n[시장 맥락]\n${macroSection}` : ''}

[정성 평가 근거 자료]
업종/섹터: ${stockData.sector || '미상'}
${(() => {
  const dp = stockData.dartProfile;
  if (!dp) return 'DART 공시 정보: (미연동)';
  const div = dp.dividend
    ? `배당성향 ${dp.dividend.payoutRatio ?? '?'}% · 시가배당률 ${dp.dividend.yieldRate ?? '?'}% (${dp.dividend.year}년)`
    : '배당 내역 없음/미상';
  return `DART 공시 사실: ${dp.corpName || ''} · 설립 ${dp.established || '?'}(업력 ${dp.ageYears ?? '?'}년) · ${dp.market || ''} · 대표 ${dp.ceo || '?'} · ${div}`;
})()}
${stockData.dartBusiness?.businessSummary
  ? `DART 사업보고서 발췌(${stockData.dartBusiness.reportName || ''}) — 사업의 개요:\n"${stockData.dartBusiness.businessSummary}"`
  : '사업보고서 발췌: (미연동)'}
종목 관련 뉴스 헤드라인:
${Array.isArray(stockData.newsHeadlines) && stockData.newsHeadlines.length
  ? stockData.newsHeadlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
  : '(종목별 뉴스 없음)'}`;

  const systemPrompt = `당신은 증권사 리서치센터의 애널리스트다. 점수 엔진이 산출한 객관적 결과를 받아 "사람이 이해할 해석"을 작성한다.
절대 규칙:
1. 추천(${engine.recommendation})·신뢰도(${engine.confidence}%)·팩터 점수는 엔진이 정한 확정값이다. 절대 다른 값으로 바꾸거나 반박하지 말 것.
2. 너의 역할은 "왜 이 점수가 나왔는지, 지금 투자자가 무엇을 해야 하는지"를 팩터 점수와 시장 맥락으로 설명하는 것이다.
3. 미연동 팩터가 있으면 "해당 부분은 데이터 미반영"이라고 정직하게 언급할 것. 없는 데이터를 지어내지 말 것.
4. 시장 뉴스/매크로 중 이 종목·섹터와 관련된 게 있으면 구체적으로 연결할 것.
5. 말투: 증권사 리포트의 정중한 존댓말(~입니다/~습니다). 반말·축약 금지. 한글만.
6. JSON 외 텍스트 출력 금지.

[사업가치(정성) 평가 — 근거 기반 판단]
A. "정성 평가 근거 자료"의 DART 사업보고서 발췌(사업의 개요)·뉴스 헤드라인·DART 공시 사실(설립/업력/시장/배당)·업종, 그리고 그 기업에 일반적으로 알려진 사실은 모두 정당한 1차 근거다. 특히 사업보고서 발췌가 있으면 사업모델·해자 판단의 핵심 근거로 우선 활용하라.
B. 각 판단의 evidence에는 근거로 삼은 사업보고서 문구·헤드라인·DART 사실·업종 특성을 구체적으로 인용한다. (예: "사업보고서상 DRAM·NAND 중심 메모리 반도체 기업", "업력 59년·배당성향 27.7%로 안정적")
C. "판단보류"는 해당 항목과 관련된 정보가 제공 자료에 전혀 없을 때만 쓴다. 정보가 일부라도 있으면 보수적으로라도 강/중/약을 판단하라.
D. 단, 제공되지 않은 구체적 수치(시장점유율 X% 등)를 임의로 지어내지 말 것. 모르면 정성적 표현으로만 서술한다.

[양면 의무 — Bull/Bear]
E. bullBear는 필수다. 강세 논리 3개·약세 논리 2개를 반드시 채운다. 추천이 매수든 매도든 양쪽을 모두 제시한다(한쪽만 쓰지 말 것).
F. 약세 논리(bear)는 "이 전제가 깨지면 투자 논리가 무너지는" 핵심 리스크여야 한다. 막연한 일반론 금지, 이 종목의 팩터·밸류·사업가치에 근거할 것.`;

  const userContent = `${engineBlock}

위 엔진 결과를 해석하여 JSON으로만 답하라:
{
  "headline": "지금 이 종목의 핵심을 한 문장으로 (추천 근거 요약, 40자 내외)",
  "interpretation": "팩터 점수들이 무엇을 의미하는지, 왜 이런 추천인지 2~3문장 해석. 가장 강한 팩터와 약한 팩터를 짚을 것.",
  "actionPlan": "지금 투자자가 취할 구체적 행동 (진입/분할/관망/매도 방식). 1~2문장.",
  "watchOut": "주의할 리스크나 확인이 필요한 지점 1문장. 미연동 팩터가 있으면 여기서 언급.",
  "macroLink": "시장 맥락(매크로/뉴스)과의 연결. 관련 없으면 빈 문자열.",
  "businessValue": {
    "moat": { "level": "강|중|약|판단보류", "type": "브랜드|네트워크효과|전환비용|원가우위|무형자산|없음|미상", "evidence": "근거(인용/사실) 또는 '근거 부족'" },
    "industry": { "trend": "성장|성숙|사양|미상", "position": "산업 내 위치 한 줄", "evidence": "근거 또는 '근거 부족'" },
    "sustainability": { "level": "강|중|약|판단보류", "risk": "주요 지속가능성 리스크 또는 '특이사항 없음'", "evidence": "근거 또는 '근거 부족'" },
    "overall": "강|중|약|판단보류",
    "summary": "이 회사 사업가치를 한 문장으로 (근거 기반, 과장 금지)"
  },
  "bullBear": {
    "bull": ["강세 논리 3개 — 이 종목이 오를 근거(팩터·적정가·유니버스 위치·사업가치 활용)", "", ""],
    "bear": ["약세 논리 2개 — 이 논리가 깨지면 투자 전제가 무너지는 핵심 리스크", ""]
  }
}`;

  let interp = null;
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: mode === 'aggressive' ? 0.6 : 0.4,
      max_tokens: 1300,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });
    let text = completion.choices[0]?.message?.content || '';
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s !== -1 && e !== -1) interp = JSON.parse(text.substring(s, e + 1));
  } catch (error) {
    console.error('score AI interp error:', error.message);
  }

  // 4) 정량 × 정성 교차검증 (코드 — 결정론). AI의 사업가치 판단을 품질 점수와 교차.
  const businessValue = interp?.businessValue || null;
  const qualityScore = engine.factors.find(f => f.key === 'quality')?.score ?? null;
  const crossCheck = crossCheckBusinessValue(qualityScore, businessValue?.overall);
  // 정성은 결론을 뒤집지 못하고 신뢰도만 보정 (가치함정 등)
  const finalConfidence = Math.max(25, engine.confidence - crossCheck.confidencePenalty);

  // 5) 엔진 숫자 + AI 해석 결합 (숫자는 항상 엔진 것)
  res.status(200).json({
    engine: {
      recommendation: engine.recommendation,
      score: engine.score,
      confidence: finalConfidence,
      confidenceBasis: engine.confidenceBasis,  // 신뢰도 근거 분해(커버리지/일치도/적중률)
      agreement: engine.agreement,
      dataCompleteness: engine.dataCompleteness,
      factors: engine.factors,        // 팩터별 점수/라벨/근거 (UI 막대용)
      guards: engine.guards,
      evidence: engine.evidence,
      missingFactors: engine.missingFactors,
      valuation: engine.valuation,    // 적정가·안전마진·산출방식 (UI 적정가 카드용)
      businessValue,                  // 정성 사업가치(AI, 근거인용) — 해자·산업·지속성
      crossCheck,                     // 정량×정성 교차검증 판정(가치함정 등)
      universeRank: engine.universeRank,  // 유니버스 백분위(밸류·규모 상대 위치)
      bullBear: interp?.bullBear || null, // 강세/약세 양면 논리
      calendar: engine.calendar,          // 이벤트 캘린더 D-day (P6)
    },
    targetPrice,
    stopLoss,
    holdingPeriod: mode === 'aggressive' ? '1~3개월' : '6개월~1년',
    interpretation: interp || {
      headline: `${engine.recommendation} · 신뢰도 ${engine.confidence}%`,
      interpretation: engine.evidence.slice(0, 3).join(' / ') || '데이터가 부족하여 해석을 생성하지 못했습니다.',
      actionPlan: engine.recommendation === '매수' || engine.recommendation === '추가매수' ? '분할 매수로 접근하십시오.' : '관망하며 신호를 확인하십시오.',
      watchOut: engine.missingFactors.length ? `${engine.missingFactors.join(', ')} 데이터가 미반영되어 신뢰도가 제한적입니다.` : '',
      macroLink: '',
    },
  });
};
