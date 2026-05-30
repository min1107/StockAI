import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ── 미니 5일 바 차트 ──────────────────────────────────────────────
const MiniBarChart = ({ days, dataKey }) => {
  if (!days || days.length <= 1) return null;

  const values = [...days].reverse().map(d => d[dataKey] || 0);
  const maxAbs = Math.max(...values.map(v => Math.abs(v)), 0.01);
  const MAX_H = 22;

  return (
    <View style={miniStyles.wrapper}>
      <Text style={miniStyles.label}>최근 {values.length}일 추세</Text>
      <View style={miniStyles.chart}>
        {values.map((val, i) => {
          const h = Math.max(3, (Math.abs(val) / maxAbs) * MAX_H);
          const isPos = val >= 0;
          const isToday = i === values.length - 1;
          return (
            <View key={i} style={miniStyles.col}>
              <View style={[miniStyles.half, { justifyContent: 'flex-end' }]}>
                {isPos && (
                  <View style={[
                    miniStyles.bar,
                    { height: h, backgroundColor: isToday ? '#00FF88' : '#00FF8870' },
                  ]} />
                )}
              </View>
              <View style={miniStyles.centerLine} />
              <View style={[miniStyles.half, { justifyContent: 'flex-start' }]}>
                {!isPos && (
                  <View style={[
                    miniStyles.bar,
                    { height: h, backgroundColor: isToday ? '#FF4466' : '#FF446670' },
                  ]} />
                )}
              </View>
            </View>
          );
        })}
      </View>
      <View style={miniStyles.dateRow}>
        <Text style={miniStyles.dateLabel}>{values.length}일 전</Text>
        <Text style={[miniStyles.dateLabel, { color: '#00D9FF' }]}>오늘</Text>
      </View>
    </View>
  );
};

