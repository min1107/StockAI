const Groq = require('groq-sdk');
const { getMacroForAI, getNewsForAI, getSupplyForAI } = require('../macro/context');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { holdings } = req.body;
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return res.status(400).json({ error: '보유종목이 없습니다' });
  }

  const totalCost  = holdings.reduce((s, h) => s + h.avgPrice * h.shares, 0);
  const totalEval  = holdings.reduce((s, h) => s + (h.currentPrice ?? h.avgPrice) * h.shares, 0);
  const totalPnl   = totalEval - totalCost;
  const totalRate  = totalCost > 0 ? (totalPnl / totalCost * 100) : 0;

  const holdingSummary = holdings.map(h => {
    const evalVal = (h.currentPrice ?? h.avgPrice) * h.shares;
    const rate    = h.currentPrice
      ? ((h.currentPrice - h.avgPrice) / h.avgPrice * 100)
      : 0;
    const weight  = totalEval > 0 ? (evalVal / totalEval * 100) : 0;
    const investedAmt = h.avgPrice * h.shares;
    const pnlAmt  = h.currentPrice ? (h.currentPrice - h.avgPrice) * h.shares : 0;
    return { ...h, rate, weight, investedAmt, pnlAmt, evalVal };
  }).sort((a, b) => b.weight - a.weight);

  const top1Weight = holdingSummary.length > 0 ? holdingSummary[0].weight : 0;
  const top2Weight = holdingSummary.length > 1
    ? holdingSummary[0].weight + holdingSummary[1].weight
    : top1Weight;

  const concentrationRisk = top1Weight > 60 ? '단일종목 집중 위험'
    : top2Weight > 75 ? '상위 2종목 집중 위험'
    : holdings.length <= 2 ? '종목 수 부족 (다양성 낮음)'
    : '적절한 분산';

  const isSingle = holdings.length === 1;

  const dataBlock = `[포트폴리오 현황]
총 매수금액: ₩${Math.round(totalCost).toLocaleString()}
총 평가금액: ₩${Math.round(totalEval).toLocaleString()}
총 손익: ${totalPnl >= 0 ? '+' : ''}₩${Math.round(totalPnl).toLocaleString()} (${totalRate >= 0 ? '+' : ''}${totalRate.toFixed(2)}%)
보유종목: ${holdings.length}개 / 집중도: ${concentrationRisk}

[종목별 현황]
${holdingSummary.map(h =>
  `- ${h.name}(${h.code})
   비중: ${h.weight.toFixed(1)}% / 수익률: ${h.rate >= 0 ? '+' : ''}${h.rate.toFixed(2)}%
   매입가: ₩${h.avgPrice?.toLocaleString()} × ${h.shares}주 = 투자금 ₩${Math.round(h.investedAmt).toLocaleString()}
   현재가: ₩${h.currentPrice?.toLocaleString() ?? '조회불가'} → 평가손익: ${h.pnlAmt >= 0 ? '+' : ''}₩${Math.round(h.pnlAmt).toLocaleString()}`
).join('\n')}`;

  const [{ text: macroText, signals: macroSignals }, newsText, marketSupplyText] = await Promise.all([
    getMacroForAI(),
    getNewsForAI(),
    getSupplyForAI(),
  ]);
  const macroSection = [
    macroText ? `\n${macroText}${macroSignals.length > 0 ? '\n\n매크로 신호:\n' + macroSignals.map(s => `- ${s}`).join('\n') : ''}` : '',
    newsText ? `\n\n${newsText}` : '',
    marketSupplyText ? `\n\n${marketSupplyText}` : '',
  ].join('');

  const systemPrompt = isSingle
    ? `당신은 개인투자자의 단일 종목 보유 상황을 진단하는 전문 자산관리사다.
규칙:
1. 현재 손익률과 금액을 먼저 직시하고, 이 수준이 심각한지 아닌지 판단하라.
2. 현재 거시경제(환율, 유가, 미국 선물) 맥락이 이 종목에 유리한지 불리한지 구체적으로 연결하라.
3. 행동(추가매수/보유/일부매도/전량매도)을 명확히 제시하고, 구체적인 손절가와 목표가 %를 제시하라.
4. 집중 투자 리스크(한 종목에 전액)를 솔직하게 언급하라.
5. 현재 상황에서 투자자가 가장 먼저 해야 할 행동 1가지를 마지막에 명확히 써라.
6. 절대 금지: 막연한 긍정, "좋아 보입니다", "지켜보세요". 수치 기반 근거 필수.
7. 출력 텍스트 말투: 증권사 리포트 스타일의 정중한 존댓말(~입니다, ~습니다, ~됩니다). 반말·명령형·축약형 절대 금지.
8. 반드시 한글만. JSON 외 텍스트 출력 금지.`
    : `당신은 개인투자자의 포트폴리오를 진단하는 전문 자산관리사다.
규칙:
1. 집중도 리스크, 섹터 편향, 전체 손익 구조를 먼저 파악하라.
2. 현재 거시경제(환율, 유가, 선물)가 포트폴리오에 미치는 영향을 구체적으로 판단하라.
3. 각 종목별 행동을 명확히 제시하고 손절가/목표가 %를 반드시 포함하라.
4. 포트폴리오 전체 관점에서 "지금 당장 해야 할 1가지"를 summary 마지막에 명확히 써라.
5. 절대 금지: 모든 종목 보유 권고, 막연한 분산투자 권고, 수치 없는 조언.
6. 출력 텍스트 말투: 증권사 리포트 스타일의 정중한 존댓말(~입니다, ~습니다, ~됩니다). 반말·명령형·축약형 절대 금지.
7. 반드시 한글만. JSON 외 텍스트 출력 금지.`;

  const userContent = `아래 ${isSingle ? '단일 종목 보유 현황' : '포트폴리오'}을 진단하라.

${dataBlock}${macroSection}

${isSingle
  ? `이 투자자는 한 종목에 전액을 투자하고 있다. 현재 수익률 ${holdingSummary[0].rate.toFixed(2)}%를 직시하고,
