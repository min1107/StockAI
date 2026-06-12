/**
 * 웹 푸시 테스트 발송 — 호출한 "본인 기기"로만 1건
 * POST /api/push/test  Body: { subscription }
 * (전체 구독자에게 보내지 않음 → 스팸 악용 방지)
 */

const { sendToOne } = require('../../lib/pushSender');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const sub = (req.body && req.body.subscription) || null;
  if (!sub || !sub.endpoint) {
    return res.status(400).json({ error: '구독 정보가 필요합니다. 먼저 알림을 켠 뒤 본인 기기에서 테스트하세요.' });
  }

  try {
    const result = await sendToOne(sub, {
      title: '🔔 StockAI 알림 테스트',
      body: '푸시가 정상 동작합니다. 앱을 꺼놔도 이렇게 도착해요.',
      url: '/StockAI/',
    });
    res.status(200).json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (e) {
    console.error('❌ 테스트 푸시 실패:', e.message);
    res.status(500).json({ error: e.message });
  }
};
