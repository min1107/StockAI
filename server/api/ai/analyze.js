const Groq = require('groq-sdk');
const { getMacroForAI, getNewsForAI, getSupplyForAI } = require('../macro/context');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const type = req.query.type || req.body.type || 'conservative';
  const stockData = req.body;
  const price = stockData.price || 0;
  const change = stockData.change || 0;
  const holding = stockData.portfolioHolding || null;

  const supply = stockData.supplyAnalysis || {
    daily: { inst: 0, foreign: 0, total: 0 },
    weekly: { inst: 0, foreign: 0, total: 0 },
    monthly: { inst: 0, foreign: 0, total: 0 },
    trend: '중립',
  };
  const quant = stockData.quantAnalysis;
  const fiftyTwoHigh = stockData.fiftyTwoWeekHigh || 0;
  const fiftyTwoLow = stockData.fiftyTwoWeekLow || 0;

  const marginOfSafety = fiftyTwoHigh > 0
    ? (((fiftyTwoHigh - price) / fiftyTwoHigh) * 100).toFixed(1)
    : null;
  const recoveryPotential = fiftyTwoHigh > 0
    ? (((fiftyTwoHigh - price) / price) * 100).toFixed(1)
    : null;
  const priceElasticity = fiftyTwoLow > 0
    ? (((fiftyTwoHigh - fiftyTwoLow) / fiftyTwoLow) * 100).toFixed(1)
    : null;

  const marketCapTier = stockData.marketCap
    ? stockData.marketCap > 50000000000000 ? '대형주(50조+)'
      : stockData.marketCap > 10000000000000 ? '중대형주(10-50조)'
      : stockData.marketCap > 2000000000000 ? '중형주(2-10조)'
      : '소형주(2조미만)'
    : '정보없음';

  // 지표 이상신호 자동 감지 (AI가 주목할 포인트 힌트)
  const signals = [];
  const rsi = quant?.rsi || 50;
  if (rsi <= 30) signals.push(`RSI ${rsi} — 극단적 과매도 (역사적 반등 구간)`);
  else if (rsi >= 70) signals.push(`RSI ${rsi} — 과매수 과열 (단기 조정 경계)`);
  else if (rsi >= 50 && rsi < 60) signals.push(`RSI ${rsi} — 상승 모멘텀 중립 유지`);

  if (quant?.macdSignal === '골든크로스') signals.push('MACD 골든크로스 발생 — 상승 전환 신호');
  else if (quant?.macdSignal === '데드크로스') signals.push('MACD 데드크로스 발생 — 하락 전환 신호');

  if (supply.monthly?.total > 20000) signals.push(`월간 스마트머니 ${supply.monthly.total.toFixed(0)}억 대규모 유입 — 강한 매집 신호`);
  else if (supply.monthly?.total < -20000) signals.push(`월간 스마트머니 ${supply.monthly.total.toFixed(0)}억 대규모 이탈 — 매도 압력 심각`);
  else if (supply.daily?.total > 5000) signals.push(`오늘 수급 ${supply.daily.total.toFixed(0)}억 급격 유입 — 단기 모멘텀 강화`);

  if (parseFloat(marginOfSafety) > 30) signals.push(`고점 대비 ${marginOfSafety}% 하락 — 깊은 가치 구간 진입`);
  else if (parseFloat(marginOfSafety) < 5) signals.push(`고점 대비 ${marginOfSafety}% — 고점 근접, 추가 상승 여력 제한적`);

  // 수급 방향 vs 기술지표 괴리 감지
  const supplyBull = supply.monthly?.total > 0;
  if (supplyBull && rsi > 65) signals.push('수급 유입 + RSI 과매수 — 상승 피로 속 기관 계속 매집 (강세 지속 가능성)');
  if (!supplyBull && rsi < 35) signals.push('수급 이탈 + RSI 과매도 — 기술적 반등 가능하나 수급 개선 선행 필요');

  const signalText = signals.length > 0
    ? `\n⚡ 주목할 신호:\n${signals.map(s => `- ${s}`).join('\n')}`
    : '';

  // 거시경제 + 뉴스 + 수급 맥락 (자동 수집된 최신 데이터)
  const [{ text: macroText, signals: macroSignals }, newsText, marketSupplyText] = await Promise.all([
    getMacroForAI(),
    getNewsForAI(),
    getSupplyForAI(),
  ]);
  const macroSection = [
    macroText ? `\n${macroText}${macroSignals.length > 0 ? '\n\n🌍 매크로 신호:\n' + macroSignals.map(s => `- ${s}`).join('\n') : ''}` : '',
    newsText ? `\n\n${newsText}` : '',
    marketSupplyText ? `\n\n${marketSupplyText}` : '',
  ].join('');

  const holdingSection = holding ? `
💼 보유 현황: ${holding.shares.toLocaleString()}주 / 평균매입가 ${holding.avgPrice.toLocaleString()}원
현재 손익: ${holding.pnl >= 0 ? '+' : ''}${holding.pnl.toLocaleString()}원 (${Number(holding.pnlRate) >= 0 ? '+' : ''}${holding.pnlRate}%)` : '';

  const dataBlock = `[${stockData.name} 실시간 데이터]
가격: ${price.toLocaleString()}원 (${change >= 0 ? '+' : ''}${change.toFixed(2)}%) / ${marketCapTier}
52주: 저 ${fiftyTwoLow.toLocaleString()}원 ~ 고 ${fiftyTwoHigh.toLocaleString()}원
→ 안전마진 ${marginOfSafety ?? 'N/A'}% / 고점회복여력 ${recoveryPotential ?? 'N/A'}% / 연간변동폭 ${priceElasticity ?? 'N/A'}%
현재위치: ${stockData.pricePosition || '정보없음'} / 차트추세: ${stockData.chartTrend || '횡보'}
RSI: ${rsi}(${quant?.rsiStatus || 'N/A'}) / MACD: ${quant?.macdSignal || 'N/A'} / 볼린저: ${quant?.bbPosition || 'N/A'} / 종합점수: ${quant?.score || 'N/A'}
수급(일): 기관 ${supply.daily.inst.toFixed(0)}억 / 외국인 ${supply.daily.foreign.toFixed(0)}억
수급(주): 기관 ${supply.weekly.inst.toFixed(0)}억 / 외국인 ${supply.weekly.foreign.toFixed(0)}억
수급(월): 기관 ${supply.monthly.inst.toFixed(0)}억 / 외국인 ${supply.monthly.foreign.toFixed(0)}억
뉴스 ${stockData.newsCount || 0}건 감성: ${stockData.newsSentiment || '중립'}${holdingSection}${signalText}${macroSection}`;

  let systemPrompt, userContent, temperature, confMin, confMax;

  if (type === 'aggressive') {
    temperature = 0.72;
    confMin = 60; confMax = 92;

    systemPrompt = `당신은 수급과 모멘텀 기반 공격적 투자 전문가다.
규칙:
1. 위의 데이터에서 "지금 이 종목에서 가장 강한 신호 1~2개"를 먼저 파악하라.
2. 그 신호가 서로 확인(confirmation)하는지, 아니면 충돌(divergence)하는지 판단하라.
3. 확인 신호면 강한 매수/매도, 충돌 신호면 조건부 진입이나 관망으로 판단하라.
4. reasons의 각 항목은 서로 다른 각도(수급/기술/가격구조/리스크)에서 작성하되, 수치를 중심으로 하라.
5. 최신 시장 뉴스 중 이 종목 또는 섹터와 관련된 항목이 있으면 반드시 reasons 또는 comment에 구체적으로 언급하라.
6. 절대 금지: "현재 수급은 ~합니다", "RSI가 ~를 나타내고 있습니다" 같은 기계적 나열.
7. 출력 텍스트 말투: 증권사 리포트 스타일의 정중한 존댓말(~입니다, ~습니다, ~됩니다). 반말·명령형·축약형 절대 금지.
8. 반드시 한글만. JSON 외 텍스트 출력 금지.`;

    userContent = `공격적 투자 관점에서 분석하라.

${dataBlock}

먼저 이 종목에서 지금 가장 주목해야 할 신호가 뭔지 파악한 뒤,
그것이 매수/매도/관망 판단에 어떻게 연결되는지 논리적으로 서술하라.
이 종목 고유의 특이점이 없다면 솔직하게 "특별한 신호 없음"으로 판단해도 된다.${holding ? '\n보유 중인 종목이므로 현재 손익을 반드시 언급하고 추가매수/보유/매도 중 최적 행동을 명확히 제시하라.' : ''}

JSON 형식:
{
  "recommendation": "매수|추가매수|보유|일부매도|전량매도",
  "confidence": ${confMin}~${confMax},
  "targetPrice": 정수,
  "stopLoss": 정수,
  "holdingPeriod": "기간",
  "entryStrategy": "구체적 방법",
  "reasons": ["신호1 교차분석 결과", "기술지표 해석", "가격구조 판단", "리스크/리워드 비율", "핵심 리스크"],
  "comment": "지금 이 종목에 대해 가장 중요한 한 가지 메시지. 150자 내외. 수치 포함 필수."
}`;

  } else {
    temperature = 0.45;
    confMin = 50; confMax = 75;

    systemPrompt = `당신은 안전마진과 스마트머니 기반 가치투자 전문가다.
규칙:
1. 위의 데이터에서 "지금 이 종목이 가치투자 관점에서 매력적인가 아닌가"를 먼저 판단하라.
2. 안전마진(고점 대비 할인율)과 월간 수급 방향성이 일치하는지 확인하라.
3. RSI 과매도 여부로 기술적 타이밍을 보조 검증하라.
4. reasons의 각 항목은 서로 다른 각도(안전마진/스마트머니/기술/밸류/리스크)에서 작성하라.
5. 최신 시장 뉴스 중 이 종목 또는 섹터와 관련된 항목이 있으면 반드시 reasons 또는 comment에 구체적으로 언급하라.
6. 절대 금지: "현재 수급은 ~합니다", "안전마진이 ~를 나타내고 있습니다" 같은 기계적 나열.
7. 출력 텍스트 말투: 증권사 리포트 스타일의 정중한 존댓말(~입니다, ~습니다, ~됩니다). 반말·명령형·축약형 절대 금지.
8. 반드시 한글만. JSON 외 텍스트 출력 금지.`;

    userContent = `가치투자 관점에서 분석하라.

${dataBlock}

안전마진, 스마트머니 흐름, 기술지표가 서로 같은 방향을 가리키는지 아닌지를 먼저 판단한 뒤,
그 일치/불일치가 최종 판단에 어떤 의미인지 서술하라.
안전마진이 충분하지 않으면 솔직하게 "진입 시기 아님"으로 판단해도 된다.${holding ? '\n보유 중인 종목이므로 현재 손익을 반드시 언급하고 추가매수/보유/매도 중 최적 행동을 명확히 제시하라.' : ''}

JSON 형식:
{
  "recommendation": "매수|추가매수|보유|일부매도|전량매도",
  "confidence": ${confMin}~${confMax},
  "targetPrice": 정수,
  "stopLoss": 정수,
  "holdingPeriod": "기간",
  "entryStrategy": "구체적 방법",
  "reasons": ["안전마진 평가 (수치 포함)", "스마트머니 방향성 해석", "기술지표 타이밍 보조 검증", "중장기 리스크/리워드", "핵심 리스크"],
  "comment": "지금 이 종목에 대해 가장 중요한 한 가지 메시지. 150자 내외. 안전마진+수급 수치 포함 필수."
}`;
  }

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature,
      max_tokens: 1100,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });

    let text = completion.choices[0]?.message?.content || '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('JSON 파싱 실패');
    const parsed = JSON.parse(text.substring(start, end + 1));

    res.status(200).json({
      recommendation: parsed.recommendation || '관망',
      confidence: Math.max(confMin, Math.min(confMax, Number(parsed.confidence) || 60)),
      targetPrice: parsed.targetPrice || Math.round(price * 1.07),
      stopLoss: parsed.stopLoss || Math.round(price * 0.93),
      holdingPeriod: parsed.holdingPeriod || (type === 'aggressive' ? '1~3개월' : '6개월~1년'),
      entryStrategy: parsed.entryStrategy || '분할 진입',
      reasons: Array.isArray(parsed.reasons) && parsed.reasons.length > 0
        ? parsed.reasons
        : ['분석 데이터 처리 중'],
      comment: (parsed.comment || '').replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ''),
    });
  } catch (error) {
    console.error(`AI analyze error (${type}):`, error.message);
    const isBull = (supply.monthly?.total || 0) > 0;
    const isOversold = rsi < 35;
    let rec = '관망';
    if (type === 'aggressive') {
      rec = isBull && isOversold ? '매수' : isBull ? '보유' : (supply.monthly?.total || 0) < -10000 ? '매도' : '관망';
    } else {
      rec = parseFloat(marginOfSafety) > 15 && isBull ? '매수' : parseFloat(marginOfSafety) > 8 ? '보유' : '관망';
    }
    res.status(200).json({
      recommendation: rec,
      confidence: 52,
      targetPrice: Math.round(price * (type === 'aggressive' ? 1.10 : 1.05)),
      stopLoss: Math.round(price * 0.93),
      holdingPeriod: type === 'aggressive' ? '1~3개월' : '6개월~1년',
      entryStrategy: '분할 진입',
      reasons: [
        `월간 수급 ${(supply.monthly?.total || 0).toFixed(0)}억원 — ${isBull ? '순매수' : '순매도'}`,
        `RSI ${rsi} — ${isOversold ? '과매도 구간' : rsi > 65 ? '과매수 구간' : '중립'}`,
        `고점 대비 안전마진 ${marginOfSafety ?? 'N/A'}%`,
      ],
      comment: `수급 ${(supply.monthly?.total || 0).toFixed(0)}억, RSI ${rsi}, 안전마진 ${marginOfSafety ?? 'N/A'}% 기준 ${rec} 판단.`,
    });
  }
};
