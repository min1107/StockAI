import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getOpportunityData } from '../services/kisAPI';
import { getAIRecommendations } from '../services/stockAPI';
import { checkSupplyAnomalyAlert } from '../services/notificationService';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W * 0.72;

// ── AI 발굴 종목 카드 (캐러셀) ───────────────────────────────────────
function AIPickCard({ item, index, onPress }) {
  const isPositive = (item.changeRate || 0) >= 0;
  const priceColor = isPositive ? '#00FF88' : '#FF4466';
  const riskColor = item.riskLevel === '낮음' ? '#00D97E' : item.riskLevel === '높음' ? '#FF4466' : '#FFB800';

  return (
    <TouchableOpacity style={aiStyles.card} onPress={onPress} activeOpacity={0.85}>
      {/* 상단: 랭크 + 섹터 */}
      <View style={aiStyles.topRow}>
        <View style={aiStyles.rankBadge}>
          <Text style={aiStyles.rankText}>{index + 1}</Text>
        </View>
        {item.sector ? (
          <View style={aiStyles.sectorTag}>
            <Text style={aiStyles.sectorText}>{item.sector}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {item.market ? (
          <Text style={aiStyles.marketLabel}>{item.market}</Text>
        ) : null}
      </View>

      {/* 종목명 */}
      <Text style={aiStyles.name} numberOfLines={1}>{item.name}</Text>

      {/* 가격 + 등락 */}
      <View style={aiStyles.priceRow}>
        <Text style={aiStyles.price}>₩{item.currentPrice?.toLocaleString() ?? '—'}</Text>
        <Text style={[aiStyles.change, { color: priceColor }]}>
          {isPositive ? '▲' : '▼'} {Math.abs(item.changeRate || 0).toFixed(2)}%
        </Text>
      </View>

      {/* PBR / PER */}
      {(item.pbr != null || item.per != null) && (
        <View style={aiStyles.metricsRow}>
          {item.pbr != null && (
            <View style={aiStyles.metricPill}>
              <Text style={aiStyles.metricText}>PBR {item.pbr}</Text>
            </View>
          )}
          {item.per != null && (
            <View style={aiStyles.metricPill}>
              <Text style={aiStyles.metricText}>PER {item.per}</Text>
            </View>
          )}
        </View>
      )}

      {/* 선택 이유 */}
      <Text style={aiStyles.reason} numberOfLines={2}>{item.reason}</Text>

      {/* 하단 태그 */}
      <View style={aiStyles.bottomRow}>
        <View style={[aiStyles.riskTag, { borderColor: riskColor + '60', backgroundColor: riskColor + '15' }]}>
          <Text style={[aiStyles.riskText, { color: riskColor }]}>위험 {item.riskLevel}</Text>
        </View>
        {item.targetPeriod && (
          <View style={aiStyles.periodTag}>
            <Text style={aiStyles.periodText}>{item.targetPeriod}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const aiStyles = StyleSheet.create({
  card: {
    width: CARD_W,
    backgroundColor: '#12172E',
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#7C3AED40',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  rankBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center',
  },
  rankText: { fontSize: 12, color: '#FFF', fontWeight: 'bold' },
  sectorTag: {
    backgroundColor: '#1E2A42', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  sectorText: { fontSize: 11, color: '#A78BFA', fontWeight: '600' },
  marketLabel: { fontSize: 11, color: '#4A5568', fontWeight: '600' },
  name: { fontSize: 17, color: '#FFFFFF', fontWeight: 'bold', marginBottom: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  price: { fontSize: 18, color: '#FFFFFF', fontWeight: '700' },
  change: { fontSize: 13, fontWeight: '700' },
  metricsRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  metricPill: {
    backgroundColor: '#1E2A42', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  metricText: { fontSize: 11, color: '#60A5FA', fontWeight: '600' },
  reason: { fontSize: 12, color: '#8A9BAE', lineHeight: 18, marginBottom: 12, flex: 1 },
  bottomRow: { flexDirection: 'row', gap: 8, marginTop: 'auto' },
  riskTag: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  riskText: { fontSize: 11, fontWeight: '700' },
  periodTag: {
    backgroundColor: '#1E2A42', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  periodText: { fontSize: 11, color: '#8A9BAE', fontWeight: '600' },
});

// ── 섹션 헤더 ──────────────────────────────────────────────────────
function SectionHeader({ icon, title, subtitle }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionIcon}>{icon}</Text>
      <View>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={s.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

// ── 수급 이상 카드 ──────────────────────────────────────────────────
function AnomalyCard({ item, onPress }) {
  const isBoth = item.bothBuying;
  const label = isBoth
    ? '기관+외국인 동시 매수'
    : item.type === 'institution'
    ? '기관 집중 매수'
    : '외국인 집중 매수';
  const color = isBoth ? '#FFB800' : item.type === 'institution' ? '#00D9FF' : '#00FF88';

  return (
    <TouchableOpacity style={[s.card, { borderLeftColor: color }]} onPress={onPress} activeOpacity={0.85}>
      <View style={s.cardTop}>
        <Text style={s.cardName}>{item.name}</Text>
        <View style={[s.badge, { backgroundColor: color + '20', borderColor: color + '60' }]}>
          <Text style={[s.badgeText, { color }]}>{label}</Text>
        </View>
      </View>
      <View style={s.cardMetrics}>
        {item.dailyInst != null && item.dailyInst > 0 && (
          <View style={s.metric}>
            <Text style={s.metricLabel}>기관</Text>
            <Text style={[s.metricVal, { color: '#00D9FF' }]}>+{item.dailyInst.toFixed(0)}억</Text>
          </View>
        )}
        {item.dailyForeign != null && item.dailyForeign > 0 && (
          <View style={s.metric}>
            <Text style={s.metricLabel}>외국인</Text>
            <Text style={[s.metricVal, { color: '#00FF88' }]}>+{item.dailyForeign.toFixed(0)}억</Text>
          </View>
        )}
      </View>
      <Text style={s.cardHint}>종목 상세 보기 →</Text>
    </TouchableOpacity>
  );
}

// ── 배당락일 임박 카드 ─────────────────────────────────────────────
function DividendCard({ item, onPress }) {
  const days = item.dividendStatus.daysUntil;
  const urgencyColor = days <= 7 ? '#FF4466' : days <= 14 ? '#FFB800' : '#00D9FF';
  const scheduleLabel = item.schedule === 'quarterly' ? '분기 배당' : '연간 배당';

  return (
    <TouchableOpacity style={[s.card, { borderLeftColor: urgencyColor }]} onPress={onPress} activeOpacity={0.85}>
      <View style={s.cardTop}>
        <Text style={s.cardName}>{item.name}</Text>
        <View style={[s.badge, { backgroundColor: urgencyColor + '20', borderColor: urgencyColor + '60' }]}>
          <Text style={[s.badgeText, { color: urgencyColor }]}>
            {days === 0 ? '오늘 배당락!' : `D-${days}`}
          </Text>
        </View>
      </View>
      <View style={s.cardMetrics}>
        <View style={s.metric}>
          <Text style={s.metricLabel}>배당 종류</Text>
          <Text style={s.metricVal}>{scheduleLabel}</Text>
        </View>
        {item.dividendYield > 0 && (
          <View style={s.metric}>
            <Text style={s.metricLabel}>배당수익률</Text>
            <Text style={[s.metricVal, { color: '#00FF88' }]}>{item.dividendYield.toFixed(2)}%</Text>
          </View>
        )}
        {item.currentPrice > 0 && (
          <View style={s.metric}>
            <Text style={s.metricLabel}>현재가</Text>
            <Text style={s.metricVal}>₩{item.currentPrice.toLocaleString()}</Text>
          </View>
        )}
      </View>
      <Text style={s.cardHint}>
        {item.dividendStatus.exMonth}월 {item.dividendStatus.exDay}일 이전 매수 시 배당 수령 →
      </Text>
    </TouchableOpacity>
  );
}

// ── 수급 TOP 카드 ──────────────────────────────────────────────────
function SupplyTopCard({ items, type }) {
  if (!items || items.length === 0) return null;
  const color = type === 'inst' ? '#00D9FF' : '#00FF88';
  const label = type === 'inst' ? '기관' : '외국인';

  return (
    <View style={s.supplyCard}>
      <Text style={[s.supplyLabel, { color }]}>{label} 순매수 TOP</Text>
      {items.slice(0, 5).map((item, i) => {
        const val = type === 'inst' ? item.dailyInst : item.dailyForeign;
        return (
          <View key={item.code} style={s.supplyRow}>
            <Text style={s.supplyRank}>{i + 1}</Text>
            <Text style={s.supplyName}>{item.name}</Text>
            <Text style={[s.supplyVal, { color: val >= 0 ? color : '#FF4466' }]}>
              {val >= 0 ? '+' : ''}{val?.toFixed(0)}억
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── 메인 화면 ──────────────────────────────────────────────────────
export default function OpportunityScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [aiRecos, setAiRecos] = useState([]);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiUpdatedAt, setAiUpdatedAt] = useState(null);

  const load = async () => {
    try {
      const result = await getOpportunityData();
      setData(result);
      // 수급 이상 감지 알림 체크
      if (result?.supplyAnomalies?.length > 0) {
        await checkSupplyAnomalyAlert(result.supplyAnomalies);
      }
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // AI 발굴 종목(KRX 전종목 스크리닝) — 기회 종목과 별도 소스라 병렬 로드
  const loadAI = async (forceRefresh = false) => {
    setAiLoading(true);
    try {
      const result = await getAIRecommendations(forceRefresh);
      if (result.recommendations?.length > 0) {
        setAiRecos(result.recommendations);
        setAiUpdatedAt(result.updatedAt);
      }
    } catch (e) {
      console.error('AI 추천 로딩 실패:', e.message);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => { load(); loadAI(); }, []);

  const onRefresh = () => { setRefreshing(true); load(); loadAI(true); };

  const goDetail = (code, name) => {
    const symbol = code.length === 6 && /^\d+$/.test(code)
      ? `${code}.KS`
      : code;
    navigation.navigate('OpportunityStockDetail', { symbol, name });
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#00D9FF" size="large" />
        <Text style={s.loadingText}>기회 종목 분석 중...</Text>
      </View>
    );
  }

  const hasAnomaly = (data?.supplyAnomalies?.length ?? 0) > 0;
  const hasDividend = (data?.dividendOpportunities?.length ?? 0) > 0;

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D9FF" />}
      showsVerticalScrollIndicator={false}
    >
      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.headerTitle}>기회 종목</Text>
        <Text style={s.headerSub}>수급 이상 + 배당락일 임박 종목 탐지</Text>
      </View>

      {/* AI 발굴 종목 (KRX 전종목 스크리닝) */}
      <View style={s.aiSection}>
        <View style={s.aiSectionHeader}>
          <View style={s.aiSectionTitleRow}>
            <Text style={s.aiSectionIcon}>🤖</Text>
            <View>
              <Text style={s.sectionTitle}>AI 발굴 종목</Text>
              <Text style={s.aiSectionSub}>KRX 전체 종목 中 저평가 안전주</Text>
            </View>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={() => loadAI(true)} disabled={aiLoading}>
            <Text style={s.refreshBtnText}>{aiLoading ? '분석중...' : '새로고침'}</Text>
          </TouchableOpacity>
        </View>

        {aiLoading && aiRecos.length === 0 ? (
          <View style={s.aiLoadingBox}>
            <ActivityIndicator color="#A78BFA" />
            <Text style={s.aiLoadingText}>KRX 전종목 스크리닝 중...</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.aiCarousel}>
            {aiRecos.map((item, index) => {
              const symbol = item.symbol
                || (item.code ? `${item.code}.${item.market === 'KOSDAQ' || item.market === 'KQ' ? 'KQ' : 'KS'}` : null);
              return (
                <AIPickCard
                  key={item.code || item.symbol}
                  item={item}
                  index={index}
                  onPress={() => navigation.navigate('OpportunityStockDetail', { symbol, name: item.name })}
                />
              );
            })}
          </ScrollView>
        )}

        {aiUpdatedAt && (
          <Text style={s.updatedAt}>
            마지막 업데이트: {new Date(aiUpdatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>

      {/* 수급 이상 섹션 */}
      <SectionHeader
        icon="🔥"
        title="수급 이상 감지"
        subtitle="기관/외국인 단일일 100억+ 순매수"
      />
      {hasAnomaly ? (
        <View style={s.cardList}>
          {data.supplyAnomalies.map(item => (
            <AnomalyCard
              key={item.code}
              item={item}
              onPress={() => goDetail(item.code, item.name)}
            />
          ))}
        </View>
      ) : (
        <View style={s.emptyBox}>
          <Text style={s.emptyText}>현재 100억+ 수급 이상 종목 없음</Text>
          <Text style={s.emptySubText}>아래 수급 TOP 현황을 참고하세요</Text>
        </View>
      )}

      {/* 수급 TOP 현황 */}
      {data?.supply && (
        <>
          <SectionHeader icon="📊" title="오늘의 수급 현황" subtitle={data.supply.collectedAt ? `수집: ${new Date(data.supply.collectedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : null} />
          <View style={s.supplyRow2}>
            <SupplyTopCard items={data.supply.topInstBuy} type="inst" />
            <SupplyTopCard items={data.supply.topForeignBuy} type="foreign" />
          </View>
        </>
      )}

      {/* 배당락일 임박 섹션 */}
      <SectionHeader
        icon="💰"
        title="배당락일 임박"
        subtitle="이 날짜 전에 사야 배당을 받을 수 있습니다"
      />
      {hasDividend ? (
        <View style={s.cardList}>
          {data.dividendOpportunities.map(item => (
            <DividendCard
              key={item.code}
              item={item}
              onPress={() => goDetail(item.code, item.name)}
            />
          ))}
        </View>
      ) : (
        <View style={s.emptyBox}>
          <Text style={s.emptyText}>30일 이내 배당락일 종목 없음</Text>
          <Text style={s.emptySubText}>다음 배당 시즌(3/6/9/12월 말)에 다시 확인하세요</Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E27' },
  center: { flex: 1, backgroundColor: '#0A0E27', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#6B7280', marginTop: 12, fontSize: 14 },

  header: {
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: '#1E2A42',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#FFFFFF' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 4 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12,
  },
  sectionIcon: { fontSize: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  sectionSubtitle: { fontSize: 11, color: '#6B7280', marginTop: 2 },

  // AI 발굴 종목 섹션
  aiSection: { paddingTop: 8 },
  aiSectionHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  aiSectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  aiSectionIcon: { fontSize: 20 },
  aiSectionSub: { fontSize: 11, color: '#A78BFA', marginTop: 2 },
  refreshBtn: {
    borderWidth: 1, borderColor: '#A78BFA60', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#A78BFA15',
  },
  refreshBtnText: { color: '#A78BFA', fontSize: 12, fontWeight: '700' },
  aiLoadingBox: { alignItems: 'center', paddingVertical: 36, gap: 10 },
  aiLoadingText: { color: '#6B7280', fontSize: 13 },
  aiCarousel: { paddingBottom: 4, paddingLeft: 16, paddingRight: 16 },
  updatedAt: { fontSize: 11, color: '#4A5568', marginTop: 10, paddingHorizontal: 20 },

  cardList: { paddingHorizontal: 16, gap: 10 },
  card: {
    backgroundColor: '#12172E', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#1E2A42',
    borderLeftWidth: 3,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', flex: 1 },
  badge: {
    borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardMetrics: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  metric: {},
  metricLabel: { fontSize: 10, color: '#6B7280', marginBottom: 2 },
  metricVal: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  cardHint: { fontSize: 11, color: '#4A5568' },

  emptyBox: {
    marginHorizontal: 16, padding: 20,
    backgroundColor: '#12172E', borderRadius: 14,
    borderWidth: 1, borderColor: '#1E2A42',
    alignItems: 'center',
  },
  emptyText: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  emptySubText: { fontSize: 12, color: '#4A5568', marginTop: 6, textAlign: 'center' },

  supplyRow2: { paddingHorizontal: 16, flexDirection: 'row', gap: 10 },
  supplyCard: {
    flex: 1, backgroundColor: '#12172E', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#1E2A42',
  },
  supplyLabel: { fontSize: 11, fontWeight: '700', marginBottom: 8 },
  supplyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#1E2A42' },
  supplyRank: { fontSize: 11, color: '#4A5568', width: 16, fontWeight: '700' },
  supplyName: { fontSize: 12, color: '#D0D8E8', flex: 1 },
  supplyVal: { fontSize: 12, fontWeight: '700' },
});
