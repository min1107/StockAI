import { API_BASE_URL } from '@env';
import axios from 'axios';
import Constants from 'expo-constants';

const getServerUrl = () => {
  if (API_BASE_URL) return API_BASE_URL;
  const expoHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
  if (expoHost) return `http://${expoHost.split(':')[0]}:3000`;
  return 'http://localhost:3000';
};

const SERVER = getServerUrl();

/**
 * 종목 관련 뉴스 가져오기 (서버 프록시)
 */
export const fetchStockNews = async (symbol, name) => {
  try {
    console.log(`📰 뉴스 검색: "${name}"`);

    const response = await axios.get(`${SERVER}/api/news`, {
      params: { symbol, name },
    });

    const news = response.data;
    console.log(`✅ 뉴스 ${news.length}개 수집`);

    // date 문자열을 Date 객체로 변환
    return news.map(item => ({
      ...item,
      date: new Date(item.date),
    }));
  } catch (error) {
    console.error('❌ 뉴스 가져오기 실패:', error.message);
    return { error: true, data: [] };
  }
};

/**
 * 전체 감성 점수 계산
 */
export const calculateOverallSentiment = (news) => {
  if (!news || news.length === 0) return 50;

  const total = news.reduce((sum, item) => sum + item.sentiment, 0);
  return Math.round(total / news.length);
};
