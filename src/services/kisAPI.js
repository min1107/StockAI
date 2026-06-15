import { API_BASE_URL } from '@env';
import axios from 'axios';
import Constants from 'expo-constants';

// Expo 개발서버 IP를 자동 감지 → IP 바뀌어도 자동 적용
const PROD_SERVER = 'https://server-nine-alpha-95.vercel.app';

const getServerUrl = () => {
  if (API_BASE_URL) return API_BASE_URL;
  const expoHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
  if (expoHost) {
    const ip = expoHost.split(':')[0];
    return `http://${ip}:3000`;
  }
  return PROD_SERVER;
};

const SERVER = getServerUrl();
const API_TIMEOUT = 55000;

// 2. 국내주식 현재가 시세 조회
export const getKISStockPrice = async (stockCode) => {
  try {
    console.log(`📊 [${stockCode}] 현재가 조회 시작`);

    const response = await axios.get(`${SERVER}/api/kis/price`, {
      params: { code: stockCode },
      timeout: API_TIMEOUT,
    });

    const result = response.data;
    console.log(`✅ [${stockCode}] 현재가:`, result.currentPrice, '원');

    return result;
  } catch (error) {
    console.error('❌ 현재가 조회 실패:', error.message);
    throw error;
  }
};

// 2-1. 재무비율 (ROE·영업이익률·부채비율·성장률) — 점수엔진 품질/성장/밸류 팩터용. 국내주식만.
export const getKISFinancials = async (stockCode) => {
  try {
    const code = String(stockCode).split('.')[0]; // 'AAPL' 등 비국내는 어차피 서버가 거름
    if (!/^[0-9]{6}$/.test(code)) return null;     // 6자리 국내 코드만
    const response = await axios.get(`${SERVER}/api/kis/financials`, {
      params: { code },
      timeout: API_TIMEOUT,
    });
    console.log(`✅ [${code}] 재무비율: ROE`, response.data?.roe, '부채', response.data?.debtRatio);
    return response.data;
  } catch (error) {
    console.warn('⚠️ 재무비율 조회 실패(점수엔진 일부 팩터 미반영):', error.message);
    return null; // 재무 없어도 점수엔진은 다른 팩터로 동작
  }
};

// 2-2. DART 기업 프로필 (설립·시장·배당) — 정성평가 근거용. 국내주식만.
export const getDartProfile = async (stockCode) => {
  try {
    const code = String(stockCode).split('.')[0];
    if (!/^[0-9]{6}$/.test(code)) return null;
    const response = await axios.get(`${SERVER}/api/dart/profile`, {
      params: { code },
      timeout: API_TIMEOUT,
    });
    console.log(`✅ [${code}] DART:`, response.data?.corpName, '업력', response.data?.ageYears);
    return response.data;
  } catch (error) {
    console.warn('⚠️ DART 프로필 조회 실패(정성평가 일부 근거 미반영):', error.message);
    return null;
  }
};

// 2-3. DART 사업보고서 '사업의 개요' 발췌 — 정성평가 최상위 근거. 국내주식만.
// 첫 호출은 문서 다운로드로 느려(서버가 백그라운드 캐시) 짧은 타임아웃·논블로킹으로 둔다.
export const getDartBusiness = async (stockCode) => {
  try {
    const code = String(stockCode).split('.')[0];
    if (!/^[0-9]{6}$/.test(code)) return null;
    const response = await axios.get(`${SERVER}/api/dart/business`, {
      params: { code },
      timeout: 13000, // 미캐시 시 타임아웃 → 이번엔 없이 진행, 서버가 캐시→다음번 포함
    });
    console.log(`✅ [${code}] 사업보고서:`, response.data?.reportName);
    return response.data;
  } catch (error) {
    console.warn('⚠️ 사업보고서 발췌 미반영(미캐시/지연):', error.message);
    return null;
  }
};