const miniStyles = StyleSheet.create({
  wrapper: { marginTop: 14 },
  label: { fontSize: 10, color: '#4A5568', marginBottom: 6, letterSpacing: 0.5 },
  chart: { flexDirection: 'row', height: 48, gap: 3 },
  col: { flex: 1, flexDirection: 'column', alignItems: 'center' },
  half: { flex: 1, width: '100%', alignItems: 'center' },
  centerLine: { height: 1, width: '100%', backgroundColor: '#2A2F4A' },
  bar: { width: '80%', borderRadius: 3 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  dateLabel: { fontSize: 9, color: '#4A5568' },
});

// ── 유틸 ──────────────────────────────────────────────────────────
const formatAmount = (value) => {
  const absValue = Math.abs(value);
  const sign = value >= 0 ? '+' : '-';
  if (absValue >= 10000) return `${sign}${(absValue / 10000).toFixed(1)}조`;
  if (absValue >= 1)     return `${sign}${absValue.toFixed(0)}억`;
  if (absValue > 0)      return `${sign}${(absValue * 100).toFixed(0)}백만`;
  return '0';
};

const getStrength = (value) => {
  const a = Math.abs(value);
  if (a >= 10000) return 10;
  if (a >= 5000)  return 8;
  if (a >= 2000)  return 6;
  if (a >= 500)   return 4;
  if (a >= 100)   return 2;
  return 1;
};

const getStrengthText = (value) => {
  const s = getStrength(value);
  if (value > 0) {
    if (s >= 9) return '매수세 매우 강함';
    if (s >= 7) return '매수세 강함';
    if (s >= 5) return '매수세 보통';
    if (s >= 3) return '매수세 약함';
    return '매수세 미미';
  } else if (value < 0) {
    if (s >= 9) return '매도세 매우 강함';
    if (s >= 7) return '매도세 강함';
    if (s >= 5) return '매도세 보통';
    if (s >= 3) return '매도세 약함';
    return '매도세 미미';
  }
  return '보합';
};

const getColor = (value) => {
  if (value > 0) return '#00FF88';
  if (value < 0) return '#FF4466';
  return '#6B7280';
};

const getArrow = (value) => {
  if (value > 0) return '▲';
  if (value < 0) return '▼';
  return '━';
};

// ── 스마트머니 신호 ────────────────────────────────────────────────
const getSmartMoneySignal = (instAmt, foreignAmt) => {
  const instPos    = instAmt > 0;
  const foreignPos = foreignAmt > 0;
  const isStrong   = Math.abs(instAmt) > 5 || Math.abs(foreignAmt) > 5;

  if (instPos && foreignPos) {
    return {
      emoji: '🔥',
      text: isStrong ? '기관·외국인 강한 동반 매수' : '기관·외국인 동반 매수',
      detail: '수급이 양호합니다. 상승 모멘텀이 형성 중입니다.',
      color: '#00FF88', bgColor: '#00FF8812', borderColor: '#00FF8840',
      stars: isStrong ? 3 : 2,
    };
  } else if (!instPos && !foreignPos) {
    return {
      emoji: '❄️',
      text: isStrong ? '기관·외국인 강한 동반 매도' : '기관·외국인 동반 매도',
      detail: '하락 압력이 있습니다. 리스크 관리에 주의하세요.',
      color: '#FF4466', bgColor: '#FF446612', borderColor: '#FF446640',
      stars: isStrong ? 3 : 2,
    };
  } else if (instPos && !foreignPos) {
    return {
      emoji: '⚡',
      text: '기관 매수 / 외국인 매도',
      detail: '방향이 엇갈려 수급 신호가 혼재합니다.',
      color: '#FFD700', bgColor: '#FFD70012', borderColor: '#FFD70040',
      stars: 1,
    };
  } else {
    return {
      emoji: '⚡',
      text: '기관 매도 / 외국인 매수',
      detail: '방향이 엇갈려 수급 신호가 혼재합니다.',
      color: '#FFD700', bgColor: '#FFD70012', borderColor: '#FFD70040',
      stars: 1,
    };
  }
};

// ── 주간 평균 대비 ─────────────────────────────────────────────────
const getVsWeeklyAvg = (daily, weeklyAvg) => {
  if (weeklyAvg == null || Math.abs(weeklyAvg) < 0.001) return null;
  return ((daily - weeklyAvg) / Math.abs(weeklyAvg)) * 100;
};

// ── 탭 설정 ────────────────────────────────────────────────────────
const ALL_TABS = [
  { key: '1d', label: '1일' },
  { key: '1w', label: '1주' },
  { key: '1m', label: '1개월' },
  { key: '3m', label: '3개월' },
];

// ── 메인 컴포넌트 ──────────────────────────────────────────────────
export default function InstitutionalTrade({ data }) {
  const [selectedPeriod, setSelectedPeriod] = useState('1d');

  if (!data) {
    return (
      <View style={styles.container}>
        <View style={styles.titleRow}>
          <View style={styles.titleAccent} />
          <Text style={styles.title}>기관 매매 동향</Text>
        </View>
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>🏢</Text>
          <Text style={styles.noDataText}>기관 매매 데이터 로딩 중...</Text>
        </View>
      </View>
    );
  }

  const availableTabs = ALL_TABS.filter(tab => {
    if (tab.key === '1d') return true;
    if (tab.key === '1w') return data.weeklyInstitution !== null && data.weeklyInstitution !== undefined;
    if (tab.key === '1m') return data.monthlyInstitution !== null && data.monthlyInstitution !== undefined;
    if (tab.key === '3m') return data.quarterlyInstitution !== null && data.quarterlyInstitution !== undefined;
    return false;
  });

  const activePeriod = availableTabs.find(t => t.key === selectedPeriod) ? selectedPeriod : '1d';

  let instAmount, foreignAmount, periodLabel;

  if (activePeriod === '1d') {
    instAmount    = data.dailyInstitution || 0;
    foreignAmount = data.dailyForeign || 0;
    periodLabel   = '오늘';
  } else if (activePeriod === '1w') {
    instAmount    = data.weeklyInstitution;
    foreignAmount = data.weeklyForeign;
    periodLabel   = data.weeklyActualDays < 5
      ? `최근 ${data.weeklyActualDays}일`
      : '이번 주 (5거래일)';
  } else if (activePeriod === '1m') {
    instAmount    = data.monthlyInstitution;
    foreignAmount = data.monthlyForeign;
    periodLabel   = data.monthlyActualDays < 20
      ? `최근 ${data.monthlyActualDays}거래일`
      : '이번 달 (20거래일)';
  } else {
    instAmount    = data.quarterlyInstitution;
    foreignAmount = data.quarterlyForeign;
    periodLabel   = data.quarterlyActualDays < 60
      ? `최근 ${data.quarterlyActualDays}거래일`
      : '최근 3개월 (60거래일)';
  }

  const personalAmount = -(instAmount + foreignAmount);
  const signal    = getSmartMoneySignal(instAmount, foreignAmount);
  const starsText = '●'.repeat(signal.stars) + '○'.repeat(3 - signal.stars);

  const renderInvestorCard = (label, amount, recentKey) => {
    const color = getColor(amount);
    const strengthText = getStrengthText(amount);
    const barWidth = (getStrength(amount) / 10) * 100;
    const arrow = getArrow(amount);

    let vsAvg = null;
    if (activePeriod === '1d') {
      const weeklyAvg =
        label === '기관'   ? data.weeklyAvgInstitution :
        label === '외국인' ? data.weeklyAvgForeign : null;
      vsAvg = getVsWeeklyAvg(amount, weeklyAvg);
    }

    return (
      <View style={[styles.investorCard, { borderLeftColor: color }]} key={label}>
        {/* 헤더 */}
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            <Text style={[styles.investorArrow, { color }]}>{arrow}</Text>
            <Text style={styles.investorType}>{label}</Text>
          </View>
          {vsAvg !== null && (
            <View style={[styles.vsAvgBadge, {
              backgroundColor: vsAvg >= 0 ? '#00FF8818' : '#FF446618',
              borderColor: vsAvg >= 0 ? '#00FF8840' : '#FF446640',
            }]}>
              <Text style={[styles.vsAvgText, { color: vsAvg >= 0 ? '#00FF88' : '#FF4466' }]}>
                주간평균 {vsAvg >= 0 ? '+' : ''}{vsAvg.toFixed(0)}%
              </Text>
            </View>
          )}
        </View>

        {/* 금액 */}
        <Text style={[styles.amount, { color }]}>{formatAmount(amount)}원</Text>

        {/* 강도 바 */}
        <View style={styles.strengthRow}>
          <View style={styles.strengthBarBg}>
            <View style={[styles.strengthBarFill, {
              width: `${barWidth}%`,
              backgroundColor: color,
              shadowColor: color,
              shadowOpacity: 0.6,
              shadowRadius: 6,
            }]} />
          </View>
          <Text style={[styles.strengthText, { color }]}>{strengthText}</Text>
        </View>

        {/* 미니 차트 (1일 탭만) */}
        {activePeriod === '1d' && recentKey && (
          <MiniBarChart days={data.recentDays} dataKey={recentKey} />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <View style={styles.titleAccent} />
          <Text style={styles.title}>기관 매매 동향</Text>
        </View>
        <View style={styles.dataInfoBadge}>
          <Text style={styles.dataInfoDot}>●</Text>
          <Text style={styles.dataInfo}>실데이터 {data.availableDays || 0}일</Text>
        </View>
      </View>

      {/* 스마트머니 신호 배너 */}
      <View style={[styles.signalBanner, {
        backgroundColor: signal.bgColor,
        borderColor: signal.borderColor,
      }]}>
        <View style={[styles.signalAccentBar, { backgroundColor: signal.color }]} />
        <View style={styles.signalContent}>
          <View style={styles.signalTop}>
            <Text style={styles.signalEmoji}>{signal.emoji}</Text>
            <Text style={[styles.signalText, { color: signal.color }]}>{signal.text}</Text>
            <Text style={[styles.signalStars, { color: signal.color }]}>{starsText}</Text>
          </View>
          <Text style={styles.signalDetail}>{signal.detail}</Text>
        </View>
      </View>

      {/* 기간 탭 */}
      <View style={styles.tabWrapper}>
        <View style={styles.tabContainer}>
          {availableTabs.map((tab) => {
            const isActive = activePeriod === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setSelectedPeriod(tab.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 기간 라벨 */}
      <Text style={styles.periodLabel}>{periodLabel} 기준 · 실제 거래대금</Text>

      {/* 투자자별 카드 */}
      {renderInvestorCard('기관',   instAmount,    'inst')}
      {renderInvestorCard('외국인', foreignAmount,  'foreign')}
      {renderInvestorCard('개인',   personalAmount, 'personal')}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#161B35',
    borderRadius: 16,
    padding: 20,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#252A47',
  },

  // 헤더
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleAccent: {
    width: 4,
    height: 20,
    backgroundColor: '#00D9FF',
    borderRadius: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  dataInfoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#00D9FF12',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#00D9FF30',
  },
  dataInfoDot: { fontSize: 8, color: '#00D9FF' },
  dataInfo: { fontSize: 11, color: '#00D9FF', fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 30 },
  emptyIcon: { fontSize: 32, marginBottom: 10 },
  noDataText: { color: '#6B7280', fontSize: 14 },

  // 스마트머니 배너
  signalBanner: {
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  signalAccentBar: {
    width: 4,
    borderRadius: 0,
  },
  signalContent: {
    flex: 1,
    padding: 14,
  },
  signalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  signalEmoji: { fontSize: 20 },
  signalText: { fontSize: 14, fontWeight: '700', flex: 1 },
  signalStars: { fontSize: 13, letterSpacing: 3 },
  signalDetail: { fontSize: 12, color: '#8892A4', lineHeight: 18 },

  // 탭
  tabWrapper: {
    backgroundColor: '#0D1128',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  tab: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#00D9FF',
  },
  tabText: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#0D1128', fontWeight: '700' },

  periodLabel: {
    fontSize: 11,
    color: '#4A5568',
    textAlign: 'right',
    marginBottom: 12,
    letterSpacing: 0.3,
  },

  // 투자자 카드
  investorCard: {
    backgroundColor: '#0D1128',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#252A47',
    borderLeftWidth: 3,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  investorArrow: {
    fontSize: 12,
    fontWeight: '800',
  },
  investorType: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8892A4',
    letterSpacing: 0.5,
  },
  vsAvgBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  vsAvgText: { fontSize: 11, fontWeight: '700' },

  amount: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 14,
    letterSpacing: -0.5,
  },

  // 강도 바
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  strengthBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#252A47',
    borderRadius: 3,
    overflow: 'hidden',
  },
  strengthBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  strengthText: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 105,
  },
});
