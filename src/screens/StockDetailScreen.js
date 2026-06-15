import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
import { useAuth } from '../context/AuthContext';
import { addHolding, getHoldings } from '../services/portfolioAPI';

// 컴포넌트
import AIAnalysis from '../components/AIAnalysis';
import ScoreAnalysis from '../components/ScoreAnalysis';
import ETFList from '../components/ETFList';
import InstitutionalTrade from '../components/InstitutionalTrade';
import NewsList from '../components/NewsList';
import PriceChart from '../components/PriceChart';
import QuantAnalysis from '../components/QuantAnalysis';

// API
import { analyzeStockConservative, analyzeStockAggressive, analyzeStockScore } from '../services/groqAPI';
import * as KISAPI from '../services/kisAPI';

import { LineChart } from 'react-native-chart-kit';
import AIChatModal from '../components/AIChatModal';
import { fetchChartData, fetchStockDetail } from '../services/stockAPI';
import { fetchStockNews } from '../services/newsAPI';
import { fetchETFInfo } from '../services/etfAPI';

export default function StockDetailScreen({ route, navigation }) {
  const { symbol, name } = route.params;
  const [chatVisible, setChatVisible] = useState(false);
  const [stockData, setStockData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('1d');
  const [isIntradayFallback, setIsIntradayFallback] = useState(false);

  // 기관 매매 데이터
  const [institutionalData, setInstitutionalData] = useState({
    daily: 0,
    dailyInstitution: 0,
    dailyForeign: 0,
    weeklyInstitution: null,
    weeklyForeign: null,
    weeklyActualDays: 0,
    monthlyInstitution: null,
    monthlyForeign: null,
    monthlyActualDays: 0,
    quarterlyInstitution: null,
    quarterlyForeign: null,
    quarterlyActualDays: 0,
    recentDays: [],
    weeklyAvgInstitution: null,
    weeklyAvgForeign: null,
    availableDays: 0,
  });

  // ETF 데이터 (실제 API로 조회)
  const [etfData, setEtfData] = useState([]);

  // 뉴스 데이터 (null = 로딩 중, [] = 없음, [...] = 있음)
  const [newsData, setNewsData] = useState(null);

  // 퀀트 분석용 별도 차트 데이터 (항상 3개월 일봉)
  const [quantChartData, setQuantChartData] = useState([]);

  // AI 분석 (보수적 + 공격적)
  const [conservativeAnalysis, setConservativeAnalysis] = useState(null);
  const [aggressiveAnalysis, setAggressiveAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(true);

  // 점수 엔진 분석 (보수/공격) — docs/AI_ENGINE.md
  const [scoreConservative, setScoreConservative] = useState(null);
  const [scoreAggressive, setScoreAggressive] = useState(null);

  // 포트폴리오 보유 정보
  const [userHolding, setUserHolding] = useState(null);

  // 관심종목 + 실시간
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const priceIntervalRef = useRef(null);

  // 종목 비교
  const [compareModal, setCompareModal] = useState(false);
  const [compareQuery, setCompareQuery] = useState('');
  const [compareResults, setCompareResults] = useState([]);
  const [compareSearching, setCompareSearching] = useState(false);
  const [compareStock, setCompareStock] = useState(null); // { code, name, data }
  const [compareBaseData, setCompareBaseData] = useState([]); // 현재 종목 3개월 일봉 (비교 전용)

  // 포트폴리오 모달
  const [portfolioModal, setPortfolioModal] = useState(false);
  const [inputShares, setInputShares] = useState('');
  const [inputAvgPrice, setInputAvgPrice] = useState('');
  const [portfolioSaving, setPortfolioSaving] = useState(false);
  const { user } = useAuth();

  const FAVORITES_KEY = '@StockAI:favorites';

  const searchCompareStocks = async (q) => {
    if (!q || q.trim().length < 1) { setCompareResults([]); return; }
    setCompareSearching(true);
    try {
      const results = await KISAPI.searchKISStocks(q.trim());
      setCompareResults(results.slice(0, 6));
    } catch { setCompareResults([]); }
    finally { setCompareSearching(false); }
  };

  const selectCompareStock = async (item) => {
    setCompareModal(false);
    setCompareQuery('');
    setCompareResults([]);
    try {
      const codeStr = item.code || item.symbol?.split('.')[0];
      const currentCode = symbol.split('.')[0];
      // 둘 다 3개월 일봉으로 가져오기 (비교 전용)
      const [compareChartData, baseChartData] = await Promise.all([
        fetchChartData(`${codeStr}.KS`, '3mo', '1d'),
        fetchChartData(`${currentCode}.KS`, '3mo', '1d'),
      ]);
      setCompareBaseData(baseChartData);
      setCompareStock({ code: codeStr, name: item.name, data: compareChartData });
    } catch (e) {
      console.error('비교 종목 차트 로드 실패:', e.message);
    }
  };

  const isMarketOpen = () => {
    const kst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const day = kst.getUTCDay();
    if (day === 0 || day === 6) return false;
    const totalMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
    return totalMin >= 9 * 60 && totalMin <= 15 * 60 + 30;
  };

  const loadFavoriteStatus = async () => {
    try {
      const stored = await AsyncStorage.getItem(FAVORITES_KEY);
      const favorites = stored ? JSON.parse(stored) : [];
      setIsFavorite(favorites.some(f => f.symbol === symbol));
    } catch (e) {
      console.error('관심종목 로드 실패:', e);
    }
  };

  const toggleFavorite = async () => {
    try {
      const stored = await AsyncStorage.getItem(FAVORITES_KEY);
      const favorites = stored ? JSON.parse(stored) : [];
      if (isFavorite) {
        const updated = favorites.filter(f => f.symbol !== symbol);
        await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
        setIsFavorite(false);
      } else {
        const updated = [...favorites, { symbol, name }];
        await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
        setIsFavorite(true);
      }
    } catch (e) {
      console.error('관심종목 저장 실패:', e);
    }
  };

  const saveToPortfolio = async () => {
    if (!user) {
      Alert.alert('로그인 필요', '포트폴리오 기능을 사용하려면 로그인이 필요합니다.');
      return;
    }
    const shares = parseInt(inputShares.replace(/,/g, ''));
    const avgPrice = parseInt(inputAvgPrice.replace(/,/g, ''));
    if (!shares || shares <= 0 || !avgPrice || avgPrice <= 0) {
      Alert.alert('입력 오류', '수량과 매입가를 올바르게 입력해주세요.');
      return;
    }
    try {
      setPortfolioSaving(true);
      await addHolding(user.id, symbol, name, shares, avgPrice);
      setPortfolioModal(false);
      setInputShares('');
      setInputAvgPrice('');
      Alert.alert('추가 완료', `${name}이(가) 포트폴리오에 추가되었습니다.`);
    } catch (e) {
      Alert.alert('오류', '저장 중 문제가 발생했습니다: ' + e.message);
    } finally {
      setPortfolioSaving(false);
    }
  };

  const refreshPriceOnly = async () => {
    try {
      const fresh = await fetchStockDetail(symbol);
      setStockData(prev => prev ? {
        ...prev,
        regularMarketPrice: fresh.regularMarketPrice,
        regularMarketChange: fresh.regularMarketChange,
        regularMarketChangePercent: fresh.regularMarketChangePercent,
      } : prev);
    } catch (e) {
      console.error('가격 갱신 실패:', e);
    }
  };

  // 기간에 맞는 interval 반환
  const getInterval = (period) => {
    switch (period) {
      case '1d': return '5m';
      case '5d': return '15m';
      case '1mo': return '1d';
      case '3mo': return '1d';
      default: return '5m';
    }
  };

  const loadStockDetail = async () => {
  setLoading(true);
  let data = null;
  try {
    // 1. 가격 데이터만 먼저 → 화면 즉시 표시
    console.log('📊 종목 상세 조회:', symbol, name);
    data = await fetchStockDetail(symbol);
    setStockData(data);
  } catch (error) {
    console.error('주식 상세 정보 로딩 실패:', error);
    setLoadError(error.message || String(error));
    setLoading(false);
    return;
  }
  setLoading(false); // 가격 나오면 바로 화면 표시

  // 이후 데이터는 병렬로 백그라운드 로딩
  let chart = [];
  try {
    // 2. 차트 데이터
    console.log('📈 차트 데이터 로드:', selectedPeriod);
    chart = await fetchChartData(symbol, selectedPeriod, getInterval(selectedPeriod));
    console.log('✅ 차트 데이터 개수:', chart.length);
    setIsIntradayFallback(selectedPeriod === '1d' && chart.length > 0 && chart[0].isIntradayFallback === true);
    setChartData(chart);
  } catch (chartError) {
    console.error('❌ 차트 실패:', chartError);
  }

  // 2-1. 퀀트 차트 + 기관매매 + 뉴스 + ETF 병렬 실행
  const isKorean = symbol.includes('.KS') || symbol.includes('.KQ');
  const stockCode = symbol.split('.')[0];

  // 3mo 차트: 이미 로드된 데이터 재사용 (중복 API 호출 방지)
  const quantChartPromise = (selectedPeriod === '3mo' && chart.length > 0)
    ? Promise.resolve(chart).then(q => { setQuantChartData(q); return q; })
    : fetchChartData(symbol, '3mo', '1d').then(q => { setQuantChartData(q); return q; }).catch(() => { setQuantChartData([]); return []; });

  const [quantChart, kisResult, newsResult, etfResult] = await Promise.allSettled([
    quantChartPromise,
    isKorean ? KISAPI.getKISInvestorTrend(stockCode) : Promise.resolve(null),
    fetchStockNews(symbol, name),
    isKorean ? fetchETFInfo(symbol) : Promise.resolve([]),
  ]);

  const resolvedQuantChart = quantChart.status === 'fulfilled' ? quantChart.value : [];

    // 3. 기관 매매 결과 처리
    let updatedInstitutionalData = {
      daily: 0,
      dailyForeign: 0,
      dailyInstitution: 0,
      weekly: 0,
      monthly: 0,
    };

    if (isKorean && kisResult.status === 'fulfilled' && kisResult.value) {
      const investorData = kisResult.value;
      console.log('✅ 한투 API 조회 성공:', investorData);
      updatedInstitutionalData = {
        daily: investorData.daily,
        dailyForeign: investorData.dailyForeign,
        dailyInstitution: investorData.dailyInstitution,
        weeklyInstitution: investorData.weeklyInstitution ?? null,
        weeklyForeign: investorData.weeklyForeign ?? null,
        weeklyActualDays: investorData.weeklyActualDays ?? 0,
        monthlyInstitution: investorData.monthlyInstitution ?? null,
        monthlyForeign: investorData.monthlyForeign ?? null,
        monthlyActualDays: investorData.monthlyActualDays ?? 0,
        quarterlyInstitution: investorData.quarterlyInstitution ?? null,
        quarterlyForeign: investorData.quarterlyForeign ?? null,
        quarterlyActualDays: investorData.quarterlyActualDays ?? 0,
        recentDays: investorData.recentDays ?? [],
        weeklyAvgInstitution: investorData.weeklyAvgInstitution ?? null,
        weeklyAvgForeign: investorData.weeklyAvgForeign ?? null,
        availableDays: investorData.availableDays ?? 0,
      };
      setInstitutionalData(updatedInstitutionalData);
    } else if (isKorean) {
      console.error('❌ 한투 API 실패');
    }

    // 4. 뉴스 결과 처리
    let resolvedNews = [];
    if (newsResult.status === 'fulfilled') {
      const nr = newsResult.value;
      if (nr && nr.error) {
        setNewsData({ error: true, data: [] });
      } else {
        resolvedNews = Array.isArray(nr) ? nr : (nr?.data || []);
        setNewsData(resolvedNews);
        console.log('✅ 뉴스 조회 완료:', resolvedNews.length, '개');
      }
    } else {
      console.error('❌ 뉴스 조회 실패');
      setNewsData({ error: true, data: [] });
    }

    // 5. ETF 결과 처리
    if (etfResult.status === 'fulfilled') {
      setEtfData(etfResult.value || []);
      console.log('✅ ETF 편입 정보 조회 완료');
    } else {
      setEtfData([]);
    }

    // 6. Groq AI 2-tier 분석 (보수적 + 공격적)
    try {
      console.log('🤖 AI 분석 시작 (보수적 + 공격적):', symbol);
      console.log('📊 전달할 기관 매매:', updatedInstitutionalData);

      // 📈 차트 추세 분석 (항상 3개월 일봉 기준 — 선택 기간 무관)
      const trendSource = resolvedQuantChart.length >= 5 ? resolvedQuantChart : chart;
      let chartTrend = '횡보';
      let pricePosition = '중간';
      if (trendSource.length >= 5) {
        const recentPrices = trendSource.slice(-5).map(c => c.close);
        const oldestPrice = recentPrices[0];
        const latestPrice = recentPrices[recentPrices.length - 1];
        const priceChangePercent = ((latestPrice - oldestPrice) / oldestPrice) * 100;

        if (priceChangePercent > 3) {
          chartTrend = '강한 상승';
        } else if (priceChangePercent > 1) {
          chartTrend = '약한 상승';
        } else if (priceChangePercent < -3) {
          chartTrend = '강한 하락';
        } else if (priceChangePercent < -1) {
          chartTrend = '약한 하락';
        }
      }

      // 52주 최고/최저 대비 현재 위치
      if (data.fiftyTwoWeekHigh && data.fiftyTwoWeekLow && data.fiftyTwoWeekHigh > 0) {
        const range = data.fiftyTwoWeekHigh - data.fiftyTwoWeekLow;
        const position = (data.regularMarketPrice - data.fiftyTwoWeekLow) / range;
        if (position > 0.8) {
          pricePosition = '52주 최고가 근처 (상위 20%)';
        } else if (position > 0.6) {
          pricePosition = '52주 고가권 (상위 40%)';
        } else if (position > 0.4) {
          pricePosition = '52주 중간권';
        } else if (position > 0.2) {
          pricePosition = '52주 저가권 (하위 40%)';
        } else {
          pricePosition = '52주 최저가 근처 (하위 20%)';
        }
      }

      // 📰 뉴스 감성 분석 (로컬 변수 사용 - state는 async라 아직 반영 안 됨)
      const currentNews = resolvedNews;
      let newsSentiment = '중립';
      let positiveCount = 0;
      let negativeCount = 0;

      currentNews.forEach(item => {
        if (typeof item.sentiment === 'number') {
          if (item.sentiment >= 60) positiveCount++;
          else if (item.sentiment <= 40) negativeCount++;
        } else {
          if (item.sentiment === 'positive') positiveCount++;
          if (item.sentiment === 'negative') negativeCount++;
        }
      });

      if (positiveCount > negativeCount + 2) {
        newsSentiment = '매우 긍정적';
      } else if (positiveCount > negativeCount) {
        newsSentiment = '긍정적';
      } else if (negativeCount > positiveCount + 2) {
        newsSentiment = '매우 부정적';
      } else if (negativeCount > positiveCount) {
        newsSentiment = '부정적';
      }

      // 📈 수급 추세 분석 (기관/외국인 변화)
      const instDaily = updatedInstitutionalData.dailyInstitution || 0;
      const foreignDaily = updatedInstitutionalData.dailyForeign || 0;
      const totalDaily = instDaily + foreignDaily;

      // 기간별 누적 (실제 데이터만 사용, 없으면 0)
      const instWeekly = updatedInstitutionalData.weeklyInstitution ?? 0;
      const foreignWeekly = updatedInstitutionalData.weeklyForeign ?? 0;
      const totalWeekly = instWeekly + foreignWeekly;

      const instMonthly = updatedInstitutionalData.monthlyInstitution ?? 0;
      const foreignMonthly = updatedInstitutionalData.monthlyForeign ?? 0;
      const totalMonthly = instMonthly + foreignMonthly;

      // 수급 추세 분석
      let supplyTrend = '중립';
      if (totalMonthly > 50000) {
        supplyTrend = '대규모 매집 (초강세)';
      } else if (totalMonthly > 20000) {
        supplyTrend = '강한 매수세';
      } else if (totalMonthly > 5000) {
        supplyTrend = '양호한 매수';
      } else if (totalMonthly < -50000) {
        supplyTrend = '대규모 매도 (초약세)';
      } else if (totalMonthly < -20000) {
        supplyTrend = '강한 매도세';
      } else if (totalMonthly < -5000) {
        supplyTrend = '약한 매도';
      }

      // 기관/외국인 선호도 분석
      let investorPreference = '균형';
      if (instMonthly > foreignMonthly * 2) {
        investorPreference = '기관 주도';
      } else if (foreignMonthly > instMonthly * 2) {
        investorPreference = '외국인 주도';
      } else if (instMonthly > 0 && foreignMonthly > 0) {
        investorPreference = '기관+외국인 동반 매수';
      } else if (instMonthly < 0 && foreignMonthly < 0) {
        investorPreference = '기관+외국인 동반 매도';
      }

      // 📊 RSI 인라인 계산 (퀀트 차트 데이터에서)
      let rsiValue = null;
      let rsiStatus = 'N/A';
      const rsiSource = resolvedQuantChart.length >= 15 ? resolvedQuantChart : chart;
      if (rsiSource.length >= 15) {
        const closes = rsiSource.slice(-15).map(c => c.close);
        let gains = 0, losses = 0;
        for (let i = 1; i < closes.length; i++) {
          const diff = closes[i] - closes[i - 1];
          if (diff > 0) gains += diff;
          else losses -= diff;
        }
        const avgGain = gains / 14;
        const avgLoss = losses / 14;
        if (avgLoss === 0) {
          rsiValue = 100;
        } else {
          const rs = avgGain / avgLoss;
          rsiValue = Math.round(100 - (100 / (1 + rs)));
        }
        if (rsiValue >= 70) rsiStatus = '과매수';
        else if (rsiValue <= 30) rsiStatus = '과매도';
        else if (rsiValue >= 55) rsiStatus = '강세';
        else if (rsiValue <= 45) rsiStatus = '약세';
        else rsiStatus = '중립';
      }

      // 포트폴리오 보유 여부 확인
      let holdingInfo = null;
      if (user) {
        try {
          const holdings = await getHoldings(user.id);
          const stockCode = symbol.split('.')[0];
          const found = holdings.find(h => h.stock_code === stockCode);
          if (found) {
            const pnl = (data.regularMarketPrice - found.avg_price) * found.shares;
            const pnlRate = ((data.regularMarketPrice - found.avg_price) / found.avg_price * 100);
            holdingInfo = {
              shares: found.shares,
              avgPrice: found.avg_price,
              totalCost: found.avg_price * found.shares,
              totalValue: data.regularMarketPrice * found.shares,
              pnl: Math.round(pnl),
              pnlRate: pnlRate.toFixed(2),
            };
            setUserHolding(holdingInfo);
          }
        } catch (e) {
          console.error('포트폴리오 조회 실패:', e);
        }
      }

      // 🆕 재무비율 + DART 프로필 — 점수엔진 품질/성장 팩터 + 정성평가 근거. 국내주식만, 실패해도 null.
      let financials = null, dartProfile = null;
      try {
        [financials, dartProfile] = await Promise.all([
          KISAPI.getKISFinancials(symbol),
          KISAPI.getDartProfile(symbol),
        ]);
      } catch (e) {
        console.warn('재무/DART 조회 생략:', e.message);
      }

      const stockDataForAI = {
        name: name,
        price: data.regularMarketPrice,
        change: data.regularMarketChangePercent,
        volume: data.regularMarketVolume,
        marketCap: data.marketCap,
        fiftyTwoWeekHigh: data.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: data.fiftyTwoWeekLow,
        // 🆕 펀더멘털 (점수 엔진 밸류·품질 팩터용) — 한국주식만 제공, 미국주식은 null
        per: data.per ?? null,
        pbr: data.pbr ?? null,
        eps: data.eps ?? null,
        bps: data.bps ?? null,
        sector: data.sector ?? null,
        // 🆕 KIS 재무비율 (품질·성장 팩터) — 없으면 null → 엔진이 정직하게 신뢰도 하향
        roe: financials?.roe ?? null,
        netMargin: financials?.netMargin ?? null,
        debtRatio: financials?.debtRatio ?? null,
        revenueGrowth: financials?.revenueGrowth ?? null,
        earningsGrowth: financials?.earningsGrowth ?? null,
        financialsAsOf: financials?.asOf ?? null,
        pricePosition: pricePosition,
        chartTrend: chartTrend,
        newsSentiment: newsSentiment,
        newsCount: currentNews.length,
        newsHeadlines: currentNews.slice(0, 6).map(n => n.title).filter(Boolean), // 정성평가 근거 인용용
        dartProfile, // 🆕 DART 정형 사실(설립·업력·시장·배당) — 정성평가 근거
        institutional: updatedInstitutionalData,
        // 🆕 수급 추세 분석 데이터
        supplyAnalysis: {
          daily: { inst: instDaily, foreign: foreignDaily, total: totalDaily },
          weekly: { inst: instWeekly, foreign: foreignWeekly, total: totalWeekly },
          monthly: { inst: instMonthly, foreign: foreignMonthly, total: totalMonthly },
          trend: supplyTrend,
          preference: investorPreference,
        },
        quantAnalysis: rsiValue !== null ? {
          rsi: rsiValue,
          rsiStatus,
          dataPoints: rsiSource.length,
        } : null,
        portfolioHolding: holdingInfo,
      };

      console.log('📊 AI에게 전달하는 상세 데이터:', {
        chartTrend,
        pricePosition,
        newsSentiment,
        newsCount: currentNews.length,
      });

      // 두 가지 분석 + 점수 엔진 분석을 병렬로 실행
      const [conservative, aggressive, scoreCons, scoreAggr] = await Promise.all([
        analyzeStockConservative(symbol, stockDataForAI),
        analyzeStockAggressive(symbol, stockDataForAI),
        analyzeStockScore(symbol, stockDataForAI, 'conservative'),
        analyzeStockScore(symbol, stockDataForAI, 'aggressive'),
      ]);

      setConservativeAnalysis(conservative);
      setAggressiveAnalysis(aggressive);
      setScoreConservative(scoreCons);
      setScoreAggressive(scoreAggr);
      console.log('✅ AI 분석 완료');
      console.log('  🛡️ 보수적:', conservative.recommendation, `(${conservative.confidence}%)`);
      console.log('  ⚡ 공격적:', aggressive.recommendation, `(${aggressive.confidence}%)`);

    } catch (aiError) {
      console.error('❌ AI 분석 실패:', aiError);

      // 에러 시 폴백 데이터
      const inst = updatedInstitutionalData.daily || 0;
      const price = data.regularMarketPrice || 0;

      setConservativeAnalysis({
        recommendation: inst > 10000 ? '매수' : '관망',
        confidence: 60,
        targetPrice: Math.round(price * 1.03),
        stopLoss: Math.round(price * 0.95),
        holdingPeriod: '2-3개월',
        entryStrategy: '2-3회 분할 매수',
        reasons: ['AI 분석 일시 중단', '기본 지표 기반 평가'],
        comment: '신중한 접근을 권장합니다',
      });

      setAggressiveAnalysis({
        recommendation: inst > 3000 ? '매수' : '관망',
        confidence: 75,
        targetPrice: Math.round(price * 1.10),
        stopLoss: Math.round(price * 0.93),
        holdingPeriod: '2-4주',
        entryStrategy: '1회 집중 매수',
        reasons: ['AI 분석 일시 중단', '기본 지표 기반 평가'],
        comment: '모멘텀 확인 후 진입 권장',
      });

    } finally {
      setAiLoading(false);
    }
};

  // 기간 변경 함수
  const changePeriod = async (period) => {
    if (period === selectedPeriod) {
      console.log('⚠️ 동일한 기간 선택됨:', period);
      return;
    }

    console.log('🔄 차트 기간 변경:', selectedPeriod, '→', period);

    // 1. 기간 변경 (UI 즉시 업데이트)
    setSelectedPeriod(period);

    // 2. 차트 데이터 초기화 (로딩 상태 표시)
    setChartData([]);

    try {
      console.log('📈 새 차트 데이터 로드 중:', period, getInterval(period));
      const chart = await fetchChartData(symbol, period, getInterval(period));
      console.log('✅ 새 차트 데이터:', chart.length, '개 데이터 포인트');

      // 첫 번째와 마지막 데이터 출력
      if (chart.length > 0) {
        console.log('  📊 첫 데이터:', chart[0]);
        console.log('  📊 마지막 데이터:', chart[chart.length - 1]);
      }

      setIsIntradayFallback(period === '1d' && chart.length > 0 && chart[0].isIntradayFallback === true);
      setChartData(chart);
    } catch (error) {
      console.error('❌ 차트 데이터 로딩 실패:', error);
      console.error('❌ 에러 상세:', error.message);
    }
  };

  useEffect(() => {
    loadFavoriteStatus();
    loadStockDetail();
    const live = isMarketOpen();
    setIsLive(live);
    if (live) {
      priceIntervalRef.current = setInterval(refreshPriceOnly, 10000);
    }
    return () => {
      if (priceIntervalRef.current) clearInterval(priceIntervalRef.current);
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00D9FF" />
        <Text style={styles.loadingText}>데이터 로딩 중...</Text>
      </View>
    );
  }

  if (!stockData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>데이터를 불러올 수 없습니다</Text>
        {loadError ? <Text style={[styles.errorText, { fontSize: 11, marginTop: 6, color: '#888' }]}>{loadError}</Text> : null}
        <TouchableOpacity style={styles.retryButton} onPress={loadStockDetail}>
          <Text style={styles.retryText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const priceChange = stockData.regularMarketChange || 0;
  const changePercent = stockData.regularMarketChangePercent || 0;
  const isPositive = priceChange >= 0;
  const currentPrice = stockData.regularMarketPrice || 0;

  // 거래량 급증 계산 (20일 평균 대비)
  const volSource = quantChartData.length >= 5 ? quantChartData : chartData;
  const avgVolume = volSource.length > 0
    ? volSource.slice(-20).reduce((s, d) => s + (d.volume || 0), 0) / Math.min(20, volSource.length)
    : 0;
  const volumeRatio = avgVolume > 0 ? (stockData.regularMarketVolume || 0) / avgVolume : 0;
  const isVolumeSpike = volumeRatio >= 1.5;

  // 지지/저항선 계산
  const srSource = quantChartData.length >= 10 ? quantChartData : chartData;
  const rawSupports = [];
  const rawResistances = [];
  if (srSource.length >= 6) {
    const w = 2;
    for (let i = w; i < srSource.length - w; i++) {
      let isLow = true, isHigh = true;
      for (let j = i - w; j <= i + w; j++) {
        if (j === i) continue;
        if (srSource[j].low <= srSource[i].low) isLow = false;
        if (srSource[j].high >= srSource[i].high) isHigh = false;
      }
      if (isLow) rawSupports.push(srSource[i].low);
      if (isHigh) rawResistances.push(srSource[i].high);
    }
  }
  const clusterLevels = (levels, tol = 0.015) => {
    const sorted = [...levels].sort((a, b) => a - b);
    const result = [];
    let group = [];
    for (const l of sorted) {
      if (group.length === 0 || l / group[0] < 1 + tol) {
        group.push(l);
      } else {
        result.push(Math.round(group.reduce((a, b) => a + b) / group.length));
        group = [l];
      }
    }
    if (group.length) result.push(Math.round(group.reduce((a, b) => a + b) / group.length));
    return result;
  };
  const nearSupports = clusterLevels(rawSupports).filter(s => s < currentPrice).sort((a, b) => b - a).slice(0, 3);
  const nearResistances = clusterLevels(rawResistances).filter(r => r > currentPrice).sort((a, b) => a - b).slice(0, 3);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStockDetail();
    setRefreshing(false);
  };

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
    >
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.nameText}>{name}</Text>
          <Text style={styles.symbolText}>{symbol}</Text>
        </View>
        <View style={styles.headerRight}>
          {isLive && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
          <TouchableOpacity style={styles.portfolioButton} onPress={() => setPortfolioModal(true)}>
            <Text style={styles.portfolioButtonText}>+ 포트폴리오</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.favoriteButton} onPress={toggleFavorite}>
            <Text style={styles.favoriteIcon}>{isFavorite ? '♥' : '♡'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 가격 정보 */}
      <View style={styles.priceSection}>
        <Text style={styles.priceText}>
          {stockData.currency === 'KRW' ? '₩' : '$'}
          {stockData.regularMarketPrice?.toLocaleString()}
        </Text>
        <View style={[styles.changeContainer, { backgroundColor: isPositive ? '#00FF8820' : '#FF446620' }]}>
          <Text style={[styles.changeText, { color: isPositive ? '#00FF88' : '#FF4466' }]}>
            {isPositive ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)} ({Math.abs(changePercent).toFixed(2)}%)
          </Text>
        </View>
      </View>

      {/* 차트 섹션 */}
      <View style={styles.chartSection}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.sectionTitle}>가격 차트</Text>
          <TouchableOpacity
            style={cmpStyles.compareBtn}
            onPress={() => { if (compareStock) { setCompareStock(null); } else { setCompareModal(true); } }}
          >
            <Text style={cmpStyles.compareBtnText}>{compareStock ? `✕ ${compareStock.name}` : '+ 비교'}</Text>
          </TouchableOpacity>
        </View>

        {/* 기간 선택 버튼 */}
        <View style={styles.periodButtons}>
          {['1d', '5d', '1mo', '3mo'].map((period) => (
            <TouchableOpacity
              key={period}
              style={[
                styles.periodButton,
                selectedPeriod === period && styles.periodButtonActive
              ]}
              onPress={() => changePeriod(period)}
            >
              <Text style={[
                styles.periodButtonText,
                selectedPeriod === period && styles.periodButtonTextActive
              ]}>
                {period === '1d' ? '1일' : period === '5d' ? '5일' : period === '1mo' ? '1개월' : '3개월'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 분봉 미지원 시 안내 */}
        {isIntradayFallback && (
          <Text style={{ color: '#888', fontSize: 11, textAlign: 'center', marginBottom: 4 }}>
            ※ 장중 분봉 데이터 미제공 종목 — 전일 종가 기준 표시
          </Text>
        )}

        {/* 차트 */}
        <PriceChart
          key={`chart-${selectedPeriod}-${chartData.length}`}
          data={chartData}
          period={selectedPeriod}
        />

        {/* 비교 차트 */}
        {compareStock && compareStock.data?.length >= 2 && compareBaseData.length >= 2 && (() => {
          // 3개월 일봉 기준으로 정규화 (기준일 종가 대비 %)
          const baseA = compareBaseData[0].close;
          const baseB = compareStock.data[0].close;
          // 두 시리즈 길이 맞추기
          const minLen = Math.min(compareBaseData.length, compareStock.data.length, 60);
          const step = Math.max(1, Math.floor(minLen / 20));
          const indices = [];
          for (let i = 0; i < minLen; i += step) indices.push(i);
          if (indices[indices.length - 1] !== minLen - 1) indices.push(minLen - 1);

          const labels = indices.map(i => {
            const d = compareBaseData[i];
            return d.time || '';
          });
          const dataA = indices.map(i => parseFloat(((compareBaseData[i].close - baseA) / baseA * 100).toFixed(2)));
          const dataB = indices.map(i => parseFloat(((compareStock.data[i].close - baseB) / baseB * 100).toFixed(2)));

          return (
            <View style={cmpStyles.chartContainer}>
              <View style={cmpStyles.legendRow}>
                <View style={[cmpStyles.legendDot, { backgroundColor: '#00D9FF' }]} />
                <Text style={cmpStyles.legendText}>{name}</Text>
                <View style={[cmpStyles.legendDot, { backgroundColor: '#FFB800', marginLeft: 12 }]} />
                <Text style={cmpStyles.legendText}>{compareStock.name}</Text>
              </View>
              <LineChart
                data={{
                  labels,
                  datasets: [
                    { data: dataA, color: () => '#00D9FF', strokeWidth: 2 },
                    { data: dataB, color: () => '#FFB800', strokeWidth: 2 },
                  ],
                  legend: [],
                }}
                width={SCREEN_W - 32}
                height={160}
                withDots={false}
                withInnerLines={false}
                withOuterLines={false}
                withShadow={false}
                withHorizontalLabels={true}
                withVerticalLabels={false}
                chartConfig={{
                  backgroundColor: 'transparent',
                  backgroundGradientFrom: '#12172E',
                  backgroundGradientTo: '#12172E',
                  decimalPlaces: 1,
                  color: () => '#6B7280',
                  labelColor: () => '#4A5568',
                }}
                bezier
                style={{ borderRadius: 10, marginLeft: -10 }}
                decorator={() => null}
                formatYLabel={v => `${v}%`}
              />
            </View>
          );
        })()}
      </View>

      {/* 기본 정보 */}
      {(() => {
        const cy = stockData.currency === 'KRW' ? '₩' : '$';
        return (
          <View style={styles.infoSection}>
            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>시가</Text>
                <Text style={styles.statValue}>{cy}{stockData.regularMarketOpen?.toLocaleString() || '-'}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>고가</Text>
                <Text style={[styles.statValue, { color: '#00FF88' }]}>{cy}{stockData.regularMarketDayHigh?.toLocaleString() || '-'}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>저가</Text>
                <Text style={[styles.statValue, { color: '#FF4466' }]}>{cy}{stockData.regularMarketDayLow?.toLocaleString() || '-'}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>거래량</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.statValue}>
                    {stockData.regularMarketVolume
                      ? stockData.regularMarketVolume >= 100000000
                        ? (stockData.regularMarketVolume / 100000000).toFixed(1) + '억'
                        : (stockData.regularMarketVolume / 10000).toFixed(0) + '만'
                      : '-'}
                  </Text>
                  {isVolumeSpike && <Text style={styles.spikeTag}>{volumeRatio.toFixed(1)}x</Text>}
                </View>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>시총</Text>
                <Text style={styles.statValue}>
                  {stockData.marketCap
                    ? stockData.marketCap >= 1000000000000
                      ? (stockData.marketCap / 1000000000000).toFixed(1) + '조'
                      : (stockData.marketCap / 100000000).toFixed(0) + '억'
                    : '-'}
                </Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>PER / PBR</Text>
                <Text style={[styles.statValue, { color: '#C0C8E0' }]}>
                  {stockData.per != null ? stockData.per.toFixed(1) : '-'} / {stockData.pbr != null ? stockData.pbr.toFixed(1) : '-'}
                </Text>
              </View>
            </View>
          </View>
        );
      })()}

      {/* 재무지표 카드 */}
      {(stockData.per != null || stockData.eps != null || stockData.bps != null) && (() => {
        const roe = (stockData.eps != null && stockData.bps != null && stockData.bps > 0)
          ? (stockData.eps / stockData.bps * 100).toFixed(1)
          : null;
        const cy = stockData.currency === 'KRW' ? '₩' : '$';
        const items = [
          { label: 'PER', value: stockData.per != null ? `${stockData.per.toFixed(1)}배` : '-', desc: '주가수익비율' },
          { label: 'PBR', value: stockData.pbr != null ? `${stockData.pbr.toFixed(1)}배` : '-', desc: '주가순자산비율' },
          { label: 'EPS', value: stockData.eps != null ? `${cy}${stockData.eps.toLocaleString()}` : '-', desc: '주당순이익' },
          { label: 'BPS', value: stockData.bps != null ? `${cy}${stockData.bps.toLocaleString()}` : '-', desc: '주당순자산' },
          { label: 'ROE', value: roe != null ? `${roe}%` : '-', desc: '자기자본이익률', highlight: roe != null && parseFloat(roe) >= 15 ? '#00FF88' : roe != null && parseFloat(roe) < 5 ? '#FF4466' : '#C0C8E0' },
        ];
        return (
          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>재무지표</Text>
            <View style={finStyles.grid}>
              {items.map(item => (
                <View key={item.label} style={finStyles.cell}>
                  <Text style={finStyles.label}>{item.label}</Text>
                  <Text style={[finStyles.value, item.highlight ? { color: item.highlight } : {}]}>{item.value}</Text>
                  <Text style={finStyles.desc}>{item.desc}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })()}

      {/* 🆕 점수 엔진 분석 (6팩터) — docs/AI_ENGINE.md */}
      <View style={styles.chartSection}>
        <ScoreAnalysis
          conservative={scoreConservative}
          aggressive={scoreAggressive}
          loading={aiLoading}
        />
      </View>

      {/* AI 분석 섹션 (기존 — 비교용) */}
      <View style={styles.chartSection}>
        <AIAnalysis
          conservativeAnalysis={conservativeAnalysis}
          aggressiveAnalysis={aggressiveAnalysis}
          loading={aiLoading}
        />
      </View>

      {/* 52주 범위 + 지지/저항 */}
      {stockData.fiftyTwoWeekHigh > 0 && stockData.fiftyTwoWeekLow > 0 && (() => {
        const cy = stockData.currency === 'KRW' ? '₩' : '$';
        const range = stockData.fiftyTwoWeekHigh - stockData.fiftyTwoWeekLow;
        const position = ((stockData.regularMarketPrice - stockData.fiftyTwoWeekLow) / range) * 100;
        const fromLow = ((stockData.regularMarketPrice - stockData.fiftyTwoWeekLow) / stockData.fiftyTwoWeekLow * 100);
        const fromHigh = ((stockData.regularMarketPrice - stockData.fiftyTwoWeekHigh) / stockData.fiftyTwoWeekHigh * 100);
        const posColor = position < 25 ? '#00FF88' : position > 75 ? '#FF4466' : '#FFD700';
        return (
          <View style={styles.rangeCard}>
            {/* 최저 | 현재위치 | 최고 */}
            <View style={styles.rangeHeaderRow}>
              <View>
                <Text style={styles.cardLabel}>52주 최저</Text>
                <Text style={[styles.rangePrice, { color: '#FF4466' }]}>{cy}{stockData.fiftyTwoWeekLow?.toLocaleString()}</Text>
                <Text style={[styles.rangeDelta, { color: '#8892A4' }]}>{fromLow >= 0 ? '+' : ''}{fromLow.toFixed(1)}%</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={[styles.rangePosNum, { color: posColor }]}>{position.toFixed(0)}%</Text>
                <Text style={[styles.cardLabel, { color: posColor }]}>
                  {position < 25 ? '저점권' : position > 75 ? '고점권' : '중간권'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.cardLabel}>52주 최고</Text>
                <Text style={[styles.rangePrice, { color: '#00FF88' }]}>{cy}{stockData.fiftyTwoWeekHigh?.toLocaleString()}</Text>
                <Text style={[styles.rangeDelta, { color: '#8892A4' }]}>{fromHigh >= 0 ? '+' : ''}{fromHigh.toFixed(1)}%</Text>
              </View>
            </View>

            {/* 프로그레스 바 */}
            <View style={styles.priceRangeBar}>
              <View style={styles.priceRangeTrack}>
                <View style={[styles.priceZone, { left: '0%', width: '25%', backgroundColor: '#00FF8820' }]} />
                <View style={[styles.priceZone, { left: '25%', width: '50%', backgroundColor: '#FFD70010' }]} />
                <View style={[styles.priceZone, { left: '75%', width: '25%', backgroundColor: '#FF446620' }]} />
                <View style={[styles.priceRangeIndicator, { left: `${Math.max(2, Math.min(98, position))}%` }]} />
              </View>
            </View>

            {/* 지지/저항 (compact) */}
            {(nearResistances.length > 0 || nearSupports.length > 0) && (
              <View style={styles.srCompact}>
                {nearResistances.slice(0, 2).map((r, i) => {
                  const dist = ((r - currentPrice) / currentPrice * 100).toFixed(1);
                  return (
                    <View key={`r${i}`} style={styles.srCompactRow}>
                      <View style={[styles.srCompactDot, { backgroundColor: '#FF4466' }]} />
                      <Text style={styles.srCompactPrice}>{cy}{r.toLocaleString()}</Text>
                      <Text style={[styles.srCompactDist, { color: '#FF4466' }]}>저항 +{dist}%</Text>
                    </View>
                  );
                })}
                <View style={styles.srCompactCurrent}>
                  <View style={styles.srCurrentDash} />
                  <Text style={styles.srCurrentLabel}>현재 {cy}{currentPrice.toLocaleString()}</Text>
                  <View style={styles.srCurrentDash} />
                </View>
                {nearSupports.slice(0, 2).map((s, i) => {
                  const dist = ((s - currentPrice) / currentPrice * 100).toFixed(1);
                  return (
                    <View key={`s${i}`} style={styles.srCompactRow}>
                      <View style={[styles.srCompactDot, { backgroundColor: '#00FF88' }]} />
                      <Text style={styles.srCompactPrice}>{cy}{s.toLocaleString()}</Text>
                      <Text style={[styles.srCompactDist, { color: '#00FF88' }]}>지지 {dist}%</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })()}

      {/* 퀀트 분석 */}
      <View style={styles.chartSection}>
        <QuantAnalysis chartData={quantChartData.length >= 14 ? quantChartData : chartData} />
      </View>

      {/* 기관 매매 */}
      <View style={styles.chartSection}>
        <InstitutionalTrade data={institutionalData} />
      </View>

      {/* 뉴스 섹션 */}
      <View style={styles.chartSection}>
        <NewsList news={newsData} />
      </View>

      {/* ETF 정보 */}
      <View style={styles.chartSection}>
        <ETFList etfs={etfData} />
      </View>

    </ScrollView>

    {/* 종목 비교 검색 모달 */}
    <Modal visible={compareModal} transparent animationType="slide" onRequestClose={() => { setCompareModal(false); setCompareQuery(''); setCompareResults([]); }}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.modalBox, { maxHeight: '70%' }]}>
          <Text style={styles.modalTitle}>비교할 종목 검색</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="종목명 또는 코드 입력"
            placeholderTextColor="#4A5A6A"
            value={compareQuery}
            onChangeText={q => { setCompareQuery(q); searchCompareStocks(q); }}
            autoFocus
          />
          {compareSearching && <ActivityIndicator color="#00D9FF" style={{ marginVertical: 10 }} />}
          <ScrollView keyboardShouldPersistTaps="handled">
            {compareResults.map(item => (
              <TouchableOpacity
                key={item.code || item.symbol}
                style={cmpStyles.resultRow}
                onPress={() => selectCompareStock(item)}
              >
                <Text style={cmpStyles.resultName}>{item.name}</Text>
                <Text style={cmpStyles.resultCode}>{item.code || item.symbol}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setCompareModal(false); setCompareQuery(''); setCompareResults([]); }}>
            <Text style={styles.modalCancelText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* 포트폴리오 추가 모달 */}
    <Modal visible={portfolioModal} transparent animationType="slide" onRequestClose={() => setPortfolioModal(false)}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>포트폴리오에 추가</Text>
          <Text style={styles.modalStockName}>{name}</Text>

          <Text style={styles.modalLabel}>보유 수량 (주)</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="수량 입력"
            placeholderTextColor="#4A5A6A"
            keyboardType="numeric"
            value={inputShares}
            onChangeText={setInputShares}
          />

          <Text style={styles.modalLabel}>평균 매입가 (원)</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="매입가 입력"
            placeholderTextColor="#4A5A6A"
            keyboardType="numeric"
            value={inputAvgPrice}
            onChangeText={setInputAvgPrice}
          />

          {inputShares && inputAvgPrice ? (
            <View style={styles.modalPreview}>
              <Text style={styles.modalPreviewText}>
                총 매입금액: ₩{(parseInt(inputShares || 0) * parseInt(inputAvgPrice || 0)).toLocaleString()}
              </Text>
            </View>
          ) : null}

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setPortfolioModal(false)}>
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSaveBtn, portfolioSaving && { opacity: 0.5 }]}
              onPress={saveToPortfolio}
              disabled={portfolioSaving}
            >
              <Text style={styles.modalSaveText}>{portfolioSaving ? '저장 중...' : '추가'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* AI 채팅 FAB */}
    <TouchableOpacity style={styles.chatFab} onPress={() => setChatVisible(true)}>
      <Text style={styles.chatFabText}>💬</Text>
    </TouchableOpacity>

    {/* AI 채팅 모달 */}
    <AIChatModal
      visible={chatVisible}
      onClose={() => setChatVisible(false)}
      stockCode={symbol.split('.')[0]}
      stockName={name}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
  chatFab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },
  chatFabText: { fontSize: 22 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0E27',
  },
  loadingText: {
    color: '#A0A0A0',
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0E27',
  },
  errorText: {
    color: '#FF4466',
    fontSize: 18,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#00D9FF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2340',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF446620',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF4466',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF4466',
    marginRight: 4,
  },
  liveText: {
    color: '#FF4466',
    fontSize: 11,
    fontWeight: 'bold',
  },
  favoriteButton: {
    padding: 4,
  },
  favoriteIcon: {
    fontSize: 28,
    color: '#FF4466',
  },
  nameText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  symbolText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 3,
  },
  priceSection: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
    alignItems: 'center',
  },
  priceText: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  changeContainer: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 6,
  },
  changeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  infoSection: {
    backgroundColor: '#161B35',
    marginHorizontal: 15,
    marginVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#252A47',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },

  // 기본 정보 그리드
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statCell: {
    width: '33.33%',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2340',
    borderRightWidth: 1,
    borderRightColor: '#1E2340',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  spikeTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FF6D00',
    backgroundColor: '#FF6D0015',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  chartSection: {
    marginHorizontal: 15,
    marginVertical: 6,
  },
  periodButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  periodButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#2A2F4A',
  },
  periodButtonActive: {
    backgroundColor: '#00D9FF',
  },
  periodButtonText: {
    color: '#A0A0A0',
    fontSize: 13,
    fontWeight: 'bold',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  // 52주 범위 + 지지/저항 카드
  rangeCard: {
    backgroundColor: '#161B35',
    marginHorizontal: 15,
    marginVertical: 6,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#252A47',
  },
  rangeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  cardLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 3,
  },
  rangePrice: {
    fontSize: 14,
    fontWeight: '700',
  },
  rangeDelta: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  rangePosNum: {
    fontSize: 24,
    fontWeight: '800',
  },
  priceRangeBar: {
    marginBottom: 12,
  },
  priceRangeTrack: {
    height: 8,
    backgroundColor: '#2A2F4A',
    borderRadius: 4,
    position: 'relative',
    overflow: 'visible',
  },
  priceZone: {
    position: 'absolute',
    height: '100%',
  },
  // 지지/저항 (compact — rangeCard 내부)
  srCompact: {
    borderTopWidth: 1,
    borderTopColor: '#1E2340',
    paddingTop: 10,
    gap: 4,
  },
  srCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  srCompactDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  srCompactPrice: {
    flex: 1,
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  srCompactDist: {
    fontSize: 12,
    fontWeight: '600',
  },
  srCompactCurrent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
    gap: 8,
  },
  srCurrentDash: {
    flex: 1,
    height: 1,
    backgroundColor: '#00D9FF40',
  },
  srCurrentLabel: {
    fontSize: 12,
    color: '#00D9FF',
    fontWeight: 'bold',
  },
  priceRangeIndicator: {
    position: 'absolute',
    top: -6,
    width: 20,
    height: 20,
    backgroundColor: '#00D9FF',
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#0A0E27',
    marginLeft: -10,
    shadowColor: '#00D9FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 5,
  },
  // 포트폴리오 버튼 (헤더)
  portfolioButton: {
    backgroundColor: '#00D9FF20',
    borderWidth: 1,
    borderColor: '#00D9FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
  },
  portfolioButtonText: {
    color: '#00D9FF',
    fontSize: 12,
    fontWeight: '600',
  },
  // 모달
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#1A1F3A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  modalStockName: {
    fontSize: 14,
    color: '#00D9FF',
    marginBottom: 24,
  },
  modalLabel: {
    fontSize: 13,
    color: '#8A9BAE',
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#0F1629',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A3F5A',
  },
  modalPreview: {
    backgroundColor: '#00D9FF15',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  modalPreviewText: {
    color: '#00D9FF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2A3F5A',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#8A9BAE',
    fontSize: 16,
    fontWeight: '600',
  },
  modalSaveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#00D9FF',
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

const finStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8,
  },
  cell: {
    width: '30%', flexGrow: 1,
    backgroundColor: '#12172E', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#1E2A42',
    alignItems: 'center',
  },
  label: { fontSize: 11, color: '#6B7280', fontWeight: '700', marginBottom: 4 },
  value: { fontSize: 15, color: '#C0C8E0', fontWeight: '700', marginBottom: 2 },
  desc: { fontSize: 10, color: '#4A5568', textAlign: 'center' },
});

const cmpStyles = StyleSheet.create({
  compareBtn: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: '#252A47',
    backgroundColor: '#12172E',
  },
  compareBtnText: { fontSize: 12, color: '#00D9FF', fontWeight: '600' },
  chartContainer: {
    marginTop: 12, backgroundColor: '#12172E', borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: '#1E2A42',
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, paddingHorizontal: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: '#8892A4', marginLeft: 4 },
  resultRow: {
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#1E2A42',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  resultName: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
  resultCode: { fontSize: 12, color: '#6B7280' },
});