/**
 * 웹 푸시 테스트 발송 — 전체 구독자에게 1건
 * GET/POST /api/push/test
 */

const { sendToAll } = require('../../lib/pushSender');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const result = await sendToAll({
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
