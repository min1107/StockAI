import { API_BASE_URL } from '@env';
import axios from 'axios';
import Constants from 'expo-constants';
import { getKISStockPrice, getKISChartData } from './kisAPI';

const BASE_URL = 'https://query1.finance.yahoo.com';

const PROD_SERVER = 'https://server-nine-alpha-95.vercel.app';

const getServerUrl = () => {
  if (API_BASE_URL) return API_BASE_URL;
  const expoHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
  if (expoHost) return `http://${expoHost.split(':')[0]}:3000`;
  return PROD_SERVER;
};

const SERVER = getServerUrl();

// 한국 주식인지 확인하는 헬퍼 함수
const isKoreanStock = (symbol) => {
  return symbol.endsWith('.KS') || symbol.endsWith('.KQ');
};

// 한국 주식 코드 추출 (108860.KQ -> 108860)
const extractStockCode = (symbol) => {
  return symbol.split('.')[0];
};

// 여러 종목 데이터 가져오기
export const fetchStockData = async (symbols) => {
  try {
    const koreanSymbols = symbols.filter(isKoreanStock);
    const usSymbols = symbols.filter(s => !isKoreanStock(s));

    // 한국 주식: 배치 엔드포인트로 한 번에 조회
    let kisResults = {};
    if (koreanSymbols.length > 0) {
      try {
        const codes = koreanSymbols.map(extractStockCode).join(',');
        console.log(`📊 한국 주식 배치 조회: ${codes}`);
        const response = await axios.get(`${SERVER}/api/kis/prices`, {
          params: { codes },
          timeout: koreanSymbols.length * 2500 + 25000, // 종목당 2.5초 + 콜드스타트 여유
        });
        kisResults = response.data;
      } catch (err) {
        console.error('한국 주식 배치 조회 실패:', err.message);
      }
    }

    // 미국 주식: 병렬 조회 (Yahoo Finance는 rate limit 느슨함)
    const usResults = await Promise.all(
      usSymbols.map(async (symbol) => {
        try {
          const response = await axios.get(`${BASE_URL}/v8/finance/chart/${symbol}`, {
            params: { interval: '1d', range: '1d' },
          });
          const meta = response.data.chart.result[0].meta;
          return {
            symbol,
            regularMarketPrice: meta.regularMarketPrice,
            regularMarketChange: meta.regularMarketPrice - meta.previousClose,
            regularMarketChangePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100,
            regularMarketDayHigh: meta.regularMarketDayHigh,
            regularMarketDayLow: meta.regularMarketDayLow,
            regularMarketVolume: meta.regularMarketVolume,
            currency: meta.currency,
          };
        } catch (error) {
          console.error(`${symbol} 데이터 가져오기 실패:`, error.message);
          return { symbol, regularMarketPrice: 0, regularMarketChange: 0, regularMarketChangePercent: 0, regularMarketDayHigh: 0, regularMarketDayLow: 0, regularMarketVolume: 0, currency: 'USD' };
        }
      })
    );

    // 원래 순서로 결과 합치기
    return symbols.map(symbol => {
      if (isKoreanStock(symbol)) {
        const code = extractStockCode(symbol);
        const kisData = kisResults[code];
        if (kisData && !kisData.error) {
          return {
            symbol,
            regularMarketPrice: kisData.currentPrice,
            regularMarketChange: kisData.change,
            regularMarketChangePercent: kisData.changeRate,
            regularMarketDayHigh: kisData.high,
            regularMarketDayLow: kisData.low,
            regularMarketVolume: kisData.volume,
            currency: 'KRW',
          };
        }
        return { symbol, regularMarketPrice: 0, regularMarketChange: 0, regularMarketChangePercent: 0, regularMarketDayHigh: 0, regularMarketDayLow: 0, regularMarketVolume: 0, currency: 'KRW' };
      } else {
        return usResults.find(r => r.symbol === symbol) || { symbol, regularMarketPrice: 0, regularMarketChange: 0, regularMarketChangePercent: 0, regularMarketDayHigh: 0, regularMarketDayLow: 0, regularMarketVolume: 0, currency: 'USD' };
      }
    });
  } catch (error) {
    console.error('주식 데이터 가져오기 실패:', error);
    throw error;
  }
};

