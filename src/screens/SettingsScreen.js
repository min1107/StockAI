import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { clearAllSessions } from '../utils/aiChatStorage';
import {
  loadNotifSettings,
  saveNotifSettings,
  requestNotifPermission,
  applyAllSchedules,
  DEFAULT_SETTINGS,
} from '../services/notificationService';
import {
  isWebPushSupported,
  getNotificationPermission,
  enableWebPush,
  sendTestPush,
  canInstallApp,
  isAppInstalled,
  onInstallStateChange,
  promptInstall,
} from '../services/webPush';

const APP_VERSION = '1.0.0';
const ONBOARDING_DONE_KEY = '@StockAI:onboardingDone';
const SNAPSHOT_KEY = '@StockAI:pnl_snapshots';
const WARMUP_CACHE_KEY = '@StockAI:warmupAt';

// ── 섹션 헤더 ──────────────────────────────────────────────────────
function SectionHeader({ title, desc }) {
  return (
    <View style={{ marginTop: 24, marginBottom: 8, marginHorizontal: 20 }}>
      <Text style={styles.sectionHeader}>{title}</Text>
      {desc ? <Text style={styles.sectionDesc}>{desc}</Text> : null}
    </View>
  );
}

// ── 일반 행 ────────────────────────────────────────────────────────
function Row({ icon, label, sublabel, value, onPress, danger, rightElement }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !rightElement}
    >
      <View style={styles.rowLeft}>
        <Text style={styles.rowIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, danger && { color: '#FF4466' }]}>{label}</Text>
          {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
        </View>
      </View>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {rightElement || null}
        {onPress && !rightElement ? <Text style={styles.rowArrow}>›</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

// ── 스위치 행 ──────────────────────────────────────────────────────
function SwitchRow({ icon, label, sublabel, value, onValueChange }) {
  return (
    <Row
      icon={icon}
      label={label}
      sublabel={sublabel}
      rightElement={
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: '#252A47', true: '#7C3AED' }}
          thumbColor={value ? '#FFFFFF' : '#4A5568'}
          ios_backgroundColor="#252A47"
        />
      }
    />
  );
}

// ── 구분선 ─────────────────────────────────────────────────────────
function Divider() {
  return <View style={styles.divider} />;
}

