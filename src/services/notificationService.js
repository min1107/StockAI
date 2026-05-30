import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTIF_SETTINGS_KEY = '@StockAI:notifSettings';

// 알림 ID 상수
const IDS = {
  MARKET_OPEN:  ['mo_1','mo_2','mo_3','mo_4','mo_5'],  // 월~금
  MARKET_CLOSE: ['mc_1','mc_2','mc_3','mc_4','mc_5'],
  MORNING:      'morning_portfolio',
  WEEKLY:       'weekly_report',
};

// 기본 설정
export const DEFAULT_SETTINGS = {
  marketOpen:        false,
  marketClose:       false,
  morningPortfolio:  false,
  morningHour:       8,
  morningMinute:     30,
  pnlAlert:          false,
  pnlThresholdPct:   5,
  bigMovement:       false,
  bigMovementPct:    5,
  kospiAlert:        false,
  kospiThresholdPct: 2,
  weeklyReport:      false,
  weeklyHour:        8,
};

// 설정 불러오기
export const loadNotifSettings = async () => {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

// 설정 저장
export const saveNotifSettings = async (settings) => {
  await AsyncStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(settings));
};

// 권한 요청
export const requestNotifPermission = async () => {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
};

// 알림 핸들러 설정 (앱 포그라운드에서도 알림 표시)
export const setupNotifHandler = () => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
};

// ── 장 시작 알림 (평일 9:00) ──────────────────────────────────────
export const scheduleMarketOpen = async (enable) => {
  // 기존 취소
  for (const id of IDS.MARKET_OPEN) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }
  if (!enable) return;

  const weekdays = [2, 3, 4, 5, 6]; // expo: 1=일, 2=월 ... 6=금, 7=토
  for (let i = 0; i < weekdays.length; i++) {
    await Notifications.scheduleNotificationAsync({
      identifier: IDS.MARKET_OPEN[i],
      content: {
        title: '📈 장 시작',
        body: '오늘 장이 열렸습니다. 포트폴리오를 확인해보세요.',
        sound: true,
      },
      trigger: {
        weekday: weekdays[i],
        hour: 9,
        minute: 0,
        repeats: true,
      },
    });
  }
};

// ── 장 종료 알림 (평일 15:30) ─────────────────────────────────────
export const scheduleMarketClose = async (enable) => {
  for (const id of IDS.MARKET_CLOSE) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }
  if (!enable) return;

  const weekdays = [2, 3, 4, 5, 6];
  for (let i = 0; i < weekdays.length; i++) {
    await Notifications.scheduleNotificationAsync({
      identifier: IDS.MARKET_CLOSE[i],
      content: {
        title: '📉 장 마감',
        body: '오늘 장이 마감되었습니다. 오늘의 수익률을 확인해보세요.',
        sound: true,
      },
      trigger: {
        weekday: weekdays[i],
        hour: 15,
        minute: 30,
        repeats: true,
      },
    });
  }
};

// ── 매일 아침 포트폴리오 요약 ─────────────────────────────────────
export const scheduleMorningPortfolio = async (enable, hour = 8, minute = 30) => {
  await Notifications.cancelScheduledNotificationAsync(IDS.MORNING).catch(() => {});
  if (!enable) return;

  await Notifications.scheduleNotificationAsync({
    identifier: IDS.MORNING,
    content: {
      title: '📊 오늘의 포트폴리오',
      body: '오늘 장 시작 전 포트폴리오를 점검해보세요.',
      sound: true,
    },
    trigger: {
      hour,
      minute,
      repeats: true,
    },
  });
};

// ── 주간 AI 리포트 (토요일) ───────────────────────────────────────
export const scheduleWeeklyReport = async (enable, hour = 8) => {
  await Notifications.cancelScheduledNotificationAsync(IDS.WEEKLY).catch(() => {});
  if (!enable) return;

  await Notifications.scheduleNotificationAsync({
    identifier: IDS.WEEKLY,
    content: {
      title: '🤖 주간 AI 포트폴리오 리포트',
      body: '이번 주 포트폴리오 AI 분석이 준비되었습니다.',
      sound: true,
    },
    trigger: {
      weekday: 7, // 토요일
      hour,
      minute: 0,
      repeats: true,
    },
  });
};

// ── 포트폴리오 손익 알림 (앱 열릴 때 체크) ───────────────────────
const LAST_PNL_ALERT_KEY = '@StockAI:lastPnlAlert';

