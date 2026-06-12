/**
 * AI 자유 질문 채팅 API
 * POST /api/ai/chat
 * Body: { question, stockCode?, stockName? }
 * Response: { answer }
 */

const Groq = require('groq-sdk');
const { getMacroForAI, getNewsForAI, getSupplyForAI } = require('../macro/context');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, stockCode, stockName, portfolioText, history = [] } = req.body || {};

  if (!question || question.trim().length === 0) {
    return res.status(400).json({ error: '질문을 입력해주세요' });
  }

  if (question.trim().length > 300) {
    return res.status(400).json({ error: '질문은 300자 이내로 입력해주세요' });
  }

  try {
    // 매크로·뉴스·수급 병렬 조회
    const [macroData, newsText, supplyText] = await Promise.all([
      getMacroForAI(),
      getNewsForAI(),
      getSupplyForAI(),
    ]);

    // 참고 정보 구성 (짧게)
    const refParts = [];
    if (macroData?.text) refParts.push(macroData.text);
    if (newsText) refParts.push(newsText);
    if (supplyText) refParts.push(supplyText);

    // 포트폴리오 / 종목 컨텍스트
    const stockCtx = stockCode
      ? `\n현재 종목: ${stockName || stockCode}(${stockCode})`
      : '';
    const portfolioCtx = portfolioText
      ? `\n\n## 사용자 보유 포트폴리오\n${portfolioText}`
      : '';

    const systemPrompt = `당신은 한국 주식과 미국 주식 모두에 능통한 투자 전문가 AI 어시스턴트입니다.

[중요] 반드시 사용자의 질문에 직접 답하세요. 시장 정보를 나열하지 말고, 질문에 맞게 활용하세요.

규칙:
- 한국어로 답변
- 국내장(코스피·코스닥)과 미국장(미장 — 나스닥·S&P500, 애플/테슬라/엔비디아 등) 질문 모두 적극적으로 답변할 것. "한국 주식만 안다"며 회피하지 말 것
- 미국 주식은 아는 지식 범위에서 답하되, 실시간 정확한 시세가 필요하면 "앱의 종목 화면에서 현재가를 확인하라"고 안내 (추측한 가격을 단정하지 말 것)
- 4~6문장 이내로 간결하게
- 사용자 질문에 핵심 답변을 먼저, 근거는 뒤에
- 포트폴리오 정보가 있으면 그것을 기반으로 개인화된 답변${stockCtx}${portfolioCtx}

## 참고용 시장 정보 (질문과 관련될 때만 활용)
${refParts.join('\n\n') || '없음'}`;

    // 이전 대화 히스토리 포함 (최근 10턴)
    const historyMessages = (history || [])
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: question.trim() },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.5,
      max_tokens: 700,
    });

    const answer = completion.choices[0]?.message?.content?.trim() || '답변을 생성할 수 없습니다.';

    console.log(`✅ AI 채팅 완료 (${answer.length}자)`);
    return res.status(200).json({ answer });
  } catch (error) {
    console.error('❌ AI 채팅 실패:', error.message);
    return res.status(500).json({ error: 'AI 응답 실패', detail: error.message });
  }
};
