/**
 * 포트폴리오 스크린샷 OCR
 * - FormData multipart로 이미지 수신 (base64 JSON 방식 대신)
 * - Gemini Vision으로 종목코드/종목명/수량/평균매입가 추출
 */

const axios = require('axios');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

const runMulter = (req, res) =>
  new Promise((resolve, reject) => {
    upload.single('image')(req, res, (err) => {
      if (err) reject(err); else resolve();
    });
  });

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

  try {
    await runMulter(req, res);
  } catch (err) {
    return res.status(400).json({ error: '파일 업로드 실패: ' + err.message });
  }

  if (!req.file) return res.status(400).json({ error: '이미지 파일이 없습니다' });

  const imageBase64 = req.file.buffer.toString('base64');
  const mimeType = req.file.mimetype || 'image/jpeg';

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      },
      { timeout: 30000 }
    );

    const raw = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(422).json({ error: '종목을 인식하지 못했습니다.' });

    const parsed = JSON.parse(jsonMatch[0]);
    const stocks = (parsed.stocks || []).filter(s => s.name && s.shares > 0 && s.avgPrice > 0);

    res.status(200).json({ stocks });
  } catch (error) {
    console.error('OCR 실패:', error.message);
    res.status(500).json({ error: '이미지 인식 실패: ' + error.message });
  }
};