export const checkPnlAlert = async (holdings, thresholdPct) => {
  if (!holdings || holdings.length === 0) return;

  const totalBuy  = holdings.reduce((s, h) => s + h.avg_price * h.shares, 0);
  const totalEval = holdings.reduce((s, h) => s + (h.currentPrice ?? h.avg_price) * h.shares, 0);
  if (totalBuy === 0) return;

  const pnlRate = ((totalEval - totalBuy) / totalBuy) * 100;
  const absPnlRate = Math.abs(pnlRate);
  if (absPnlRate < thresholdPct) return;

  // 같은 날 이미 보낸 알림이면 스킵
  const today = new Date().toDateString();
  const last = await AsyncStorage.getItem(LAST_PNL_ALERT_KEY);
  if (last === today) return;

  const isPositive = pnlRate >= 0;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: isPositive ? '📈 포트폴리오 목표 수익 달성!' : '📉 포트폴리오 손실 경고',
      body: `현재 수익률 ${isPositive ? '+' : ''}${pnlRate.toFixed(1)}% (기준: ±${thresholdPct}%)`,
      sound: true,
    },
    trigger: null, // 즉시 발송
  });

  await AsyncStorage.setItem(LAST_PNL_ALERT_KEY, today);
};

// ── 보유 종목 급등/급락 알림 ─────────────────────────────────────
const LAST_MOVE_ALERT_KEY = '@StockAI:lastMoveAlert';

export const checkBigMovementAlert = async (holdings, thresholdPct) => {
  if (!holdings || holdings.length === 0) return;

  const today = new Date().toDateString();
  const raw = await AsyncStorage.getItem(LAST_MOVE_ALERT_KEY);
  const alerted = raw ? JSON.parse(raw) : {};

  for (const h of holdings) {
    if (!h.currentPrice) continue;
    const changeRate = ((h.currentPrice - h.avg_price) / h.avg_price) * 100;
    const absRate = Math.abs(changeRate);
    if (absRate < thresholdPct) continue;

    const alertKey = `${h.stock_code}_${today}`;
    if (alerted[alertKey]) continue;

    const isUp = changeRate >= 0;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: isUp ? `🚀 ${h.stock_name} 급등!` : `🔻 ${h.stock_name} 급락!`,
        body: `${isUp ? '+' : ''}${changeRate.toFixed(1)}% 변동 (기준가 대비)`,
        sound: true,
      },
      trigger: null,
    });

    alerted[alertKey] = true;
  }

  await AsyncStorage.setItem(LAST_MOVE_ALERT_KEY, JSON.stringify(alerted));
};

// ── KOSPI/KOSDAQ 급변동 알림 ──────────────────────────────────────
const LAST_KOSPI_ALERT_KEY = '@StockAI:lastKospiAlert';

export const checkKospiAlert = async (marketIndex, thresholdPct) => {
  if (!marketIndex) return;

  const today = new Date().toDateString();
  const last = await AsyncStorage.getItem(LAST_KOSPI_ALERT_KEY);
  if (last === today) return;

  const indices = [
    { name: 'KOSPI',  data: marketIndex.kospi  },
    { name: 'KOSDAQ', data: marketIndex.kosdaq },
  ];

  for (const idx of indices) {
    if (!idx.data?.changeRate) continue;
    const rate = parseFloat(idx.data.changeRate);
    if (Math.abs(rate) < thresholdPct) continue;

    const isUp = rate >= 0;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: isUp ? `📈 ${idx.name} 급등` : `📉 ${idx.name} 급락`,
        body: `${idx.name} ${isUp ? '+' : ''}${rate.toFixed(2)}% 변동 중`,
        sound: true,
      },
      trigger: null,
    });

    await AsyncStorage.setItem(LAST_KOSPI_ALERT_KEY, today);
    break;
  }
};

// ── 전체 예약 알림 재설정 (설정 변경 시 호출) ─────────────────────
export const applyAllSchedules = async (settings) => {
  await scheduleMarketOpen(settings.marketOpen);
  await scheduleMarketClose(settings.marketClose);
  await scheduleMorningPortfolio(settings.morningPortfolio, settings.morningHour, settings.morningMinute);
  await scheduleWeeklyReport(settings.weeklyReport, settings.weeklyHour);
};
