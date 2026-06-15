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
const { runScoreEngine, buildEngineInput } = require('../../lib/scoreEngine');
const { getMacroForAI, getNewsForAI, getSupplyForAI } = require('../macro/context');

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

  // 1) 점수 엔진 — 객관적 계산
  const input = buildEngineInput(stockData);
  const engine = runScoreEngine(input, mode);
  const { targetPrice, stopLoss } = priceTargets(price, engine.recommendation, mode);

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
${engine.missingFactors.length ? `미연동 팩터: ${engine.missingFactors.join(', ')} (신뢰도에 정직하게 반영됨)` : ''}

[팩터별 점수]
${factorLines}

[함정 가드]
${guardLines}
${macroSection ? `\n[시장 맥락]\n${macroSection}` : ''}`;

  const systemPrompt = `당신은 증권사 리서치센터의 애널리스트다. 점수 엔진이 산출한 객관적 결과를 받아 "사람이 이해할 해석"을 작성한다.
절대 규칙:
1. 추천(${engine.recommendation})·신뢰도(${engine.confidence}%)·팩터 점수는 엔진이 정한 확정값이다. 절대 다른 값으로 바꾸거나 반박하지 말 것.
2. 너의 역할은 "왜 이 점수가 나왔는지, 지금 투자자가 무엇을 해야 하는지"를 팩터 점수와 시장 맥락으로 설명하는 것이다.
3. 미연동 팩터가 있으면 "해당 부분은 데이터 미반영"이라고 정직하게 언급할 것. 없는 데이터를 지어내지 말 것.
4. 시장 뉴스/매크로 중 이 종목·섹터와 관련된 게 있으면 구체적으로 연결할 것.
5. 말투: 증권사 리포트의 정중한 존댓말(~입니다/~습니다). 반말·축약 금지. 한글만.
6. JSON 외 텍스트 출력 금지.`;

  const userContent = `${engineBlock}

위 엔진 결과를 해석하여 JSON으로만 답하라:
{
  "headline": "지금 이 종목의 핵심을 한 문장으로 (추천 근거 요약, 40자 내외)",
  "interpretation": "팩터 점수들이 무엇을 의미하는지, 왜 이런 추천인지 2~3문장 해석. 가장 강한 팩터와 약한 팩터를 짚을 것.",
  "actionPlan": "지금 투자자가 취할 구체적 행동 (진입/분할/관망/매도 방식). 1~2문장.",
  "watchOut": "주의할 리스크나 확인이 필요한 지점 1문장. 미연동 팩터가 있으면 여기서 언급.",
  "macroLink": "시장 맥락(매크로/뉴스)과의 연결. 관련 없으면 빈 문자열."
}`;

  let interp = null;
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: mode === 'aggressive' ? 0.6 : 0.4,
      max_tokens: 900,
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

  // 4) 엔진 숫자 + AI 해석 결합 (숫자는 항상 엔진 것)
  res.status(200).json({
    engine: {
      recommendation: engine.recommendation,
      score: engine.score,
      confidence: engine.confidence,
      agreement: engine.agreement,
      dataCompleteness: engine.dataCompleteness,
      factors: engine.factors,        // 팩터별 점수/라벨/근거 (UI 막대용)
      guards: engine.guards,
      evidence: engine.evidence,
      missingFactors: engine.missingFactors,
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
