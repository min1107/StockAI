import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { fetchStockData, searchStocks, validateStockByCode, getAIRecommendations } from '../services/stockAPI';
import { getKISMarketIndex, warmupKISToken, getMacroContext, getSectorData } from '../services/kisAPI';
import { loadNotifSettings, checkKospiAlert } from '../services/notificationService';
import AIChatModal from '../components/AIChatModal';
import { useAuth } from '../context/AuthContext';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W * 0.72;

const ONBOARDING_DONE_KEY = '@StockAI:onboardingDone';
const FAVORITES_STORAGE_KEY = '@StockAI:favorites';

// ── 날짜 포매터 ──────────────────────────────────────────────────────
const getDateString = () => {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
};

// ── 시장 overview 카드 ───────────────────────────────────────────────
function MarketCard({ label, value, change, changePct, isUp, loading }) {
  if (loading) {
    return (
      <View style={mStyles.card}>
        <Text style={mStyles.label}>{label}</Text>
        <View style={mStyles.skeleton} />
        <View style={[mStyles.skeleton, { width: 50, marginTop: 4 }]} />
      </View>
    );
  }
  const color = change == null ? '#8A9BAE' : isUp ? '#00FF88' : '#FF4466';
  const arrow = change == null ? '' : isUp ? '▲' : '▼';
  return (
    <View style={mStyles.card}>
      <Text style={mStyles.label}>{label}</Text>
      <Text style={mStyles.value}>{value}</Text>
      {change != null && (
        <Text style={[mStyles.change, { color }]}>
          {arrow} {changePct != null ? `${Math.abs(changePct).toFixed(2)}%` : change}
        </Text>
      )}
    </View>
  );
}

const mStyles = StyleSheet.create({
  card: {
    backgroundColor: '#12172E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 10,
    minWidth: 100,
    borderWidth: 1,
    borderColor: '#1E2A42',
  },
  label: { fontSize: 11, color: '#8A9BAE', fontWeight: '700', marginBottom: 4 },
  value: { fontSize: 15, color: '#FFFFFF', fontWeight: '700' },
  change: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  skeleton: { height: 14, width: 70, backgroundColor: '#1E2A42', borderRadius: 4 },
});

// ── 섹터 칩 ──────────────────────────────────────────────────────────
function SectorChip({ name, changeRate, isUp }) {
  const color = isUp ? '#00FF88' : '#FF4466';
  const bg = isUp ? '#00FF8815' : '#FF446615';
  return (
    <View style={[sStyles.chip, { borderColor: color + '40', backgroundColor: bg }]}>
      <Text style={sStyles.name}>{name}</Text>
      <Text style={[sStyles.rate, { color }]}>
        {isUp ? '▲' : '▼'}{Math.abs(changeRate).toFixed(1)}%
      </Text>
    </View>
  );
}

const sStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    gap: 5,
  },
  name: { fontSize: 12, color: '#D0D8E8', fontWeight: '600' },
  rate: { fontSize: 11, fontWeight: '700' },
});

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

