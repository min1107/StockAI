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

// ── PWA 설치 프롬프트 (Android Chrome) ──────────────────────────────
// beforeinstallprompt는 페이지 로드 직후 1회 발생하므로 앱 시작 시 미리 잡아둔다.
// iOS Safari에는 이 이벤트가 없어 promptInstall이 'unavailable'을 반환 → iOS 흐름 영향 없음.
let deferredInstallPrompt = null;
let installStateListeners = [];

function notifyInstallListeners() {
  for (const fn of installStateListeners) { try { fn(); } catch {} }
}

// 앱 시작 시 1회 호출 (App.js). 설치 프롬프트 이벤트를 가로채 보관.
export function initInstallPrompt() {
  if (!isWeb()) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 브라우저 기본 미니 배너 억제 → 앱 내 버튼으로 유도
    deferredInstallPrompt = e;
    notifyInstallListeners();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    notifyInstallListeners();
  });
}

// 설치 프롬프트가 잡혀 있는지 (안드 Chrome에서 설치 가능 상태)
export function canInstallApp() {
  return !!deferredInstallPrompt;
}

// 이미 홈 화면 PWA로 실행 중인지
export function isAppInstalled() {
  if (!isWeb()) return false;
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
}

// 설치 상태 변화 구독 (UI 갱신용). 해제 함수 반환.
export function onInstallStateChange(fn) {
  installStateListeners.push(fn);
  return () => { installStateListeners = installStateListeners.filter(f => f !== fn); };
}

// 사용자 탭 제스처 안에서 호출 → 네이티브 설치 프롬프트 표시
export async function promptInstall() {
  if (!deferredInstallPrompt) return 'unavailable';
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  notifyInstallListeners();
  return outcome; // 'accepted' | 'dismissed'
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

// 테스트 푸시 — 본인 기기로만 발송
export async function sendTestPush() {
  if (!isWebPushSupported()) throw new Error('이 기기/브라우저는 웹 푸시를 지원하지 않습니다.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) throw new Error('먼저 "웹 푸시 알림 켜기"로 알림을 켜주세요.');

  const resp = await fetch(`${SERVER}/api/push/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || '테스트 발송 실패');
  return data; // { sent, failed }
}
