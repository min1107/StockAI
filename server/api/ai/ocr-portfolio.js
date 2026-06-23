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

  // Gemini 호출 — 과부하(503/429/500) 시 재시도, 그래도 안 되면 다른 모델로 폴백.
  const contents = [{
    parts: [
      { text: PROMPT },
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
    ],
  }];
  const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash']; // 2.5 혼잡하면 2.0으로
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  try {
    let response = null, lastErr = null;
    outer:
    for (const model of MODELS) {
      const body = {
        contents,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          // thinking(추론)은 2.5 계열만 지원 → 2.5에서만 끔
          ...(model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            body,
            { timeout: 25000 }
          );
          lastErr = null;
          break outer; // 성공
        } catch (e) {
          lastErr = e;
          const st = e.response?.status;
          if (st === 503 || st === 429 || st === 500) {
            await sleep(700 * (attempt + 1)); // 일시적 과부하 → 잠깐 쉬고 재시도
            continue;
          }
          break; // 그 외 오류 → 다음 모델로
        }
      }
    }
    if (!response) throw lastErr || new Error('Gemini 호출 실패');

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

    // 부족해도 버리지 않고 '뭐가 빠졌는지(missing)' 표시. 이름은 있어야 식별 가능 → 이름 없는 것만 제외.
    //  - missing: 사용자가 채워야 하는 항목만(수량/평단가). 종목코드는 앱이 종목명으로 자동검색하므로 제외.
    const stocks = (parsed.stocks || [])
      .map(s => {
        const code = String(s.code || '').replace(/[^0-9]/g, '').slice(0, 6);
        const name = String(s.name || '').trim();
        const shares = Number(String(s.shares).replace(/[^0-9.]/g, '')) || 0;
        const avgPrice = Number(String(s.avgPrice).replace(/[^0-9.]/g, '')) || 0;
        const missing = [];
        if (shares <= 0) missing.push('shares');
        if (avgPrice <= 0) missing.push('avgPrice');
        return { code, name, shares, avgPrice, missing };
      })
      .filter(s => s.name);

    const completeCount = stocks.filter(s => s.missing.length === 0).length;
    res.status(200).json({ stocks, count: stocks.length, completeCount });
  } catch (error) {
    const detail = error.response?.data?.error;
    const st = error.response?.status;
    console.error('OCR 실패:', st, error.message, JSON.stringify(detail || {}));
    // 과부하(503)·쿼터(429)는 일시적 → 사용자에겐 잠시 후 재시도 안내
    if (st === 503 || st === 429) {
      return res.status(503).json({
        error: 'AI 서버가 잠시 혼잡해요. 10~20초 뒤 다시 시도해주세요.',
        transient: true,
        geminiStatus: st,
      });
    }
    res.status(500).json({
      error: '이미지 인식 실패: ' + (detail?.message || error.message),
      geminiStatus: st,
      geminiReason: detail?.status,
    });
  }
};
