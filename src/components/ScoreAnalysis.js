import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// 점수 엔진(/ai/score) 결과 전용 뷰 — docs/AI_ENGINE.md
// 객관 점수(엔진) + 해석(AI)을 함께 보여준다.

const POS = '#00D97E';
const NEG = '#FF4466';
const NEU = '#FFB800';
const MUTED = '#6B7280';

const verdictColor = (rec = '') => {
  if (rec.includes('매수') || rec.includes('추가')) return POS;
  if (rec.includes('매도')) return NEG;
  return NEU;
};

// 팩터별 아이콘
const FACTOR_ICON = {
  value: '📈',
  quality: '🏛️',
  growth: '🚀',
  technical: '📊',
  supply: '💰',
  catalyst: '📰',
};

// ─── 로딩 ───────────────────────────────────────────────────────────────────
function LoadingView() {
  return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator size="small" color="#9D4EDD" />
      <Text style={styles.loadingText}>점수 엔진 분석 중입니다...</Text>
    </View>
  );
}

// ─── 탭 ─────────────────────────────────────────────────────────────────────
function TabBar({ selected, onSelect }) {
  return (
    <View style={styles.tabBar}>
      {[
        { id: 'conservative', label: '가치투자', icon: '🛡️' },
        { id: 'aggressive', label: '성장투자', icon: '⚡' },
      ].map(({ id, label, icon }) => (
        <TouchableOpacity
          key={id}
          style={[styles.tab, selected === id && styles.tabActive]}
          onPress={() => onSelect(id)}
          activeOpacity={0.75}
        >
          <Text style={[styles.tabText, selected === id && styles.tabTextActive]}>
            {icon}  {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── 종합 판정 카드 ──────────────────────────────────────────────────────────
function VerdictCard({ engine, interpretation }) {
  const color = verdictColor(engine.recommendation);
  const conf = engine.confidence ?? 0;
  // score -100~100 → 0~100 게이지 위치
  const gaugePos = Math.max(0, Math.min(100, (engine.score + 100) / 2));

  return (
    <View style={[styles.verdictCard, { borderTopColor: color, borderTopWidth: 3 }]}>
      <View style={styles.verdictTopRow}>
        <View>
          <Text style={[styles.verdictLabel, { color }]}>{engine.recommendation}</Text>
          {interpretation?.headline ? (
            <Text style={styles.verdictHeadline} numberOfLines={2}>{interpretation.headline}</Text>
          ) : null}
        </View>
        <View style={styles.confBlock}>
          <Text style={[styles.confNum, { color }]}>{conf}%</Text>
          <Text style={styles.confCaption}>신뢰도</Text>
        </View>
      </View>

      {/* 종합점수 다이버징 게이지 (-100 매도 ~ +100 매수) */}
      <View style={styles.scoreGaugeBg}>
        <View style={styles.scoreCenterLine} />
        <View style={[styles.scoreGaugeDot, { left: `${gaugePos}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.scoreGaugeLabels}>
        <Text style={styles.gaugeEnd}>매도</Text>
        <Text style={styles.gaugeMid}>중립</Text>
        <Text style={styles.gaugeEnd}>매수</Text>
      </View>

      {/* 신뢰도 출처: 일치도 + 데이터 충실도 (정직성) */}
      <View style={styles.confMetaRow}>
        <View style={styles.confMetaItem}>
          <Text style={styles.confMetaLabel}>팩터 일치도</Text>
          <Text style={styles.confMetaValue}>{engine.agreement}%</Text>
        </View>
        <View style={styles.confMetaDivider} />
        <View style={styles.confMetaItem}>
          <Text style={styles.confMetaLabel}>데이터 충실도</Text>
          <Text style={styles.confMetaValue}>{engine.dataCompleteness}%</Text>
        </View>
      </View>
    </View>
  );
}

// ─── 팩터 다이버징 막대 ──────────────────────────────────────────────────────
function FactorBar({ factor }) {
  const { name, key, score, available, label, detail } = factor;

  if (!available) {
    return (
      <View style={styles.factorRow}>
        <View style={styles.factorHead}>
          <Text style={styles.factorIcon}>{FACTOR_ICON[key] || '▸'}</Text>
          <Text style={[styles.factorName, { color: MUTED }]}>{name}</Text>
          <Text style={styles.factorMissing}>미연동</Text>
        </View>
        <View style={styles.barTrack}>
          <View style={styles.barCenter} />
        </View>
        <Text style={styles.factorDetailMuted}>{label}</Text>
      </View>
    );
  }

  const color = score > 0 ? POS : score < 0 ? NEG : NEU;
  // score -2~+2 → 중심(50%)에서 좌우로. |score|/2 * 50% 폭
  const widthPct = (Math.abs(score) / 2) * 50;
  const leftPct = score >= 0 ? 50 : 50 - widthPct;

  return (
    <View style={styles.factorRow}>
      <View style={styles.factorHead}>
        <Text style={styles.factorIcon}>{FACTOR_ICON[key] || '▸'}</Text>
        <Text style={styles.factorName}>{name}</Text>
        <View style={[styles.factorBadge, { backgroundColor: color + '20' }]}>
          <Text style={[styles.factorBadgeText, { color }]}>
            {score > 0 ? '+' : ''}{score}  {label}
          </Text>
        </View>
      </View>
      <View style={styles.barTrack}>
        <View style={styles.barCenter} />
        <View style={[styles.barFill, { left: `${leftPct}%`, width: `${widthPct}%`, backgroundColor: color }]} />
      </View>
      {detail ? <Text style={styles.factorDetail}>{detail}</Text> : null}
    </View>
  );
}

function FactorsCard({ factors = [] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>팩터별 점수</Text>
      {factors.map((f) => (
        <FactorBar key={f.key} factor={f} />
      ))}
    </View>
  );
}

// ─── 함정 가드 ───────────────────────────────────────────────────────────────
function GuardsCard({ guards = [] }) {
  if (!guards.length) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>함정 체크</Text>
      {guards.map((g, i) => (
        <View key={g.key || i} style={[styles.guardRow, i > 0 && styles.guardBorder]}>
          <Text style={styles.guardIcon}>{g.triggered ? '⚠️' : '✅'}</Text>
          <Text style={[styles.guardText, g.triggered && { color: '#FFC9C9' }]}>{g.text}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── AI 해석 ─────────────────────────────────────────────────────────────────
function InterpretationCard({ interpretation }) {
  if (!interpretation) return null;
  const rows = [
    { label: '해석', value: interpretation.interpretation, color: '#C0C8E0' },
    { label: '실행 전략', value: interpretation.actionPlan, color: '#A7F3D0' },
    { label: '주의', value: interpretation.watchOut, color: '#FDE68A' },
    { label: '시장 맥락', value: interpretation.macroLink, color: '#93C5FD' },
  ].filter((r) => r.value && r.value.trim());

  if (!rows.length) return null;

  return (
    <View style={styles.card}>
      <View style={styles.aiTitleRow}>
        <Text style={styles.cardTitle}>AI 해석</Text>
        <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>해석 전용 · 점수는 엔진</Text></View>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.interpRow}>
          <Text style={styles.interpLabel}>{r.label}</Text>
          <Text style={[styles.interpText, { color: r.color }]}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── 전략 숫자 ───────────────────────────────────────────────────────────────
function StrategyCard({ data }) {
  const items = [
    { label: '목표가', value: data?.targetPrice ? `₩${data.targetPrice.toLocaleString()}` : '—', color: POS },
    { label: '손절가', value: data?.stopLoss ? `₩${data.stopLoss.toLocaleString()}` : '—', color: NEG },
    { label: '보유 기간', value: data?.holdingPeriod ?? '—', color: '#FFFFFF' },
  ];
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>투자 전략</Text>
      <View style={styles.strategyGrid}>
        {items.map(({ label, value, color }) => (
          <View key={label} style={styles.strategyCell}>
            <Text style={styles.strategyLabel}>{label}</Text>
            <Text style={[styles.strategyValue, { color }]} numberOfLines={2}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
export default function ScoreAnalysis({ conservative, aggressive, loading }) {
  const [tab, setTab] = useState('conservative');
  const data = tab === 'conservative' ? conservative : aggressive;
  const engine = data?.engine;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI 종합 판단</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>6팩터 점수 엔진</Text>
        </View>
      </View>

      <TabBar selected={tab} onSelect={setTab} />

      {loading ? (
        <LoadingView />
      ) : !engine ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>분석 데이터를 불러오는 중입니다...</Text>
        </View>
      ) : (
        <>
          <VerdictCard engine={engine} interpretation={data.interpretation} />
          <FactorsCard factors={engine.factors} />
          <GuardsCard guards={engine.guards} />
          <InterpretationCard interpretation={data.interpretation} />
          <StrategyCard data={data} />
        </>
      )}
    </View>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { marginVertical: 10 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12, paddingHorizontal: 2,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  badge: {
    backgroundColor: '#9D4EDD20', borderWidth: 1, borderColor: '#9D4EDD60',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3,
  },
  badgeText: { fontSize: 10, color: '#9D4EDD', fontWeight: '600' },

  // 탭
  tabBar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#161B35', borderWidth: 1, borderColor: '#252A47',
  },
  tabActive: { backgroundColor: '#9D4EDD', borderColor: '#9D4EDD' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#FFFFFF' },

  // 로딩
  loadingWrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 28, gap: 10,
  },
  loadingText: { color: '#6B7280', fontSize: 13 },

  // 카드 공통
  card: {
    backgroundColor: '#161B35', borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#252A47',
  },
  cardTitle: {
    fontSize: 11, fontWeight: '600', color: '#6B7280', marginBottom: 14,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  // 판정
  verdictCard: {
    backgroundColor: '#161B35', borderRadius: 14, padding: 18, marginBottom: 10,
    borderWidth: 1, borderColor: '#252A47',
  },
  verdictTopRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 16, gap: 12,
  },
  verdictLabel: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  verdictHeadline: { fontSize: 13, color: '#9AA3B5', marginTop: 4, lineHeight: 18, maxWidth: 230 },
  confBlock: { alignItems: 'flex-end' },
  confNum: { fontSize: 26, fontWeight: '800' },
  confCaption: { fontSize: 10, color: '#6B7280', fontWeight: '500' },

  // 종합점수 게이지
  scoreGaugeBg: {
    height: 8, backgroundColor: '#0D1128', borderRadius: 4, position: 'relative',
    justifyContent: 'center', marginBottom: 6,
  },
  scoreCenterLine: {
    position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2,
    marginLeft: -1, backgroundColor: '#3A4060',
  },
  scoreGaugeDot: {
    position: 'absolute', width: 16, height: 16, borderRadius: 8, marginLeft: -8,
    borderWidth: 3, borderColor: '#0D1128',
  },
  scoreGaugeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  gaugeEnd: { fontSize: 10, color: '#6B7280' },
  gaugeMid: { fontSize: 10, color: '#4A5568' },

  confMetaRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1128',
    borderRadius: 10, paddingVertical: 10,
  },
  confMetaItem: { flex: 1, alignItems: 'center' },
  confMetaLabel: { fontSize: 10, color: '#6B7280', marginBottom: 3 },
  confMetaValue: { fontSize: 15, fontWeight: '700', color: '#C0C8E0' },
  confMetaDivider: { width: 1, height: 28, backgroundColor: '#252A47' },

  // 팩터 막대
  factorRow: { marginBottom: 14 },
  factorHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  factorIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  factorName: { fontSize: 13, fontWeight: '600', color: '#C0C8E0', flex: 1 },
  factorBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  factorBadgeText: { fontSize: 11, fontWeight: '700' },
  factorMissing: {
    fontSize: 10, color: MUTED, fontStyle: 'italic',
    backgroundColor: '#0D1128', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  barTrack: {
    height: 6, backgroundColor: '#0D1128', borderRadius: 3, position: 'relative',
    overflow: 'hidden',
  },
  barCenter: {
    position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1,
    marginLeft: -0.5, backgroundColor: '#3A4060', zIndex: 1,
  },
  barFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
  factorDetail: { fontSize: 11, color: '#8892A4', marginTop: 5, lineHeight: 16 },
  factorDetailMuted: { fontSize: 11, color: '#4A5568', marginTop: 5, fontStyle: 'italic' },

  // 가드
  guardRow: { flexDirection: 'row', gap: 10, paddingVertical: 9, alignItems: 'flex-start' },
  guardBorder: { borderTopWidth: 1, borderTopColor: '#1E2340' },
  guardIcon: { fontSize: 14, marginTop: 1 },
  guardText: { flex: 1, fontSize: 13, color: '#9AA3B5', lineHeight: 19 },

  // AI 해석
  aiTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiBadge: {
    backgroundColor: '#0D1128', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    marginBottom: 14,
  },
  aiBadgeText: { fontSize: 9, color: '#6B7280', fontWeight: '600' },
  interpRow: { marginBottom: 12 },
  interpLabel: {
    fontSize: 11, fontWeight: '700', color: '#9D4EDD', marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  interpText: { fontSize: 14, lineHeight: 21 },

  // 전략
  strategyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  strategyCell: {
    flex: 1, minWidth: '28%', backgroundColor: '#0D1128', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#1E2340', alignItems: 'center',
  },
  strategyLabel: { fontSize: 11, color: '#6B7280', marginBottom: 5, fontWeight: '500', textAlign: 'center' },
  strategyValue: { fontSize: 15, fontWeight: '700', lineHeight: 20, textAlign: 'center' },
});
