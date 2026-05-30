import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ─── 유틸 ──────────────────────────────────────────────────────────────────

/**
 * 텍스트 안의 큰 숫자를 한국식 단위로 변환
 * 180,000원 → 약 18만원 / 108,119억 → 약 10.8조 / 310,000원 → 약 31만원
 */
const simplifyNumbers = (text) => {
  if (!text) return text;

  // ① 억 단위 처리 (부호 포함)
  text = text.replace(/([-+]?)([\d,]+)억/g, (match, sign, numStr) => {
    const n = parseInt(numStr.replace(/,/g, ''), 10);
    if (isNaN(n)) return match;
    const abs = n;
    // 1만억(=1조) 이상 → X.X조
    if (abs >= 10000) {
      const val = (abs / 10000).toFixed(1).replace(/\.0$/, '');
      return `약 ${sign}${val}조`;
    }
    // 1000억 이상 → 반올림해서 X천억
    if (abs >= 1000) {
      const val = Math.round(abs / 1000);
      return `약 ${sign}${val}천억`;
    }
    return match; // 999억 이하는 그대로
  });

  // ② 원 단위 처리 (부호 포함)
  text = text.replace(/([-+]?)([\d,]+)원/g, (match, sign, numStr) => {
    const n = parseInt(numStr.replace(/,/g, ''), 10);
    if (isNaN(n)) return match;
    // 1억원 이상 → X.X억원
    if (n >= 100000000) {
      const val = (n / 100000000).toFixed(1).replace(/\.0$/, '');
      return `약 ${sign}${val}억원`;
    }
    // 1만원 이상 → X만원
    if (n >= 10000) {
      const val = Math.round(n / 10000);
      return `약 ${sign}${val}만원`;
    }
    return match;
  });

  return text;
};

const getVerdictColor = (rec) => {
  if (!rec) return '#FFB800';
  if (rec.includes('매수') || rec.includes('추가')) return '#00D97E';
  if (rec.includes('매도')) return '#FF4466';
  return '#FFB800';
};

const getReasonMeta = (text = '') => {
  if (/달러|환율|유가|금|선물|매크로|글로벌|지정학|전쟁|금리/.test(text))
    return { icon: '🌍', color: '#60A5FA' }; // 파랑 — 거시경제
  if (/기관|외국인|수급|스마트머니/.test(text))
    return { icon: '💰', color: '#A78BFA' }; // 보라 — 수급
  if (/RSI|MACD|볼린저|기술|차트|골든|데드/.test(text))
    return { icon: '📊', color: '#34D399' }; // 초록 — 기술지표
  if (/뉴스|감성|이슈|공시/.test(text))
    return { icon: '📰', color: '#FBBF24' }; // 노랑 — 뉴스
  if (/안전마진|고점|저점|52주|회복|저평가|PBR|PER/.test(text))
    return { icon: '📈', color: '#00D97E' }; // 초록 — 밸류
  if (/리스크|위험|주의|경계|손절/.test(text))
    return { icon: '⚠️', color: '#FF4466' }; // 빨강 — 위험
  return { icon: '▸', color: '#9AA3B5' };
};

// reason 텍스트를 "데이터부분 — 해석부분" 으로 분리
const splitReason = (text = '') => {
  const sep = text.indexOf(' — ');
  if (sep !== -1) {
    return { label: text.slice(0, sep).trim(), desc: text.slice(sep + 3).trim() };
  }
  return { label: null, desc: text.trim() };
};