// 3. 투자자별 매매동향 (기관/외국인)
export const getKISInvestorTrend = async (stockCode) => {
  try {
    const response = await axios.get(`${SERVER}/api/kis/investor`, {
      params: { code: stockCode },
      timeout: API_TIMEOUT,
    });

    const result = response.data;

    console.log('✅ 투자자 동향:', {
      개인: result.daily + '억',
      기관: result.dailyInstitution + '억',
      외국인: result.dailyForeign + '억',
    });

    return result;
  } catch (error) {
    console.error('❌ 투자자 동향 실패:', error.message);
    return {
      daily: 0,
      dailyInstitution: 0,
      dailyForeign: 0,
      weekly: 0,
      monthly: 0,
    };
  }
};

// 4-1. 분봉 데이터 조회 (1일 차트용 - 시간대별)
export const getKISIntradayData = async (stockCode) => {
  try {
    const response = await axios.get(`${SERVER}/api/kis/intraday`, {
      params: { code: stockCode },
      timeout: API_TIMEOUT,
    });

    const data = response.data;
    console.log(`📊 분봉 데이터: ${data.length}개`);
    return data;
  } catch (error) {
    console.error('❌ 분봉 데이터 실패:', error.message);
    throw error;
  }
};

// 4-2. 일별 시세 조회 (차트용)
export const getKISChartData = async (stockCode, period = '1M') => {
  try {
    // 1일(1d) 기간이면 분봉 데이터 시도
    if (period === '1d') {
      try {
        const intradayData = await getKISIntradayData(stockCode);
        if (intradayData && intradayData.length > 0) {
          return intradayData;
        }
      } catch (e) {
        console.log('📊 분봉 데이터 없음, 일봉으로 폴백');
      }
      // 분봉 실패 시 일봉 1일치로 폴백 (isIntradayFallback 플래그로 UI에서 안내 가능)
      const dailyData = await axios.get(`${SERVER}/api/kis/chart`, {
        params: { code: stockCode, period: '5d' },
        timeout: API_TIMEOUT,
      });
      const data = dailyData.data;
      const fallbackData = data.slice(-1); // 최근 1일치만
      return fallbackData.map(d => ({ ...d, isIntradayFallback: true }));
    }

    const response = await axios.get(`${SERVER}/api/kis/chart`, {
      params: { code: stockCode, period },
      timeout: API_TIMEOUT,
    });

    const data = response.data;
    console.log(`📊 기간 필터링: ${period} → ${data.length}개 데이터`);

    return data;
  } catch (error) {
    console.error('❌ 차트 데이터 실패:', error.message);
    throw error;
  }
};

// 토큰 워밍업 - 22시간 내 이미 실행했으면 스킵
const WARMUP_CACHE_KEY = '@StockAI:warmupAt';
const WARMUP_TTL = 22 * 60 * 60 * 1000; // 22시간

export const warmupKISToken = async () => {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const lastWarmup = await AsyncStorage.getItem(WARMUP_CACHE_KEY);
    if (lastWarmup && Date.now() - parseInt(lastWarmup) < WARMUP_TTL) {
      console.log('♻️ KIS 토큰 워밍업 스킵 (22시간 이내)');
      return;
    }
  } catch (_) {}

  const attempt = async () => axios.get(`${SERVER}/api/kis/warmup`, { timeout: 45000 });
  try {
    await attempt();
    console.log('✅ KIS 토큰 준비 완료');
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(WARMUP_CACHE_KEY, String(Date.now()));
  } catch (e) {
    console.warn('⚠️ 워밍업 1차 실패, 5초 후 재시도...');
    try {
      await new Promise(r => setTimeout(r, 5000));
      await attempt();
      console.log('✅ KIS 토큰 준비 완료 (재시도)');
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem(WARMUP_CACHE_KEY, String(Date.now()));
    } catch (e2) {
      console.warn('⚠️ 토큰 워밍업 최종 실패 (무시):', e2.message);
    }
  }
};

