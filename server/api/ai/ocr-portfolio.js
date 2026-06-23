/**
 * 포트폴리오 스크린샷 OCR
 * - 클라이언트에서 압축된 base64 이미지를 받아 Gemini Vision으로 종목 추출
 */

const axios = require('axios');

const PROMPT = `이 이미지는 한국 증권사 앱의 보유종목 화면입니다.
이미지에서 보유 종목 정보를 추출해주세요.

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "stocks": [
    {
      "code": "6자리 종목코드 (없으면 빈 문자열)",
      "name": "종목명",
      "shares": 보유수량(숫자),
      "avgPrice": 평균매입가(숫자, 원 단위)
    }
  ]
}

주의사항:
- 종목코드가 보이지 않으면 code를 빈 문자열로
- 수량과 평균매입가는 쉼표 제거한 순수 숫자로
- 인식 불가한 종목은 제외
- ETF도 포함`;

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY 없음' });

  const { imageBase64, mimeType = 'image/jpeg' } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 필요' });

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,                 // 종목 많아도 JSON 안 잘리게 넉넉히
          responseMimeType: 'application/json',   // JSON만 받도록 강제(파싱 안정)
          thinkingConfig: { thinkingBudget: 0 },  // 2.5-flash 추론(thinking) 끔 → 출력토큰 답에 집중
        },
      },
      { timeout: 30000 }
    );

    const cand = response.data.candidates?.[0];
    const raw = cand?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
    if (!raw) {
      // 차단/빈응답 등 원인 노출 (디버깅 가능하게)
      return res.status(422).json({
        error: '종목을 인식하지 못했습니다.',
        finishReason: cand?.finishReason,
        promptFeedback: response.data.promptFeedback,
      });
    }
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(422).json({ error: '종목을 인식하지 못했습니다.', sample: raw.slice(0, 120) });

    let parsed;
    try { parsed = JSON.parse(jsonMatch[0]); }
    catch { return res.status(422).json({ error: '인식 결과 형식 오류(JSON 파싱 실패)', sample: raw.slice(0, 120) }); }

    const stocks = (parsed.stocks || [])
      .map(s => ({
        code: String(s.code || '').replace(/[^0-9]/g, '').slice(0, 6),
        name: String(s.name || '').trim(),
        shares: Number(String(s.shares).replace(/[^0-9.]/g, '')) || 0,
        avgPrice: Number(String(s.avgPrice).replace(/[^0-9.]/g, '')) || 0,
      }))
      .filter(s => s.name && s.shares > 0 && s.avgPrice > 0);

    res.status(200).json({ stocks, count: stocks.length });
  } catch (error) {
    const detail = error.response?.data?.error;
    console.error('OCR 실패:', error.message, JSON.stringify(detail || {}));
    res.status(500).json({
      error: '이미지 인식 실패: ' + error.message,
      geminiStatus: error.response?.status,
      geminiMessage: detail?.message,
      geminiReason: detail?.status,
    });
  }
};