// ── 메인 홈스크린 ────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const [favorites, setFavorites] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiRecommendations, setAiRecommendations] = useState([]);
  const [aiRecoLoading, setAiRecoLoading] = useState(false);
  const [aiRecoUpdatedAt, setAiRecoUpdatedAt] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [marketIndex, setMarketIndex] = useState(null);
  const [macroData, setMacroData] = useState(null);
  const [sectorData, setSectorData] = useState([]);
  const [searchVisible, setSearchVisible] = useState(false);
  const [myPageVisible, setMyPageVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeValidating, setCodeValidating] = useState(false);
  const [codeError, setCodeError] = useState('');
  const isLoadingStocksRef = useRef(false);
  const pendingReloadRef = useRef(false);
  const { user, signOut } = useAuth();

  useEffect(() => {
    warmupKISToken().then(() => {
      loadMarketIndex();
      loadAIRecommendations();
    });
    loadFavorites();
    loadMacro();
    loadSectors();
  }, []);

  const loadMacro = async () => {
    const data = await getMacroContext();
    if (data?.macro) setMacroData(data.macro);
  };

  const loadSectors = async () => {
    const data = await getSectorData();
    if (data?.sectors?.length > 0) setSectorData(data.sectors);
  };

  const loadAIRecommendations = async (forceRefresh = false) => {
    setAiRecoLoading(true);
    try {
      const result = await getAIRecommendations(forceRefresh);
      if (result.recommendations?.length > 0) {
        setAiRecommendations(result.recommendations);
        setAiRecoUpdatedAt(result.updatedAt);
      }
    } catch (error) {
      console.error('AI 추천 로딩 실패:', error.message);
    } finally {
      setAiRecoLoading(false);
    }
  };

  const loadMarketIndex = async () => {
    const data = await getKISMarketIndex();
    if (data) {
      setMarketIndex(data);
      // KOSPI/KOSDAQ 급변동 알림 체크
      const notifSettings = await loadNotifSettings();
      if (notifSettings.kospiAlert) {
        await checkKospiAlert(data, notifSettings.kospiThresholdPct);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadFavorites);
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    loadStocks();
  }, [favorites]);

  useEffect(() => {
    const delay = setTimeout(async () => {
      if (searchQuery.trim().length > 0) {
        setSearchLoading(true);
        const results = await searchStocks(searchQuery);
        setSearchResults(results);
        setSearchLoading(false);
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  const loadFavorites = async () => {
    try {
      const saved = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
      if (saved) setFavorites(JSON.parse(saved));
    } catch {}
  };

  const saveFavorites = async (newFavorites) => {
    try {
      await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(newFavorites));
      setFavorites(newFavorites);
    } catch {}
  };

  const addFavorite = (stock) => {
    if (!favorites.some(f => f.symbol === stock.symbol)) {
      saveFavorites([...favorites, stock]);
    }
  };

  const addByCode = async () => {
    const code = codeInput.trim();
    if (!/^\d{6}$/.test(code)) {
      setCodeError('6자리 숫자 코드를 입력해주세요 (예: 005930)');
      return;
    }
    setCodeError('');
    setCodeValidating(true);
    try {
      const stock = await validateStockByCode(code);
      if (stock) {
        addFavorite(stock);
        setCodeInput('');
        setSearchQuery('');
        setSearchResults([]);
        Alert.alert('추가 완료', `${stock.name}이(가) 관심종목에 추가되었습니다.`);
      } else {
        setCodeError('유효하지 않은 종목코드입니다.');
      }
    } catch {
      setCodeError('조회 중 오류가 발생했습니다.');
    } finally {
      setCodeValidating(false);
    }
  };

  const removeFavorite = (symbol) => {
    saveFavorites(favorites.filter(f => f.symbol !== symbol));
  };

  const loadStocks = async () => {
    if (isLoadingStocksRef.current) {
      pendingReloadRef.current = true;
      return;
    }
    if (favorites.length === 0) {
      setLoading(false);
      setRefreshing(false);
      setStocks([]);
      return;
    }
    isLoadingStocksRef.current = true;
    pendingReloadRef.current = false;
    try {
      const snapshot = [...favorites];
      const data = await fetchStockData(snapshot.map(s => s.symbol));
      const stocksWithNames = data.map((stock, i) => ({
        ...stock,
        name: snapshot[i]?.name ?? stock.name,
      }));
      setStocks(stocksWithNames);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
      isLoadingStocksRef.current = false;
      if (pendingReloadRef.current) {
        pendingReloadRef.current = false;
        loadStocks();
      }
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadMarketIndex();
    loadMacro();
    loadSectors();
    loadStocks();
  };

  // ── 관심종목 카드 ──────────────────────────────────────────────────
  const renderStockCard = (item, drag = null) => {
    const change = item.regularMarketChange || 0;
    const changePct = item.regularMarketChangePercent || 0;
    const isPositive = change >= 0;
    const borderColor = isPositive ? '#00FF8830' : '#FF446630';
    const priceColor = isPositive ? '#00FF88' : '#FF4466';

    const cardContent = (
      <TouchableOpacity
        style={[styles.watchCard, { borderLeftColor: isPositive ? '#00FF88' : '#FF4466' }]}
        onPress={() => navigation.navigate('StockDetail', { symbol: item.symbol, name: item.name })}
        onLongPress={drag}
        delayLongPress={100}
        activeOpacity={0.85}
      >
        <View style={styles.watchCardTop}>
          <View style={styles.watchInfo}>
            <Text style={styles.watchName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.watchCode}>{item.symbol}</Text>
          </View>
          <View style={styles.watchPriceCol}>
            <Text style={styles.watchPrice}>
              ₩{item.regularMarketPrice?.toLocaleString() ?? '—'}
            </Text>
            <Text style={[styles.watchChange, { color: priceColor }]}>
              {isPositive ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
            </Text>
          </View>
        </View>
        <View style={styles.watchCardBottom}>
          <View style={styles.watchStat}>
            <Text style={styles.watchStatLabel}>고가</Text>
            <Text style={[styles.watchStatValue, { color: '#00FF88' }]}>
              {item.regularMarketDayHigh?.toLocaleString() ?? '—'}
            </Text>
          </View>
          <View style={styles.watchStat}>
            <Text style={styles.watchStatLabel}>저가</Text>
            <Text style={[styles.watchStatValue, { color: '#FF4466' }]}>
              {item.regularMarketDayLow?.toLocaleString() ?? '—'}
            </Text>
          </View>
          <View style={styles.watchStat}>
            <Text style={styles.watchStatLabel}>거래량</Text>
            <Text style={styles.watchStatValue}>
              {item.regularMarketVolume >= 1000000
                ? `${(item.regularMarketVolume / 1000000).toFixed(1)}M`
                : item.regularMarketVolume >= 1000
                ? `${(item.regularMarketVolume / 1000).toFixed(0)}K`
                : (item.regularMarketVolume ?? 0).toLocaleString()}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );

    return (
      <Swipeable
        renderRightActions={() => (
          <TouchableOpacity
            style={styles.deleteSwipe}
            onPress={() => removeFavorite(item.symbol)}
          >
            <Text style={styles.deleteSwipeText}>삭제</Text>
          </TouchableOpacity>
        )}
        overshootRight={false}
      >
        {cardContent}
      </Swipeable>
    );
  };

  // ── 시장 overview 카드 데이터 구성 ──────────────────────────────────
  const buildMarketCards = () => {
    const cards = [];

    if (marketIndex) {
      const k = marketIndex.kospi;
      cards.push({ label: 'KOSPI', value: k.price.toLocaleString(undefined, { maximumFractionDigits: 2 }), changePct: k.changeRate, isUp: k.changeRate >= 0 });
      const q = marketIndex.kosdaq;
      cards.push({ label: 'KOSDAQ', value: q.price.toLocaleString(undefined, { maximumFractionDigits: 2 }), changePct: q.changeRate, isUp: q.changeRate >= 0 });
    } else {
      cards.push({ label: 'KOSPI', loading: true });
      cards.push({ label: 'KOSDAQ', loading: true });
    }

    const usdKrw = typeof macroData?.usdKrw === 'number' ? macroData.usdKrw : macroData?.usdKrw?.price;
    if (usdKrw) {
      cards.push({ label: 'USD/KRW', value: `${usdKrw.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원` });
    }

    if (macroData?.spFutures) {
      const sp = macroData.spFutures;
      cards.push({ label: 'S&P선물', value: sp.price.toLocaleString(undefined, { maximumFractionDigits: 0 }), changePct: sp.changePct, isUp: sp.changePct >= 0 });
    }

    if (macroData?.wti) {
      const wti = macroData.wti;
      cards.push({ label: 'WTI', value: `$${wti.price.toFixed(1)}`, changePct: wti.changePct, isUp: wti.changePct >= 0 });
    }

    if (macroData?.gold) {
      const g = macroData.gold;
      cards.push({ label: '금', value: `$${g.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, changePct: g.changePct, isUp: g.changePct >= 0 });
    }

    return cards;
  };

  const marketCards = buildMarketCards();

  if (loading && favorites.length > 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00D9FF" />
        <Text style={styles.loadingText}>데이터 로딩 중...</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00D9FF"
            colors={['#00D9FF']}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── 헤더 ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>StockAI</Text>
            <Text style={styles.headerDate}>{getDateString()}</Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => {
                setSearchVisible(v => !v);
                if (searchVisible) { setSearchQuery(''); setSearchResults([]); }
              }}
            >
              <Text style={styles.iconBtnText}>{searchVisible ? '✕' : '🔍'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setMyPageVisible(true)}>
              <Text style={styles.iconBtnText}>👤</Text>
              {user && <View style={styles.loginDot} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 검색바 ── */}
        {searchVisible && (
          <View style={styles.searchBar}>
            <TextInput
              style={styles.searchInput}
              placeholder="종목명 또는 심볼 검색"
              placeholderTextColor="#4A5568"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchLoading && (
              <ActivityIndicator size="small" color="#00D9FF" style={styles.searchSpinner} />
            )}
          </View>
        )}

        {/* ── 시장 overview 스트립 ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.marketStrip}
        >
          {marketCards.map((c, i) => (
            <MarketCard key={c.label + i} {...c} />
          ))}
        </ScrollView>

        {/* ── 섹터 흐름 칩 ── */}
        {sectorData.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sectorStrip}
          >
            {sectorData.map(s => (
              <SectorChip key={s.name} name={s.name} changeRate={s.changeRate} isUp={s.isUp} />
            ))}
          </ScrollView>
        )}

        {/* ── 검색 결과 ── */}
        {searchQuery.trim().length > 0 && searchResults.length > 0 && (
          <View style={styles.searchResults}>
            <Text style={styles.searchResultsTitle}>검색 결과 ({searchResults.length}개)</Text>
            {searchResults.map(result => (
              <TouchableOpacity
                key={result.symbol}
                style={styles.searchResultRow}
                onPress={() => {
                  navigation.navigate('StockDetail', { symbol: result.symbol, name: result.name });
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchVisible(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.searchResultName}>{result.name}</Text>
                  <Text style={styles.searchResultSymbol}>{result.symbol}</Text>
                </View>
                <TouchableOpacity
                  style={styles.searchAddBtn}
                  onPress={e => {
                    e.stopPropagation();
                    addFavorite({ symbol: result.symbol, name: result.name });
                    setSearchQuery('');
                    setSearchResults([]);
                    setSearchVisible(false);
                  }}
                >
                  <Text style={styles.searchAddBtnText}>⭐ 추가</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 검색 결과 없음 + 코드 직접 입력 */}
        {searchQuery.trim().length > 0 && !searchLoading && searchResults.length === 0 && (
          <View style={styles.searchResults}>
            <Text style={styles.noResults}>"{searchQuery}" 검색 결과가 없습니다</Text>
            <View style={styles.codeSection}>
              <Text style={styles.codeSectionLabel}>종목코드로 직접 추가</Text>
              <Text style={styles.codeSectionHint}>6자리 종목코드 (예: 005930)</Text>
              <View style={styles.codeRow}>
                <TextInput
                  style={styles.codeField}
                  placeholder="000000"
                  placeholderTextColor="#4A5568"
                  value={codeInput}
                  onChangeText={t => { setCodeInput(t); setCodeError(''); }}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <TouchableOpacity
                  style={[styles.codeAddBtn, codeValidating && { opacity: 0.5 }]}
                  onPress={addByCode}
                  disabled={codeValidating}
                >
                  <Text style={styles.codeAddBtnText}>{codeValidating ? '확인 중...' : '추가'}</Text>
                </TouchableOpacity>
              </View>
              {codeError ? <Text style={styles.codeError}>{codeError}</Text> : null}
            </View>
          </View>
        )}

        {/* ── AI 발굴 종목 ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>🤖 AI 발굴 종목</Text>
              <Text style={styles.sectionSub}>KRX 전체 종목 中 저평가 안전주</Text>
            </View>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={() => loadAIRecommendations(true)}
              disabled={aiRecoLoading}
            >
              <Text style={styles.refreshBtnText}>{aiRecoLoading ? '분석중...' : '새로고침'}</Text>
            </TouchableOpacity>
          </View>

          {aiRecoLoading && aiRecommendations.length === 0 ? (
            <View style={styles.aiLoadingBox}>
              <ActivityIndicator color="#A78BFA" />
              <Text style={styles.aiLoadingText}>KRX 전종목 스크리닝 중...</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.aiCarousel}
            >
              {aiRecommendations.map((item, index) => {
                const symbol = item.code ? `${item.code}.${item.market}` : item.symbol;
                return (
                  <AIPickCard
                    key={item.code || item.symbol}
                    item={item}
                    index={index}
                    onPress={() => navigation.navigate('StockDetail', { symbol, name: item.name })}
                  />
                );
              })}
            </ScrollView>
          )}

          {aiRecoUpdatedAt && (
            <Text style={styles.updatedAt}>
              마지막 업데이트: {new Date(aiRecoUpdatedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>

        {/* ── 관심 종목 ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>⭐ 관심 종목</Text>
            {favorites.length > 0 && (
              <Text style={styles.sectionHint}>← 스와이프하여 삭제</Text>
            )}
          </View>

          {favorites.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>관심 종목이 없어요</Text>
              <Text style={styles.emptySub}>검색 버튼으로 종목을 추가해보세요</Text>
              <TouchableOpacity
                style={styles.emptySearchBtn}
                onPress={() => setSearchVisible(true)}
              >
                <Text style={styles.emptySearchBtnText}>종목 검색하기</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // 일반 목록으로 렌더 — 드래그 리스트(중첩 VirtualizedList)를 빼서 스크롤이 매끄러움
            favorites.map(fav => {
              const stockData = stocks.find(s => s.symbol === fav.symbol);
              const item = stockData || {
                ...fav,
                regularMarketPrice: 0,
                regularMarketChange: 0,
                regularMarketChangePercent: 0,
                regularMarketDayHigh: 0,
                regularMarketDayLow: 0,
                regularMarketVolume: 0,
                currency: 'KRW',
              };
              return <View key={item.symbol}>{renderStockCard(item)}</View>;
            })
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── AI 채팅 플로팅 버튼 ── */}
      <TouchableOpacity style={styles.chatFab} onPress={() => setChatVisible(true)}>
        <Text style={styles.chatFabText}>💬</Text>
      </TouchableOpacity>

      {/* ── AI 채팅 모달 ── */}
      <AIChatModal visible={chatVisible} onClose={() => setChatVisible(false)} />

      {/* ── 마이페이지 모달 ── */}
      <Modal visible={myPageVisible} transparent animationType="slide" onRequestClose={() => setMyPageVisible(false)}>
        <TouchableOpacity style={styles.myPageOverlay} activeOpacity={1} onPress={() => setMyPageVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.myPagePanel}>
            <View style={styles.myPageHandle} />
            <Text style={styles.myPageTitle}>마이페이지</Text>

            {user ? (
              <>
                <View style={styles.myPageUserBox}>
                  <View style={styles.myPageAvatar}>
                    <Text style={styles.myPageAvatarText}>{user.email[0].toUpperCase()}</Text>
                  </View>
                  <View>
                    <Text style={styles.myPageEmail}>{user.email}</Text>
                    <Text style={styles.myPageStatus}>로그인됨</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.myPageMenuBtn}
                  onPress={() => { setMyPageVisible(false); navigation.getParent()?.navigate('PortfolioTab'); }}
                >
                  <Text style={styles.myPageMenuIcon}>💼</Text>
                  <Text style={styles.myPageMenuText}>내 포트폴리오</Text>
                  <Text style={styles.myPageMenuArrow}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.myPageLogoutBtn}
                  onPress={async () => { await signOut(); setMyPageVisible(false); }}
                >
                  <Text style={styles.myPageLogoutText}>로그아웃</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.myPageGuestBox}>
                  <Text style={styles.myPageGuestIcon}>👤</Text>
                  <Text style={styles.myPageGuestTitle}>로그인이 필요합니다</Text>
                  <Text style={styles.myPageGuestSub}>로그인하면 포트폴리오를{'\n'}저장하고 관리할 수 있어요</Text>
                </View>
                <TouchableOpacity
                  style={styles.myPageLoginBtn}
                  onPress={() => { setMyPageVisible(false); navigation.getParent()?.navigate('PortfolioTab'); }}
                >
                  <Text style={styles.myPageLoginBtnText}>로그인 / 회원가입</Text>
                </TouchableOpacity>
              </>
            )}

            {__DEV__ && (
              <TouchableOpacity
                style={styles.devBtn}
                onPress={() => {
                  Alert.alert('온보딩 초기화', '앱을 재시작하면 온보딩이 다시 표시됩니다.', [
                    { text: '취소', style: 'cancel' },
                    {
                      text: '초기화', style: 'destructive',
                      onPress: async () => {
                        await AsyncStorage.multiRemove([ONBOARDING_DONE_KEY, '@StockAI:favorites']);
                        setMyPageVisible(false);
                        Alert.alert('완료', '앱을 완전히 종료 후 다시 실행해주세요.');
                      },
                    },
                  ]);
                }}
              >
                <Text style={styles.devBtnText}>🛠 온보딩 초기화 (개발용)</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E1F' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0E1F' },
  loadingText: { color: '#8A9BAE', marginTop: 10, fontSize: 14 },

  // 헤더
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 58, paddingBottom: 14,
    backgroundColor: '#0D1124',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  headerDate: { fontSize: 12, color: '#8A9BAE', marginTop: 2 },
  headerIcons: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#12172E', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#1E2A42',
  },
  iconBtnText: { fontSize: 16 },
  loginDot: {
    position: 'absolute', top: 5, right: 5,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#00FF88',
  },

  // 검색바
  searchBar: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#0D1124', borderBottomWidth: 1, borderBottomColor: '#1E2A42',
  },
  searchInput: {
    backgroundColor: '#12172E', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    color: '#FFFFFF', fontSize: 15, borderWidth: 1, borderColor: '#1E2A42',
  },
  searchSpinner: { position: 'absolute', right: 30, top: '50%' },

  // 시장 스트립
  marketStrip: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },

  // 섹터 스트립
  sectorStrip: {
    paddingHorizontal: 16, paddingBottom: 10, paddingTop: 2,
  },

  // 검색 결과
  searchResults: {
    marginHorizontal: 16, marginBottom: 4, backgroundColor: '#12172E',
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1E2A42',
  },
  searchResultsTitle: { fontSize: 13, color: '#00D9FF', fontWeight: '700', marginBottom: 10 },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#1E2A42',
  },
  searchResultName: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
  searchResultSymbol: { fontSize: 12, color: '#8A9BAE', marginTop: 2 },
  searchAddBtn: {
    backgroundColor: '#7C3AED', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
  },
  searchAddBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  noResults: { color: '#8A9BAE', fontSize: 13, textAlign: 'center', paddingVertical: 10 },
  codeSection: {
    marginTop: 10, backgroundColor: '#0A0E1F', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#1E2A42',
  },
  codeSectionLabel: { color: '#00D9FF', fontSize: 13, fontWeight: 'bold', marginBottom: 3 },
  codeSectionHint: { color: '#4A5568', fontSize: 12, marginBottom: 10 },
  codeRow: { flexDirection: 'row', gap: 10 },
  codeField: {
    flex: 1, backgroundColor: '#12172E', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    color: '#FFFFFF', fontSize: 16, fontWeight: '600', borderWidth: 1, borderColor: '#2A3F5A', letterSpacing: 4,
  },
  codeAddBtn: {
    backgroundColor: '#7C3AED', borderRadius: 8, paddingHorizontal: 18, justifyContent: 'center',
  },
  codeAddBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  codeError: { color: '#FF6B6B', fontSize: 12, marginTop: 6 },

  // 섹션 공통
  section: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  sectionSub: { fontSize: 11, color: '#A78BFA', marginTop: 3 },
  sectionHint: { fontSize: 11, color: '#4A5568' },
  refreshBtn: {
    backgroundColor: '#1A0F3A', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1, borderColor: '#7C3AED40',
  },
  refreshBtnText: { color: '#A78BFA', fontSize: 12, fontWeight: '700' },
  aiLoadingBox: { alignItems: 'center', paddingVertical: 36, gap: 10 },
  aiLoadingText: { color: '#A78BFA', fontSize: 14 },
  aiCarousel: { paddingBottom: 4, paddingRight: 16 },
  updatedAt: { fontSize: 11, color: '#4A5568', marginTop: 10 },

  // 관심종목 카드
  watchCard: {
    backgroundColor: '#12172E', borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#1E2A42',
    borderLeftWidth: 3,
  },
  watchCardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  watchInfo: { flex: 1 },
  watchName: { fontSize: 16, color: '#FFFFFF', fontWeight: '700' },
  watchCode: { fontSize: 12, color: '#4A5568', marginTop: 2 },
  watchPriceCol: { alignItems: 'flex-end' },
  watchPrice: { fontSize: 18, color: '#FFFFFF', fontWeight: '700' },
  watchChange: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  watchCardBottom: { flexDirection: 'row', gap: 0 },
  watchStat: { flex: 1, alignItems: 'center' },
  watchStatLabel: { fontSize: 10, color: '#4A5568', marginBottom: 2 },
  watchStatValue: { fontSize: 12, color: '#8A9BAE', fontWeight: '600' },

  // 스와이프 삭제
  deleteSwipe: {
    backgroundColor: '#FF4466', borderRadius: 12, width: 70,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  deleteSwipeText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },

  // 빈 상태
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 44, marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  emptySub: { fontSize: 13, color: '#8A9BAE', textAlign: 'center', marginBottom: 24 },
  emptySearchBtn: {
    backgroundColor: '#00D9FF', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13,
  },
  emptySearchBtnText: { color: '#000', fontSize: 14, fontWeight: 'bold' },

  // AI 채팅 FAB
  chatFab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8,
    elevation: 8,
  },
  chatFabText: { fontSize: 22 },

  // 마이페이지 모달
  myPageOverlay: { flex: 1, backgroundColor: '#00000070', justifyContent: 'flex-end' },
  myPagePanel: {
    backgroundColor: '#12172E', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 48,
  },
  myPageHandle: { width: 40, height: 4, backgroundColor: '#2A3F5A', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  myPageTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 24 },
  myPageUserBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0A0E1F',
    borderRadius: 14, padding: 16, marginBottom: 16, gap: 14,
    borderWidth: 1, borderColor: '#1E2A42',
  },
  myPageAvatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#00D9FF',
    justifyContent: 'center', alignItems: 'center',
  },
  myPageAvatarText: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  myPageEmail: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  myPageStatus: { color: '#00FF88', fontSize: 12, marginTop: 2 },
  myPageMenuBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0A0E1F',
    borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#1E2A42',
  },
  myPageMenuIcon: { fontSize: 20, marginRight: 12 },
  myPageMenuText: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  myPageMenuArrow: { color: '#4A5568', fontSize: 22 },
  myPageLogoutBtn: {
    marginTop: 8, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#FF446640', alignItems: 'center',
  },
  myPageLogoutText: { color: '#FF4466', fontSize: 14, fontWeight: '600' },
  myPageGuestBox: { alignItems: 'center', paddingVertical: 24 },
  myPageGuestIcon: { fontSize: 50, marginBottom: 12 },
  myPageGuestTitle: { fontSize: 17, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  myPageGuestSub: { fontSize: 13, color: '#8A9BAE', textAlign: 'center', lineHeight: 20 },
  myPageLoginBtn: {
    marginTop: 20, backgroundColor: '#00D9FF', borderRadius: 14, padding: 16, alignItems: 'center',
  },
  myPageLoginBtnText: { color: '#000', fontSize: 15, fontWeight: 'bold' },
  devBtn: {
    marginTop: 20, padding: 12, borderRadius: 10, borderWidth: 1,
    borderColor: '#2A3F5A', alignItems: 'center', borderStyle: 'dashed',
  },
  devBtnText: { color: '#4A5568', fontSize: 12 },
});