// 주식 상세 정보 가져오기
export const fetchStockDetail = async (symbol) => {
  try {
    // 한국 주식은 한투 API 사용
    if (isKoreanStock(symbol)) {
      const stockCode = extractStockCode(symbol);
      const kisData = await getKISStockPrice(stockCode);

      return {
        symbol: symbol,
        regularMarketPrice: kisData.currentPrice,
        regularMarketChange: kisData.change,
        regularMarketChangePercent: kisData.changeRate,
        regularMarketOpen: kisData.open,
        regularMarketDayHigh: kisData.high,
        regularMarketDayLow: kisData.low,
        regularMarketVolume: kisData.volume,
        marketCap: kisData.marketCap,
        fiftyTwoWeekHigh: kisData.fiftyTwoWeekHigh || 0,
        fiftyTwoWeekLow: kisData.fiftyTwoWeekLow || 0,
        per: kisData.per ?? null,
        pbr: kisData.pbr ?? null,
        eps: kisData.eps ?? null,
        bps: kisData.bps ?? null,
        currency: 'KRW',
      };
    } else {
      // 미국 주식은 Yahoo Finance 사용
      const response = await axios.get(`${BASE_URL}/v8/finance/chart/${symbol}`, {
        params: {
          interval: '1d',
          range: '1mo',
        },
      });

      const result = response.data.chart.result[0];
      const meta = result.meta;

      return {
        symbol: meta.symbol,
        regularMarketPrice: meta.regularMarketPrice,
        regularMarketChange: meta.regularMarketPrice - meta.previousClose,
        regularMarketChangePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100,
        regularMarketOpen: meta.regularMarketOpen,
        regularMarketDayHigh: meta.regularMarketDayHigh,
        regularMarketDayLow: meta.regularMarketDayLow,
        regularMarketVolume: meta.regularMarketVolume,
        marketCap: meta.marketCap,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
        currency: meta.currency,
      };
    }
  } catch (error) {
    console.error('주식 상세 정보 가져오기 실패:', error);
    throw error;
  }
};
// 차트용 시간별 데이터 가져오기
export const fetchChartData = async (symbol, range = '1d', interval = '5m') => {
  try {
    // 한국 주식은 한투 API 사용
    if (isKoreanStock(symbol)) {
      const stockCode = extractStockCode(symbol);
      const chartData = await getKISChartData(stockCode, range);
      return chartData;
    } else {
      // 미국 주식은 Yahoo Finance 사용
      const response = await axios.get(`${BASE_URL}/v8/finance/chart/${symbol}`, {
        params: {
          range: range,      // 1d, 5d, 1mo, 3mo, 6mo, 1y
          interval: interval, // 1m, 5m, 15m, 1h, 1d
        },
      });

      const result = response.data.chart.result[0];
      const timestamps = result.timestamp;
      const quote = result.indicators.quote[0];

      // 시간과 OHLC 데이터를 배열로 변환
      const chartData = timestamps.map((timestamp, index) => {
        const date = new Date(timestamp * 1000);
        let timeLabel;

        // 기간에 따라 시간 표시 형식 변경
        if (range === '1d') {
          timeLabel = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        } else if (range === '5d') {
          timeLabel = `${date.getMonth() + 1}/${date.getDate()}`;
        } else {
          timeLabel = `${date.getMonth() + 1}/${date.getDate()}`;
        }

        return {
          time: timeLabel,
          open: quote.open[index] || quote.close[index] || 0,
          high: quote.high[index] || quote.close[index] || 0,
          low: quote.low[index] || quote.close[index] || 0,
          close: quote.close[index] || 0,
          volume: quote.volume[index] || 0,
          timestamp: timestamp,
        };
      }).filter(item => item.close > 0); // 종가가 0인 데이터 제거

      return chartData;
    }
  } catch (error) {
    console.error('차트 데이터 가져오기 실패:', error);
    throw error;
  }
};

// AI 발굴 종목 추천 (1시간 캐싱)
const AI_RECO_CACHE_KEY = '@StockAI:aiRecommendations';
const AI_RECO_TTL = 60 * 60 * 1000; // 1시간

export const getAIRecommendations = async (forceRefresh = false) => {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;

  if (!forceRefresh) {
    try {
      const cached = await AsyncStorage.getItem(AI_RECO_CACHE_KEY);
      if (cached) {
        const { data, savedAt } = JSON.parse(cached);
        if (Date.now() - savedAt < AI_RECO_TTL) {
          console.log('AI 추천 캐시 사용 (남은시간:', Math.round((AI_RECO_TTL - (Date.now() - savedAt)) / 60000), '분)');
          return data;
        }
      }
    } catch {}
  }

  console.log('AI 추천 서버 분석 시작 (60개 종목)...');
  const response = await axios.get(`${SERVER}/api/ai/recommend`, { timeout: 90000 });
  const result = response.data;

  try {
    await AsyncStorage.setItem(AI_RECO_CACHE_KEY, JSON.stringify({ data: result, savedAt: Date.now() }));
  } catch {}

  return result;
};

// 종목 검색 — 네이버 금융(한국) + Yahoo Finance(미국) 서버 프록시
export const searchStocks = async (query) => {
  if (!query || query.trim().length === 0) return [];

  try {
    const response = await axios.get(`${SERVER}/api/stocks/search`, {
      params: { q: query.trim() },
      timeout: 15000,
    });
    const results = response.data || [];
    console.log(`🔍 검색어: "${query}" - ${results.length}개 종목 발견`);
    return results;
  } catch (error) {
    console.error('종목 검색 실패:', error.message);
    return [];
  }
};

// 종목코드로 직접 유효성 확인 (C: 코드 직접 입력 폴백)
export const validateStockByCode = async (code) => {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return null;

  try {
    const response = await axios.get(`${SERVER}/api/kis/prices`, {
      params: { codes: trimmed },
      timeout: 8000,
    });
    const data = response.data?.[trimmed];
    if (data && !data.error && data.currentPrice > 0) {
      // 네이버 검색으로 종목명 가져오기
      try {
        const searchResp = await axios.get(`${SERVER}/api/stocks/search`, {
          params: { q: trimmed },
          timeout: 5000,
        });
        const found = searchResp.data?.[0];
        if (found) return found;
      } catch {}
      // 종목명 못 가져오면 코드로 임시 반환
      return {
        symbol: trimmed + '.KS',
        name: trimmed,
        code: trimmed,
        exchange: 'KSC',
        type: 'EQUITY',
      };
    }
    return null;
  } catch {
    return null;
  }
};