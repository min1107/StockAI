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
        {engine.trackRecord?.measured ? (
          <>
            <View style={styles.confMetaDivider} />
            <View style={styles.confMetaItem}>
              <Text style={styles.confMetaLabel}>과거 적중률</Text>
              <Text style={styles.confMetaValue}>{Math.round(engine.trackRecord.trackRecord * 100)}%</Text>
            </View>
          </>
        ) : null}
      </View>
      {engine.trackRecord?.label ? (
        <Text style={styles.trackNote}>📈 {engine.trackRecord.label}</Text>
      ) : null}
    </View>
  );
}

// ─── 적정가 카드 (코드 결정론 계산) ─────────────────────────────────────────
const FV_CONF_LABEL = { high: '높음', medium: '보통', low: '낮음(참고용)', none: '추정 불가' };

function FairValueCard({ valuation }) {
  if (!valuation) return null;
  const { fairValue, upside, methods = [], confidence, note } = valuation;

  // 적정가 추정 불가 (적자·데이터 부족) — 정직하게 표시
  if (!fairValue) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>적정가 · 안전마진</Text>
        <Text style={styles.fvNoneText}>{note || '적정가를 추정할 수 없습니다 (데이터 부족)'}</Text>
      </View>
    );
  }

  const up = typeof upside === 'number' ? upside : 0;
  const upColor = up >= 0 ? POS : NEG;
  const verdict = up >= 20 ? '저평가' : up >= -10 ? '적정' : '고평가';

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>적정가 · 안전마진</Text>
      <View style={styles.fvTopRow}>
        <View>
          <Text style={styles.fvLabel}>코드 산출 적정가</Text>
          <Text style={styles.fvPrice}>₩{fairValue.toLocaleString()}</Text>
        </View>
        <View style={styles.fvUpsideBlock}>
          <Text style={[styles.fvUpside, { color: upColor }]}>{up >= 0 ? '+' : ''}{up.toFixed(0)}%</Text>
          <Text style={[styles.fvVerdict, { color: upColor }]}>{verdict}</Text>
        </View>
      </View>

      {/* 산출방식 투명 공개 */}
      {methods.length ? (
        <View style={styles.fvMethods}>
          {methods.map((m) => (
            <View key={m.name} style={styles.fvMethodChip}>
              <Text style={styles.fvMethodName}>{m.name}</Text>
              <Text style={styles.fvMethodVal}>₩{m.value.toLocaleString()}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.fvFootnote}>
        {methods.length}개 방식 중앙값 · 신뢰도 {FV_CONF_LABEL[confidence] || confidence}
        {note ? ` · ${note}` : ''}
      </Text>
    </View>
  );
}

// ─── 사업가치(정성) + 교차검증 카드 ─────────────────────────────────────────
const CROSS_COLOR = {
  '진짜 우량': POS, '우량': POS, '성장 후보': '#4FC3F7',
  '가치 함정 경고': NEG, '회피': NEG, '혼조': NEU, '중립': MUTED, '판단보류': MUTED,
};
const LEVEL_COLOR = { '강': POS, '중': NEU, '약': NEG, '판단보류': MUTED };

function BusinessValueCard({ businessValue, crossCheck }) {
  if (!businessValue && !crossCheck) return null;
  const cc = crossCheck;
  const bv = businessValue;
  const ccColor = cc ? (CROSS_COLOR[cc.verdict] || MUTED) : MUTED;

  const rows = [];
  if (bv?.moat) rows.push({ k: '경제적 해자', lv: bv.moat.level, sub: bv.moat.type, ev: bv.moat.evidence });
  if (bv?.industry) rows.push({ k: '산업·경쟁', lv: bv.industry.trend, sub: bv.industry.position, ev: bv.industry.evidence });
  if (bv?.sustainability) rows.push({ k: '지속가능성', lv: bv.sustainability.level, sub: bv.sustainability.risk, ev: bv.sustainability.evidence });

  return (
    <View style={styles.card}>
      <View style={styles.aiTitleRow}>
        <Text style={styles.cardTitle}>사업가치 · 교차검증</Text>
        <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>정성 AI · 근거 인용</Text></View>
      </View>

      {/* 정량×정성 교차검증 판정 */}
      {cc ? (
        <View style={[styles.bvVerdict, { borderColor: ccColor + '55', backgroundColor: ccColor + '14' }]}>
          <Text style={[styles.bvVerdictLabel, { color: ccColor }]}>
            {cc.valueTrap ? '⚠️ ' : ''}{cc.verdict}
          </Text>
          <Text style={styles.bvVerdictText}>{cc.text}</Text>
        </View>
      ) : null}

      {/* 사업가치 요약 */}
      {bv?.summary ? <Text style={styles.bvSummary}>{bv.summary}</Text> : null}

      {/* 항목별 강/중/약 + 근거 */}
      {rows.map((r) => (
        <View key={r.k} style={styles.bvRow}>
          <View style={styles.bvRowHead}>
            <Text style={styles.bvRowKey}>{r.k}</Text>
            {r.lv ? (
              <View style={[styles.bvLevelBadge, { backgroundColor: (LEVEL_COLOR[r.lv] || MUTED) + '20' }]}>
                <Text style={[styles.bvLevelText, { color: LEVEL_COLOR[r.lv] || MUTED }]}>{r.lv}</Text>
              </View>
            ) : null}
            {r.sub ? <Text style={styles.bvRowSub} numberOfLines={1}>{r.sub}</Text> : null}
          </View>
          {r.ev ? <Text style={styles.bvEvidence}>근거: {r.ev}</Text> : null}
        </View>
      ))}
    </View>
  );
}

// ─── 유니버스 백분위 카드 ────────────────────────────────────────────────────
function UniverseCard({ universeRank }) {
  if (!universeRank || !universeRank.items?.length) return null;
  return (
    <View style={styles.card}>
      <View style={styles.aiTitleRow}>
        <Text style={styles.cardTitle}>유니버스 상대 위치</Text>
        {universeRank.universeSize ? (
          <Text style={styles.uvSize}>전종목 {universeRank.universeSize.toLocaleString()}개 대비</Text>
        ) : null}
      </View>
      {universeRank.valueSummary ? <Text style={styles.uvSummary}>{universeRank.valueSummary}</Text> : null}
      <View style={styles.uvChips}>
        {universeRank.items.map((it) => (
          <View key={it.metric} style={styles.uvChip}>
            <Text style={styles.uvChipLabel}>{it.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Bull / Bear 양면 카드 ───────────────────────────────────────────────────
function BullBearCard({ bullBear }) {
  if (!bullBear) return null;
  const bull = (bullBear.bull || []).filter(Boolean);
  const bear = (bullBear.bear || []).filter(Boolean);
  if (!bull.length && !bear.length) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>양면 — 강세 vs 약세</Text>
      {bull.length ? (
        <View style={styles.bbBlock}>
          <Text style={[styles.bbHead, { color: POS }]}>▲ 강세 논리</Text>
          {bull.map((t, i) => (
            <View key={`bull${i}`} style={styles.bbRow}>
              <Text style={[styles.bbDot, { color: POS }]}>•</Text>
              <Text style={styles.bbText}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {bear.length ? (
        <View style={styles.bbBlock}>
          <Text style={[styles.bbHead, { color: NEG }]}>▼ 약세 논리 (이게 깨지면 전제 붕괴)</Text>
          {bear.map((t, i) => (
            <View key={`bear${i}`} style={styles.bbRow}>
              <Text style={[styles.bbDot, { color: NEG }]}>•</Text>
              <Text style={styles.bbText}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}
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

// ─── 이벤트 캘린더 (D-day) ───────────────────────────────────────────────────
function CalendarCard({ calendar }) {
  if (!calendar || !calendar.length) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>다가오는 일정 (추정)</Text>
      {calendar.map((e, i) => {
        const urgent = e.dday <= 14;
        return (
          <View key={i} style={[styles.calRow, i > 0 && styles.calBorder]}>
            <View style={[styles.calDday, { backgroundColor: (urgent ? NEG : '#4FC3F7') + '20' }]}>
              <Text style={[styles.calDdayText, { color: urgent ? NEG : '#4FC3F7' }]}>D-{e.dday}</Text>
            </View>
            <View style={styles.calBody}>
              <Text style={styles.calEvent}>{e.event}</Text>
              <Text style={styles.calNote}>{e.date}{e.note ? ` · ${e.note}` : ''}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── 리스크·포지션 카드 ──────────────────────────────────────────────────────
const RISK_COLOR = { '낮음': POS, '보통': NEU, '높음': NEG, '매우 높음': NEG };

function RiskCard({ risk }) {
  if (!risk) return null;
  const gColor = RISK_COLOR[risk.riskGrade] || NEU;
  const cells = [
    { label: '연 변동성', value: `${risk.volatility}%`, color: gColor },
    { label: '최대낙폭', value: `${risk.mdd}%`, color: NEG },
    { label: `${risk.holdingMonths}M 하방(95%)`, value: `-${risk.downside}%`, color: NEG },
    { label: '권장 최대비중', value: `${risk.positionSizePct}%`, color: '#4FC3F7' },
  ];
  if (risk.beta !== null && risk.beta !== undefined) {
    cells.splice(3, 0, { label: '베타', value: `${risk.beta}`, color: '#FFFFFF' });
  }
  return (
    <View style={styles.card}>
      <View style={styles.aiTitleRow}>
        <Text style={styles.cardTitle}>리스크 · 포지션</Text>
        <View style={[styles.riskGradeBadge, { backgroundColor: gColor + '20' }]}>
          <Text style={[styles.riskGradeText, { color: gColor }]}>리스크 {risk.riskGrade}</Text>
        </View>
      </View>
      <View style={styles.riskGrid}>
        {cells.map((c) => (
          <View key={c.label} style={styles.riskCell}>
            <Text style={styles.riskCellLabel}>{c.label}</Text>
            <Text style={[styles.riskCellValue, { color: c.color }]}>{c.value}</Text>
          </View>
        ))}
      </View>
      {risk.note ? <Text style={styles.riskNote}>{risk.note}</Text> : null}
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
          <FairValueCard valuation={engine.valuation} />
          <UniverseCard universeRank={engine.universeRank} />
          <BusinessValueCard businessValue={engine.businessValue} crossCheck={engine.crossCheck} />
          <BullBearCard bullBear={engine.bullBear} />
          <FactorsCard factors={engine.factors} />
          <GuardsCard guards={engine.guards} />
          <InterpretationCard interpretation={data.interpretation} />
          <CalendarCard calendar={engine.calendar} />
          <RiskCard risk={engine.risk} />
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
  trackNote: { fontSize: 10, color: '#6B7280', marginTop: 10, lineHeight: 14, textAlign: 'center' },

  // 적정가 카드
  fvTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  fvLabel: { fontSize: 10, color: '#6B7280', marginBottom: 3, fontWeight: '500' },
  fvPrice: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  fvUpsideBlock: { alignItems: 'flex-end' },
  fvUpside: { fontSize: 22, fontWeight: '800' },
  fvVerdict: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  fvMethods: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  fvMethodChip: {
    backgroundColor: '#0D1128', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#1E2340', alignItems: 'center', flexGrow: 1, minWidth: '30%',
  },
  fvMethodName: { fontSize: 10, color: '#6B7280', marginBottom: 2 },
  fvMethodVal: { fontSize: 12, fontWeight: '700', color: '#C0C8E0' },
  fvFootnote: { fontSize: 10, color: '#6B7280', lineHeight: 15 },
  fvNoneText: { fontSize: 13, color: '#9AA3B5', lineHeight: 19 },

  // 사업가치 카드
  bvVerdict: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  bvVerdictLabel: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  bvVerdictText: { fontSize: 12, color: '#9AA3B5', lineHeight: 17 },
  bvSummary: { fontSize: 13, color: '#C0C8E0', lineHeight: 19, marginBottom: 12 },
  bvRow: { marginBottom: 11 },
  bvRowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  bvRowKey: { fontSize: 12, fontWeight: '700', color: '#C0C8E0' },
  bvLevelBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  bvLevelText: { fontSize: 11, fontWeight: '700' },
  bvRowSub: { fontSize: 11, color: '#8892A4', flex: 1 },
  bvEvidence: { fontSize: 11, color: '#6B7280', lineHeight: 16, fontStyle: 'italic' },

  // 유니버스 카드
  uvSize: { fontSize: 10, color: '#6B7280' },
  uvSummary: { fontSize: 13, color: '#C0C8E0', marginBottom: 10, lineHeight: 19 },
  uvChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  uvChip: {
    backgroundColor: '#0D1128', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#1E2340',
  },
  uvChipLabel: { fontSize: 11, color: '#C0C8E0', fontWeight: '600' },

  // Bull/Bear
  bbBlock: { marginBottom: 12 },
  bbHead: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  bbRow: { flexDirection: 'row', gap: 7, marginBottom: 5, alignItems: 'flex-start' },
  bbDot: { fontSize: 13, lineHeight: 18 },
  bbText: { flex: 1, fontSize: 13, color: '#9AA3B5', lineHeight: 18 },

  // 리스크
  riskGradeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 14 },
  riskGradeText: { fontSize: 10, fontWeight: '700' },
  riskGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  riskCell: {
    flexGrow: 1, minWidth: '21%', backgroundColor: '#0D1128', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#1E2340', alignItems: 'center',
  },
  riskCellLabel: { fontSize: 9, color: '#6B7280', marginBottom: 4, textAlign: 'center' },
  riskCellValue: { fontSize: 15, fontWeight: '700' },
  riskNote: { fontSize: 10, color: '#6B7280', marginTop: 10, lineHeight: 14 },

  // 캘린더
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  calBorder: { borderTopWidth: 1, borderTopColor: '#1E2340' },
  calDday: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, minWidth: 52, alignItems: 'center' },
  calDdayText: { fontSize: 13, fontWeight: '800' },
  calBody: { flex: 1 },
  calEvent: { fontSize: 13, fontWeight: '600', color: '#C0C8E0', marginBottom: 2 },
  calNote: { fontSize: 10, color: '#6B7280', lineHeight: 14 },

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
