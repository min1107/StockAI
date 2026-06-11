/**
 * 웹 푸시 (iOS Safari PWA / Android Chrome)
 * - 서비스워커 등록, manifest/Apple 메타 런타임 주입
 * - 알림 권한 요청 + PushManager 구독 + 서버 저장
 *
 * 네이티브(RN)에서는 전부 no-op. Platform.OS === 'web'에서만 동작.
 */
import { Platform } from 'react-native';

// VAPID 공개키 (공개 정보 — 커밋 안전). 비공개키는 서버 환경변수에만 존재.
const VAPID_PUBLIC_KEY = 'BL_3858PvAmOX2oP-QFwzRr0nTtYHaVapoZ9JGuPYGaSo8ZH_EzatRirSiAvlYMAQcljZtOYLsVyhjoVbhQXnT4';
const SERVER = 'https://server-nine-alpha-95.vercel.app';
const BASE = '/StockAI';

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';

export function isWebPushSupported() {
  return isWeb()
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function getNotificationPermission() {
  if (!isWeb() || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// PWA 설치를 위한 manifest 링크 + Apple 메타 주입 (Metro 템플릿이 안 넣어줌)
export function injectPWAMeta() {
  if (!isWeb() || typeof document === 'undefined') return;
  const head = document.head;

  if (!document.querySelector('link[rel="manifest"]')) {
    const l = document.createElement('link');
    l.rel = 'manifest';
    l.href = `${BASE}/manifest.json`;
    head.appendChild(l);
  }

  const metas = [
    ['apple-mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-status-bar-style', 'black-translucent'],
    ['apple-mobile-web-app-title', 'StockAI'],
    ['mobile-web-app-capable', 'yes'],
  ];
  for (const [name, content] of metas) {
    if (!document.querySelector(`meta[name="${name}"]`)) {
      const m = document.createElement('meta');
      m.name = name;
      m.content = content;
      head.appendChild(m);
    }
  }

  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const l = document.createElement('link');
    l.rel = 'apple-touch-icon';
    l.href = `${BASE}/icon.png`;
    head.appendChild(l);
  }
}

export async function registerServiceWorker() {
  if (!isWebPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` });
  } catch (e) {
    console.warn('서비스워커 등록 실패:', e?.message);
    return null;
  }
}

// 사용자 탭 제스처 안에서 호출해야 함 (iOS 권한 요청 규칙)
export async function enableWebPush() {
  if (!isWebPushSupported()) {
    throw new Error('이 기기/브라우저는 웹 푸시를 지원하지 않습니다. (iOS는 16.4+ & 홈 화면에 추가된 상태여야 합니다)');
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error('알림 권한이 거부되었습니다. 기기 설정에서 알림을 허용해주세요.');
  }

  const reg = (await navigator.serviceWorker.getRegistration(`${BASE}/`))
    || (await registerServiceWorker())
    || (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const resp = await fetch(`${SERVER}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub }),
  });
  if (!resp.ok) throw new Error('서버에 구독 저장 실패');

  return true;
}

// 테스트 푸시 요청 (전체 구독자에게 1건 — 본인 포함)
export async function sendTestPush() {
  const resp = await fetch(`${SERVER}/api/push/test`, { method: 'POST' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || '테스트 발송 실패');
  return data; // { sent, failed, total }
}