지금 이 종목을 계속 보유할 이유와 버려야 할 이유를 각각 데이터로 제시한 뒤 명확한 결론을 내려라.`
  : `먼저 이 포트폴리오의 가장 큰 위험 요소와 강점을 파악하고, 거시경제 환경이 미치는 영향을 판단한 뒤 종목별 구체적 행동을 제시하라.`}

JSON 형식:
{
  "overallRisk": "낮음|중간|높음",
  "summary": "핵심 진단. 현재 상황 직시 + 지금 당장 해야 할 1가지. 250자 내외. 수치 필수.",
  "macroImpact": "현재 거시경제가 이 ${isSingle ? '종목' : '포트폴리오'}에 미치는 영향. 환율/유가/선물 중 가장 관련 높은 것 중심. 120자 내외.",
  "attention": [${isSingle ? '"종목명"' : '"가장 위험하거나 기회인 종목명 최대 2개"'}],
  "items": [
    {
      "code": "종목코드 (숫자만, .KS 제외)",
      "action": "추가매수|보유|일부매도|전량매도",
      "reason": "행동 이유. 수익률/금액 수치 포함. 100자 내외.",
      "targetPct": "목표가 기준 현재가 대비 % (예: +12%)",
      "stopPct": "손절 기준 현재가 대비 % (예: -7%)",
      "urgency": "즉시|1주일내|1개월내|관망"
    }
  ]
}`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.52,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });

    let text = completion.choices[0]?.message?.content || '';
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('JSON 파싱 실패');
    const parsed = JSON.parse(text.substring(start, end + 1));

    res.status(200).json({
      overallRisk: parsed.overallRisk  || '중간',
      summary:     parsed.summary      || '',
      macroImpact: parsed.macroImpact  || '',
      attention:   Array.isArray(parsed.attention) ? parsed.attention : [],
      items:       Array.isArray(parsed.items) ? parsed.items.map(it => ({
        code:      it.code     || '',
        action:    it.action   || '보유',
        reason:    it.reason   || '',
        targetPct: it.targetPct || null,
        stopPct:   it.stopPct   || null,
        urgency:   it.urgency   || null,
      })) : [],
    });
  } catch (error) {
    console.error('포트폴리오 AI 진단 실패:', error.message);

    const fallbackItems = holdingSummary.map(h => {
      const rate = h.rate;
      let action = '보유', reason = '데이터 분석 중입니다.', stopPct = '-7%', targetPct = '+10%';
      if (rate <= -15) { action = '전량매도'; reason = `수익률 ${rate.toFixed(1)}% — 손실 심화, 추가 하락 시 회복 어려움`; stopPct = null; }
      else if (rate <= -7) { action = '일부매도'; reason = `수익률 ${rate.toFixed(1)}% — 손실 구간, 비중 축소 고려`; stopPct = '-10%'; targetPct = '+5%'; }
      else if (rate >= 20) { action = '일부매도'; reason = `수익률 +${rate.toFixed(1)}% — 목표가 근접, 일부 익절 권장`; stopPct = '-5%'; targetPct = '+15%'; }
      return { code: h.code, action, reason, targetPct, stopPct, urgency: '1주일내' };
    });

    res.status(200).json({
      overallRisk: totalRate < -10 ? '높음' : totalRate < 0 ? '중간' : '낮음',
      summary: `포트폴리오 전체 수익률 ${totalRate.toFixed(2)}% (${totalRate >= 0 ? '+' : ''}₩${Math.round(totalPnl).toLocaleString()}). ${concentrationRisk}. AI 서버 응답 지연으로 기본 분석을 제공합니다.`,
      macroImpact: '',
      attention: holdingSummary.filter(h => Math.abs(h.rate) > 10).slice(0, 2).map(h => h.name),
      items: fallbackItems,
    });
  }
};
