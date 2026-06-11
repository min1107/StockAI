/**
 * 웹 푸시 발송기 (web-push + VAPID)
 * - 환경변수 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 필요
 * - 만료(404/410)된 구독은 자동 정리
 */

const webpush = require('web-push');
const { getAllSubs, removeSub } = require('./pushSubsCache');

let configured = false;
function ensureConfig() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    console.warn('⚠️ VAPID 키 미설정 — 웹 푸시 비활성');
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@stockai.app', pub, priv);
  configured = true;
  return true;
}

// 전체 구독자에게 발송. payload: { title, body, url }
async function sendToAll(payload) {
  if (!ensureConfig()) return { sent: 0, failed: 0, skipped: true };
  const subs = await getAllSubs();
  let sent = 0, failed = 0;
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, body);
      sent++;
    } catch (e) {
      failed++;
      if (e.statusCode === 404 || e.statusCode === 410) {
        await removeSub(sub.endpoint);
      }
    }
  }));
  console.log(`📨 웹 푸시 발송: 성공 ${sent} / 실패 ${failed} (대상 ${subs.length})`);
  return { sent, failed, total: subs.length };
}

module.exports = { sendToAll, ensureConfig };