// 텍스트에서 숫자/퍼센트/금액을 강조 렌더링
function HighlightedText({ text, baseStyle, highlightColor = '#FFD060' }) {
  if (!text) return null;
  // 숫자 패턴: +12.3%, -5억, 1,234원, ₩5,000 등
  const parts = text.split(/(\+?\-?[\d,]+\.?\d*[%억원₩]?(?:억|원|%)?)/g);
  return (
    <Text style={baseStyle}>
      {parts.map((part, i) => {
        const isNum = /[\d,]+/.test(part) && /[%억원₩]/.test(part);
        const isPlus = part.startsWith('+');
        const isMinus = part.startsWith('-') && /\d/.test(part);
        const numColor = isPlus ? '#00D97E' : isMinus ? '#FF4466' : highlightColor;
        return isNum
          ? <Text key={i} style={{ color: numColor, fontWeight: '700' }}>{part}</Text>
          : <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

// 신호 칩: reasons에서 핵심 수치 추출
function extractSignalChips(reasons = []) {
  const chips = [];
  for (const r of reasons) {
    // 숫자+단위 패턴 추출
    const matches = r.match(/(?:RSI\s*\d+|[+-]?\d+(?:,\d+)*(?:\.\d+)?(?:%|억|조)?(?:\s*(?:과매도|과매수|순매수|순매도|하락|상승))?)/g);
    if (matches) {
      for (const m of matches.slice(0, 1)) {
        if (chips.length >= 3) break;
        const isPos = /순매수|상승|골든/.test(r) || (m.startsWith('+') && !m.startsWith('+-'));
        const isNeg = /순매도|하락|데드|과매수/.test(r) || m.startsWith('-');
        chips.push({ label: m.trim(), positive: isPos, negative: isNeg });
      }
    }
    if (chips.length >= 3) break;
  }
  return chips;
}

// ─── 로딩 ──────────────────────────────────────────────────────────────────

function LoadingView() {
  return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator size="small" color="#9D4EDD" />
      <Text style={styles.loadingText}>AI 분석 중입니다...</Text>
    </View>
  );
}

// ─── 탭 ────────────────────────────────────────────────────────────────────

function TabBar({ selected, onSelect }) {
  return (
    <View style={styles.tabBar}>
      {[
        { id: 'conservative', label: '가치투자', icon: '🛡️' },
        { id: 'aggressive',   label: '성장투자', icon: '⚡' },
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

// ─── 판정 카드 ──────────────────────────────────────────────────────────────

function VerdictCard({ analysis }) {
  const color = getVerdictColor(analysis?.recommendation);
  const confidence = analysis?.confidence ?? 0;
  const chips = extractSignalChips((analysis?.reasons ?? []).map(simplifyNumbers));

  return (
    <View style={[styles.verdictCard, { borderTopColor: color, borderTopWidth: 3 }]}>
      {/* 추천 + 신뢰도 한 줄 */}
      <View style={styles.verdictTopRow}>
        <Text style={[styles.verdictLabel, { color }]}>
          {analysis?.recommendation ?? '—'}
        </Text>
        <View style={styles.confPill}>
          <View style={[styles.confDot, { backgroundColor: color }]} />
          <Text style={[styles.confPillText, { color }]}>{confidence}%</Text>
        </View>
      </View>

      {/* 신뢰도 바 */}
      <View style={styles.confBarBg}>
        <View style={[styles.confBarFill, { width: `${confidence}%`, backgroundColor: color }]} />
      </View>

      {/* 신호 칩 */}
      {chips.length > 0 && (
        <View style={styles.chipRow}>
          {chips.map((c, i) => {
            const chipColor = c.positive ? '#00D97E' : c.negative ? '#FF4466' : '#9AA3B5';
            return (
              <View key={i} style={[styles.chip, { borderColor: chipColor + '50', backgroundColor: chipColor + '15' }]}>
                <Text style={[styles.chipText, { color: chipColor }]}>{c.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* 핵심 코멘트 — 왼쪽 컬러 테두리 + 숫자 강조 */}
      {analysis?.comment ? (
        <View style={[styles.commentBox, { borderLeftColor: color }]}>
          <HighlightedText
            text={simplifyNumbers(analysis.comment)}
            baseStyle={styles.commentText}
            highlightColor={color}
          />
        </View>
      ) : null}
    </View>
  );
}

// ─── 근거 카드 ──────────────────────────────────────────────────────────────

function ReasonItem({ text, index }) {
  const { icon, color } = getReasonMeta(text);
  const { label, desc } = splitReason(simplifyNumbers(text));

  return (
    <View style={[styles.reasonRow, index > 0 && styles.reasonBorder]}>
      {/* 왼쪽 컬러 인디케이터 */}
      <View style={[styles.reasonStripe, { backgroundColor: color }]} />

      <Text style={styles.reasonIcon}>{icon}</Text>

      <View style={styles.reasonBody}>
        {label ? (
          <HighlightedText
            text={label}
            baseStyle={[styles.reasonLabel, { color }]}
            highlightColor={color}
          />
        ) : null}
        <Text style={styles.reasonDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function ReasonsCard({ reasons = [] }) {
  const shown = reasons.slice(0, 3);
  if (shown.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>판단 근거</Text>
      {shown.map((r, i) => (
        <ReasonItem key={i} text={r} index={i} />
      ))}
    </View>
  );
}

// ─── 전략 숫자 ──────────────────────────────────────────────────────────────

function StrategyCard({ analysis }) {
  const items = [
    { label: '목표가',   value: analysis?.targetPrice  ? `₩${analysis.targetPrice.toLocaleString()}`  : '—', color: '#00D97E' },
    { label: '손절가',   value: analysis?.stopLoss     ? `₩${analysis.stopLoss.toLocaleString()}`     : '—', color: '#FF4466' },
    { label: '보유 기간', value: analysis?.holdingPeriod ?? '—', color: '#FFFFFF' },
    { label: '진입 전략', value: analysis?.entryStrategy ?? '—', color: '#FFFFFF' },
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

// ─── 전체 분석 (접힘/펼침) ──────────────────────────────────────────────────

function FullAnalysis({ reasons = [] }) {
  const [open, setOpen] = useState(false);
  const extra = reasons.slice(3);
  if (extra.length === 0) return null;

  return (
    <>
      <TouchableOpacity style={styles.expandBtn} onPress={() => setOpen(v => !v)} activeOpacity={0.7}>
        <Text style={styles.expandText}>{open ? '접기 ↑' : `나머지 근거 ${extra.length}개 보기 ↓`}</Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.card}>
          {extra.map((r, i) => (
            <ReasonItem key={i} text={r} index={i} />
          ))}
        </View>
      )}
    </>
  );
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────────────

export default function AIAnalysis({ conservativeAnalysis, aggressiveAnalysis, loading }) {
  const [tab, setTab] = useState('conservative');
  const analysis = tab === 'conservative' ? conservativeAnalysis : aggressiveAnalysis;

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI 투자 분석</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>실시간 매크로 반영</Text>
        </View>
      </View>

      {/* 탭 */}
      <TabBar selected={tab} onSelect={setTab} />

      {loading ? (
        <LoadingView />
      ) : !analysis ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>분석 데이터를 불러오는 중입니다...</Text>
        </View>
      ) : (
        <>
          <VerdictCard analysis={analysis} />
          <ReasonsCard reasons={analysis.reasons} />
          <StrategyCard analysis={analysis} />
          <FullAnalysis reasons={analysis.reasons} />
        </>
      )}
    </View>
  );
}

// ─── 스타일 ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  badge: {
    backgroundColor: '#9D4EDD20',
    borderWidth: 1,
    borderColor: '#9D4EDD60',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    color: '#9D4EDD',
    fontWeight: '600',
  },

  // 탭
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#161B35',
    borderWidth: 1,
    borderColor: '#252A47',
  },
  tabActive: {
    backgroundColor: '#9D4EDD',
    borderColor: '#9D4EDD',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  // 로딩
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 13,
  },

  // 카드 공통
  card: {
    backgroundColor: '#161B35',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#252A47',
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // 판정 카드
  verdictCard: {
    backgroundColor: '#161B35',
    borderRadius: 14,
    padding: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#252A47',
  },
  verdictTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  verdictLabel: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  confPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1128',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  confDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  confPillText: {
    fontSize: 15,
    fontWeight: '700',
  },
  confBarBg: {
    height: 4,
    backgroundColor: '#252A47',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 14,
  },
  confBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // 신호 칩
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  chip: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // 코멘트 박스
  commentBox: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 4,
  },
  commentText: {
    fontSize: 14,
    color: '#C0C8E0',
    lineHeight: 22,
  },

  // 근거
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 11,
  },
  reasonBorder: {
    borderTopWidth: 1,
    borderTopColor: '#1E2340',
  },
  reasonStripe: {
    width: 3,
    borderRadius: 2,
    alignSelf: 'stretch',
    minHeight: 20,
    opacity: 0.7,
  },
  reasonIcon: {
    fontSize: 15,
    marginTop: 1,
    width: 20,
    textAlign: 'center',
  },
  reasonBody: {
    flex: 1,
    gap: 3,
  },
  reasonLabel: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  reasonDesc: {
    fontSize: 13,
    color: '#9AA3B5',
    lineHeight: 20,
  },

  // 전략
  strategyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  strategyCell: {
    width: '47%',
    backgroundColor: '#0D1128',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E2340',
    alignItems: 'center',
  },
  strategyLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 5,
    fontWeight: '500',
    textAlign: 'center',
  },
  strategyValue: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },

  // 전체 분석 더보기
  expandBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 4,
  },
  expandText: {
    fontSize: 13,
    color: '#9D4EDD',
    fontWeight: '600',
  },
});