// 5. 시장 지수 (KOSPI / KOSDAQ)
export const getKISMarketIndex = async () => {
  try {
    const response = await axios.get(`${SERVER}/api/kis/index`, {
      timeout: API_TIMEOUT,
    });
    return response.data;
  } catch (error) {
    console.error('❌ 시장 지수 조회 실패:', error.message);
    return null;
  }
};

// 6. 거시경제 컨텍스트 (환율, WTI, S&P선물 등)
export const getMacroContext = async () => {
  try {
    const response = await axios.get(`${SERVER}/api/macro/context`, { timeout: 8000 });
    return response.data; // { macro, text, signals }
  } catch (error) {
    console.error('❌ 매크로 컨텍스트 조회 실패:', error.message);
    return null;
  }
};

// 7. 섹터 흐름 (업종별 등락률)
export const getSectorData = async () => {
  try {
    const response = await axios.get(`${SERVER}/api/kis/sectors`, { timeout: 10000 });
    return response.data; // { sectors: [{ name, changeRate, isUp }] }
  } catch (error) {
    console.error('❌ 섹터 데이터 조회 실패:', error.message);
    return { sectors: [] };
  }
};

export const getOpportunityData = async () => {
  try {
    const response = await axios.get(`${SERVER}/api/market/opportunity`, { timeout: 30000 });
    return response.data;
  } catch (error) {
    console.error('❌ 기회 종목 조회 실패:', error.message);
    return null;
  }
};

// 8. AI 자유 질문
export const sendAIChat = async (question, stockCode = null, stockName = null, portfolioText = null, history = []) => {
  try {
    const response = await axios.post(
      `${SERVER}/api/ai/chat`,
      { question, stockCode, stockName, portfolioText, history },
      { timeout: 30000 }
    );
    return response.data; // { answer }
  } catch (error) {
    console.error('❌ AI 채팅 실패:', error.message);
    throw error;
  }
};

// 6. 종목 검색
export const searchKISStocks = async (keyword) => {
  try {
    if (!keyword || keyword.trim().length === 0) {
      return [];
    }

    const response = await axios.get(`${SERVER}/api/kis/search`, {
      params: { keyword },
      timeout: API_TIMEOUT,
    });

    const results = response.data;
    console.log(`✅ 종목 검색: "${keyword}" - ${results.length}개 종목`);

    return results;
  } catch (error) {
    console.error('❌ 종목 검색 실패:', error.message);
    return [];
  }
};

// 6. 종목이 포함된 ETF 정보 조회 (서버 API 연동)
export const getETFsContainingStock = async (stockCode) => {
  try {
    console.log(`📊 [${stockCode}] ETF 편입 정보 조회 시작`);

    const response = await axios.get(`${SERVER}/api/kis/etf`, {
      params: { code: stockCode },
      timeout: API_TIMEOUT,
    });

    const etfList = response.data;

    if (!etfList || etfList.length === 0) {
      console.log(`ℹ️ [${stockCode}] ETF 정보 없음`);
      return [];
    }

    // 각 ETF의 현재가/수익률 조회 (병렬)
    const results = await Promise.all(
      etfList.map(async (etf) => {
        try {
          const etfPrice = await getKISStockPrice(etf.code);
          return {
            code: etf.code,
            name: etf.name,
            weight: etf.weight,
            weightChange: etf.weightChange || 0,
            returnRate: etfPrice ? ((etfPrice.currentPrice - etfPrice.open) / etfPrice.open * 100) : 0,
            price: etfPrice ? etfPrice.currentPrice : 0,
            rank: etf.rank,
          };
        } catch (err) {
          return {
            code: etf.code,
            name: etf.name,
            weight: etf.weight,
            weightChange: etf.weightChange || 0,
            returnRate: 0,
            price: 0,
            rank: etf.rank,
          };
        }
      })
    );

    console.log(`✅ [${stockCode}] ETF 정보: ${results.length}개`);
    return results;
  } catch (error) {
    console.error('❌ ETF 정보 조회 실패:', error.message);
    return [];
  }
};
