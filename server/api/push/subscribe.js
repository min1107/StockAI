/**
 * 웹 푸시 구독 등록
 * POST { subscription } → Redis에 저장
 */

const { addSub } = require('../../lib/pushSubsCache');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const sub = (req.body && req.body.subscription) || req.body;
    if (!sub || !sub.endpoint) {
      return res.status(400).json({ error: 'invalid subscription' });
    }
    await addSub(sub);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('❌ 구독 저장 실패:', e.message);
    res.status(500).json({ error: e.message });
  }
};