// ── 퍼센트 선택 버튼 그룹 ──────────────────────────────────────────
function PctSelector({ value, options, onChange }) {
  return (
    <View style={styles.pctRow}>
      {options.map(pct => (
        <TouchableOpacity
          key={pct}
          style={[styles.pctBtn, value === pct && styles.pctBtnActive]}
          onPress={() => onChange(pct)}
        >
          <Text style={[styles.pctBtnText, value === pct && styles.pctBtnTextActive]}>
            {pct}%
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function SettingsScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [clearing, setClearing] = useState(false);
  const [notif, setNotif] = useState(DEFAULT_SETTINGS);
  const [permGranted, setPermGranted] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPerm, setPushPerm] = useState('default'); // 'default'|'granted'|'denied'|'unsupported'
  const [pushBusy, setPushBusy] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    loadNotifSettings().then(s => setNotif(s));
    setPushSupported(isWebPushSupported());
    setPushPerm(getNotificationPermission());
    // 안드로이드: 설치 프롬프트가 잡혔고 아직 미설치일 때만 설치 버튼 노출
    const refreshInstall = () => setCanInstall(canInstallApp() && !isAppInstalled());
    refreshInstall();
    const unsub = onInstallStateChange(refreshInstall);
    return unsub;
  }, []);

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      Alert.alert('설치 완료', '홈 화면에 StockAI가 추가되었습니다.');
    }
    setCanInstall(canInstallApp() && !isAppInstalled());
  };

  const handleEnableWebPush = async () => {
    setPushBusy(true);
    try {
      await enableWebPush();
      setPushPerm('granted');
      Alert.alert('알림 켜짐', '웹 푸시가 켜졌습니다. 아래 "테스트 알림 보내기"로 확인해보세요.');
    } catch (e) {
      Alert.alert('알림 켜기 실패', e.message);
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestPush = async () => {
    setPushBusy(true);
    try {
      const r = await sendTestPush();
      Alert.alert('테스트 발송 완료', `구독자 ${r.total ?? 0}명에게 발송 (성공 ${r.sent ?? 0}).\n잠시 후 알림이 도착하는지 확인하세요.`);
    } catch (e) {
      Alert.alert('테스트 실패', e.message);
    } finally {
      setPushBusy(false);
    }
  };

  // 설정 변경 → 저장 + 재스케줄
  const updateNotif = async (key, val) => {
    const updated = { ...notif, [key]: val };
    setNotif(updated);
    await saveNotifSettings(updated);
    await applyAllSchedules(updated);
  };

  // 알림 켤 때 권한 확인
  const handleToggle = async (key, val) => {
    if (val && !permGranted) {
      const granted = await requestNotifPermission();
      if (!granted) {
        Alert.alert('알림 권한 필요', '설정 > 알림에서 StockAI 알림을 허용해주세요.');
        return;
      }
      setPermGranted(true);
    }
    await updateNotif(key, val);
  };

  const handleSignOut = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: async () => { try { await signOut(); } catch {} } },
    ]);
  };

  const handleClearCache = () => {
    Alert.alert('캐시 초기화', '앱 캐시를 모두 지우시겠습니까?\n(관심종목, 포트폴리오 데이터는 유지됩니다)', [
      { text: '취소', style: 'cancel' },
      {
        text: '초기화', style: 'destructive', onPress: async () => {
          setClearing(true);
          await AsyncStorage.removeItem(SNAPSHOT_KEY).catch(() => {});
          await AsyncStorage.removeItem(WARMUP_CACHE_KEY).catch(() => {});
          setClearing(false);
          Alert.alert('완료', '캐시가 초기화되었습니다.');
        },
      },
    ]);
  };

  const handleClearChat = () => {
    Alert.alert('AI 채팅 기록 삭제', '모든 AI 채팅 기록을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { await clearAllSessions(); Alert.alert('완료', 'AI 채팅 기록이 삭제되었습니다.'); } },
    ]);
  };

  const handleResetOnboarding = () => {
    Alert.alert('온보딩 초기화', '앱을 재시작하면 온보딩 화면이 다시 표시됩니다.', [
      { text: '취소', style: 'cancel' },
      { text: '초기화', onPress: async () => { await AsyncStorage.removeItem(ONBOARDING_DONE_KEY); Alert.alert('완료', '앱을 재시작해주세요.'); } },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>설정</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── 홈 화면에 추가 (안드로이드 Chrome에서만 노출) ── */}
        {canInstall && (
          <>
            <SectionHeader title="앱 설치" desc="홈 화면에 추가하면 앱처럼 전체 화면으로 실행됩니다" />
            <View style={styles.card}>
              <Row
                icon="📲"
                label="홈 화면에 추가"
                sublabel="탭하면 설치 안내가 표시됩니다"
                onPress={handleInstall}
              />
            </View>
          </>
        )}

        {/* ── 계정 ── */}
        <SectionHeader title="계정" />
        <View style={styles.card}>
          {user ? (
            <>
              <Row icon="👤" label="이메일" value={user.email} />
              <Divider />
              <Row icon="🚪" label="로그아웃" onPress={handleSignOut} danger />
            </>
          ) : (
            <Row icon="🔐" label="로그인 / 회원가입" onPress={() => navigation.navigate('Auth')} />
          )}
        </View>

        {/* ── 푸시 알림 (앱 꺼도 수신) ── */}
        <SectionHeader title="푸시 알림" desc="앱을 꺼놔도 서버에서 알림을 보냅니다 (iOS는 홈 화면에 추가된 상태에서)" />
        <View style={styles.card}>
          {!pushSupported ? (
            <Row
              icon="ℹ️"
              label="이 기기에서는 사용 불가"
              sublabel="iOS는 16.4 이상 + 홈 화면에 추가한 앱에서만 됩니다"
            />
          ) : pushPerm === 'denied' ? (
            <Row
              icon="🚫"
              label="알림 권한이 차단됨"
              sublabel="기기 설정 > StockAI > 알림에서 허용해주세요"
            />
          ) : pushPerm === 'granted' ? (
            <>
              <Row icon="✅" label="푸시 알림 켜짐" sublabel="앱을 꺼도 알림이 도착합니다" />
              <Divider />
              <Row
                icon="📨"
                label={pushBusy ? '발송 중...' : '테스트 알림 보내기'}
                sublabel="지금 바로 알림이 오는지 확인"
                onPress={pushBusy ? null : handleTestPush}
              />
            </>
          ) : (
            <Row
              icon="🔔"
              label={pushBusy ? '켜는 중...' : '웹 푸시 알림 켜기'}
              sublabel="탭하면 알림 권한을 요청합니다"
              onPress={pushBusy ? null : handleEnableWebPush}
            />
          )}
        </View>

        {/* ── 시장 알림 ── */}
        <SectionHeader title="시장 알림" desc="장 시작/종료 시간에 알림을 받습니다 (평일만)" />
        <View style={styles.card}>
          <SwitchRow
            icon="🔔"
            label="장 시작 알림"
            sublabel="평일 오전 9:00"
            value={notif.marketOpen}
            onValueChange={v => handleToggle('marketOpen', v)}
          />
          <Divider />
          <SwitchRow
            icon="🔕"
            label="장 마감 알림"
            sublabel="평일 오후 3:30"
            value={notif.marketClose}
            onValueChange={v => handleToggle('marketClose', v)}
          />
          <Divider />
          <SwitchRow
            icon="📊"
            label="KOSPI/KOSDAQ 급변동"
            sublabel={`±${notif.kospiThresholdPct}% 이상 변동 시`}
            value={notif.kospiAlert}
            onValueChange={v => handleToggle('kospiAlert', v)}
          />
          {notif.kospiAlert && (
            <View style={styles.subRow}>
              <Text style={styles.subRowLabel}>기준 변동률</Text>
              <PctSelector
                value={notif.kospiThresholdPct}
                options={[1, 2, 3, 5]}
                onChange={v => updateNotif('kospiThresholdPct', v)}
              />
            </View>
          )}
        </View>

        {/* ── 포트폴리오 알림 ── */}
        <SectionHeader title="포트폴리오 알림" desc="보유 종목 및 수익률 변화를 알려드립니다" />
        <View style={styles.card}>
          <SwitchRow
            icon="🌅"
            label="매일 아침 포트폴리오 요약"
            sublabel={`오전 ${notif.morningHour}:${String(notif.morningMinute).padStart(2,'0')} 알림`}
            value={notif.morningPortfolio}
            onValueChange={v => handleToggle('morningPortfolio', v)}
          />
          <Divider />
          <SwitchRow
            icon="💰"
            label="포트폴리오 손익 알림"
            sublabel={`총 수익률 ±${notif.pnlThresholdPct}% 도달 시`}
            value={notif.pnlAlert}
            onValueChange={v => handleToggle('pnlAlert', v)}
          />
          {notif.pnlAlert && (
            <View style={styles.subRow}>
              <Text style={styles.subRowLabel}>기준 수익률</Text>
              <PctSelector
                value={notif.pnlThresholdPct}
                options={[3, 5, 10, 15]}
                onChange={v => updateNotif('pnlThresholdPct', v)}
              />
            </View>
          )}
          <Divider />
          <SwitchRow
            icon="🚀"
            label="보유 종목 급등/급락"
            sublabel={`±${notif.bigMovementPct}% 이상 변동 시`}
            value={notif.bigMovement}
            onValueChange={v => handleToggle('bigMovement', v)}
          />
          {notif.bigMovement && (
            <View style={styles.subRow}>
              <Text style={styles.subRowLabel}>기준 변동률</Text>
              <PctSelector
                value={notif.bigMovementPct}
                options={[3, 5, 10, 15]}
                onChange={v => updateNotif('bigMovementPct', v)}
              />
            </View>
          )}
        </View>

        {/* ── AI 리포트 ── */}
        <SectionHeader title="AI 리포트" />
        <View style={styles.card}>
          <SwitchRow
            icon="🤖"
            label="주간 AI 포트폴리오 리포트"
            sublabel={`매주 토요일 오전 ${notif.weeklyHour}:00`}
            value={notif.weeklyReport}
            onValueChange={v => handleToggle('weeklyReport', v)}
          />
        </View>

        {/* ── 데이터 ── */}
        <SectionHeader title="데이터" />
        <View style={styles.card}>
          <Row icon="💬" label="AI 채팅 기록 삭제" onPress={handleClearChat} />
          <Divider />
          <Row
            icon="🗑️"
            label={clearing ? '초기화 중...' : '캐시 초기화'}
            onPress={clearing ? null : handleClearCache}
          />
        </View>

        {/* ── 앱 ── */}
        <SectionHeader title="앱" />
        <View style={styles.card}>
          <Row icon="🔄" label="온보딩 다시 보기" onPress={handleResetOnboarding} />
        </View>

        {/* ── 정보 ── */}
        <SectionHeader title="정보" />
        <View style={styles.card}>
          <Row icon="📱" label="앱 버전" value={APP_VERSION} />
          <Divider />
          <Row icon="⚡" label="데이터 제공" value="한국투자증권 API" />
          <Divider />
          <Row icon="🤖" label="AI 엔진" value="Groq (llama-3.3-70b)" />
        </View>

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            ⚠️ 이 앱의 AI 분석은 투자 참고용입니다.{'\n'}
            실제 투자 결정은 본인의 판단 하에 이루어져야 하며,{'\n'}
            투자 손실에 대한 책임은 본인에게 있습니다.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E27' },
  header: {
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: '#1E2A42',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#FFFFFF' },
  sectionHeader: {
    fontSize: 12, color: '#6B7280', fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  sectionDesc: { fontSize: 11, color: '#4A5568', marginTop: 3 },
  card: {
    marginHorizontal: 16,
    backgroundColor: '#12172E', borderRadius: 16,
    borderWidth: 1, borderColor: '#1E2A42', overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: { fontSize: 18 },
  rowLabel: { fontSize: 15, color: '#FFFFFF', fontWeight: '500' },
  rowSublabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 13, color: '#6B7280' },
  rowArrow: { fontSize: 20, color: '#4A5568' },
  divider: { height: 1, backgroundColor: '#1E2A42', marginLeft: 48 },
  subRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: '#0A0E27',
  },
  subRowLabel: { fontSize: 12, color: '#6B7280' },
  pctRow: { flexDirection: 'row', gap: 6 },
  pctBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: '#252A47',
    backgroundColor: '#12172E',
  },
  pctBtnActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  pctBtnText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  pctBtnTextActive: { color: '#FFFFFF' },
  disclaimer: {
    margin: 16, marginTop: 24, padding: 14,
    backgroundColor: '#12172E', borderRadius: 12,
    borderWidth: 1, borderColor: '#2A1F1F',
  },
  disclaimerText: {
    fontSize: 11, color: '#6B7280', lineHeight: 18, textAlign: 'center',
  },
});
