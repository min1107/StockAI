// src/services/groqAPI.js
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
 * 보수적 AI 분석 (가치투자)
 */
export const analyzeStockConservative = async (symbol, stockData) => {
  try {
    console.log('🛡️ 보수적 분석 시작:', symbol);

    const response = await axios.post(`${SERVER}/api/ai/analyze?type=conservative`, stockData);
    const result = response.data;

    console.log('✅ 보수적 분석 성공:', result.recommendation);
    return result;
  } catch (error) {
    console.error('❌ 가치투자 분석 실패:', error.message);
    return getConservativeFallback(stockData);
  }
};

/**
 * 공격적 AI 분석 (성장투자)
 */
export const analyzeStockAggressive = async (symbol, stockData) => {
  try {
    console.log('⚡ 공격적 분석 시작:', symbol);

    const response = await axios.post(`${SERVER}/api/ai/analyze?type=aggressive`, stockData);
    const result = response.data;

    console.log('✅ 공격적 분석 성공:', result.recommendation);
    return result;
  } catch (error) {
    console.error('❌ 성장투자 분석 실패:', error.message);
    return getAggressiveFallback(stockData);
  }
};

// 폴백 함수들
const getConservativeFallback = (stockData) => {
  const supply = stockData.supplyAnalysis || {
    monthly: { total: 0 }
  };
  const monthlyTotal = supply.monthly?.total || 0;
  const price = stockData.price || 0;
  const fiftyTwoHigh = stockData.fiftyTwoWeekHigh || 0;
  const marginOfSafety = fiftyTwoHigh > 0 ? ((fiftyTwoHigh - price) / fiftyTwoHigh * 100) : 0;

  if (monthlyTotal > 20000 && marginOfSafety > 15) {
    return {
      recommendation: '매수',
      confidence: 68,
      targetPrice: Math.round(price * 1.06),
      stopLoss: Math.round(price * 0.93),
      holdingPeriod: '6개월~1년',
      entryStrategy: '3-5회 분할 매수',
      reasons: [
        `안전마진 ${marginOfSafety.toFixed(1)}%로 매력적인 진입 구간`,
        `스마트머니 월간 ${monthlyTotal.toFixed(0)}억원 순매수로 가치 인정`,
        '경제적 해자를 보유한 기업으로 장기 성장 기대',
        '내재가치 대비 저평가 구간으로 판단',
        '다만 시장 전체 하락 시 동반 하락 리스크 존재'
      ],
      comment: `현재 안전마진 ${marginOfSafety.toFixed(1)}%로 가치투자 관점에서 매력적입니다. 분할 매수로 평균단가를 낮추며 진입하세요.`,
    };
  } else if (monthlyTotal < -20000) {
    return {
      recommendation: '매도',
      confidence: 65,
      targetPrice: Math.round(price * 0.95),
      stopLoss: Math.round(price * 0.92),
      holdingPeriod: '즉시',
      entryStrategy: '보유 물량 단계적 축소',
      reasons: [
        `스마트머니 월간 ${monthlyTotal.toFixed(0)}억원 대규모 이탈 확인`,
        '기관/외국인의 가치 재평가가 부정적 방향으로 진행 중',
        '경제적 해자 훼손 또는 실적 악화 우려',
        '내재가치 하락 가능성을 시장이 선반영하는 중'
      ],
      comment: '스마트머니의 이탈은 내재가치 훼손 신호일 수 있습니다. 원금 보전을 최우선으로 하세요.',
    };
  } else {
    return {
      recommendation: '관망',
      confidence: 55,
      targetPrice: Math.round(price * 1.03),
      stopLoss: Math.round(price * 0.93),
      holdingPeriod: '6개월~1년',
      entryStrategy: '추가 하락 시 분할 매수 대기',
      reasons: [
        `안전마진 ${marginOfSafety.toFixed(1)}%로 충분하지 않음`,
        '수급 추세가 명확하지 않아 가치 판단 보류',
        '더 낮은 가격에서 안전마진 확보 후 진입 권장',
        '리스크 대비 기대 수익이 불충분한 구간'
      ],
      comment: '현재 가격은 내재가치 대비 충분한 할인이 아닙니다. 인내심을 갖고 더 매력적인 가격을 기다리세요.',
    };
  }
};

const getAggressiveFallback = (stockData) => {
  const supply = stockData.supplyAnalysis || {
    weekly: { total: 0 },
    monthly: { total: 0 }
  };
  const weeklyTotal = supply.weekly?.total || 0;
  const monthlyTotal = supply.monthly?.total || 0;
  const price = stockData.price || 0;
  const fiftyTwoHigh = stockData.fiftyTwoWeekHigh || 0;
  const recoveryPotential = fiftyTwoHigh > 0 ? ((fiftyTwoHigh - price) / price * 100) : 0;

  if (weeklyTotal > 5000 || monthlyTotal > 10000) {
    return {
      recommendation: '매수',
      confidence: 82,
      targetPrice: Math.round(price * 1.14),
      stopLoss: Math.round(price * 0.93),
      holdingPeriod: '1-3개월',
      entryStrategy: '1-2회 집중 매수',
      reasons: [
        `자금 흐름 급반전: 주간 ${weeklyTotal.toFixed(0)}억 / 월간 ${monthlyTotal.toFixed(0)}억 유입`,
        '시장이 아직 이 기업의 성장성을 충분히 반영하지 못한 구간',
        `고점 대비 ${recoveryPotential.toFixed(1)}% 회복 잠재력 보유`,
        '비대칭 수익 구조: 상방 잠재력이 하방 리스크를 크게 상회',
        '목표가 50% 도달 시 절반 익절, 나머지 트레일링 스탑 권장'
      ],
      comment: `시장이 이 기업의 가치를 과소평가하고 있습니다. 스마트머니의 적극적 유입이 이를 증명합니다. 회복 잠재력 ${recoveryPotential.toFixed(1)}%.`,
    };
  } else if (weeklyTotal < -5000 || monthlyTotal < -10000) {
    return {
      recommendation: '매도',
      confidence: 75,
      targetPrice: Math.round(price * 0.93),
      stopLoss: Math.round(price * 0.90),
      holdingPeriod: '즉시',
      entryStrategy: '즉시 청산',
      reasons: [
        `자금 이탈 가속: 주간 ${weeklyTotal.toFixed(0)}억 / 월간 ${monthlyTotal.toFixed(0)}억 유출`,
        '스마트머니가 성장 스토리에 의문을 제기하는 신호',
        '하방 리스크가 상방 잠재력을 압도하는 비대칭 구조',
        '손절 후 바닥 확인 시 재진입 기회 모색'
      ],
      comment: '남들이 탐욕을 부릴 때 두려워해야 합니다. 자금 이탈이 가속 중이며 추가 하락 가능성이 높습니다.',
    };
  } else {
    return {
      recommendation: '관망',
      confidence: 65,
      targetPrice: Math.round(price * 1.08),
      stopLoss: Math.round(price * 0.93),
      holdingPeriod: '1-3개월',
      entryStrategy: '추세 전환 확인 후 진입',
      reasons: [
        '현재 시장 심리와 실제 수급 사이에 뚜렷한 괴리 없음',
        '성장 모멘텀이 약화되었거나 아직 형성되지 않은 단계',
        '비대칭 수익 구조가 아직 매력적이지 않음',
        '명확한 촉매 발생 시 빠르게 진입 전환 준비'
      ],
      comment: '아직 확실한 전환점이 보이지 않습니다. 인내심을 갖고 명확한 신호를 기다리세요.',
    };
  }
};

/**
 * 포트폴리오 AI 진단
 */
export const analyzePortfolio = async (holdings) => {
  try {
    const response = await axios.post(`${SERVER}/api/ai/portfolio`, { holdings });
    return response.data;
  } catch (error) {
    console.error('❌ 포트폴리오 진단 실패:', error.message);
    return null;
  }
};

// 기존 함수 (하위 호환성 유지)
export const analyzeStock = async (symbol, stockData) => {
  try {
    console.log('🤖 AI 분석 시작:', symbol);

    const response = await axios.post(`${SERVER}/api/ai/analyze`, stockData);
    const result = response.data;

    console.log('✅ AI 분석 성공:', result.recommendation);
    return result;
  } catch (error) {
    console.error('❌ AI 분석 실패:', error.message);

    const inst = stockData.institutional?.daily || 0;
    const price = stockData.price || 0;
    const randomFactor = Math.random();

    let rec, conf, target, reasoning, risks;

    if (inst > 3000) {
      rec = '매수';
      conf = 80 + Math.floor(Math.random() * 10);
      target = Math.round(price * (1.10 + Math.random() * 0.05));
      const reasons = [
        `기관 매수세 ${inst.toFixed(0)}억원으로 매우 강합니다. 외국인 매수도 동반되며 강한 상승 모멘텀이 확인됩니다.`,
        `기관 순매수 ${inst.toFixed(0)}억원의 강력한 매집이 확인됩니다. 차트상 상승 추세가 뚜렷하여 추가 상승 기대됩니다.`,
      ];
      const riskList = [
        '단기 과열 가능성이 있어 분할 매수를 권장합니다.',
        '시장 전체 조정 시 동반 하락 가능성이 있습니다.',
      ];
      reasoning = reasons[Math.floor(randomFactor * reasons.length)];
      risks = riskList[Math.floor(randomFactor * riskList.length)];
    } else if (inst > 1000) {
      rec = '매수';
      conf = 70 + Math.floor(Math.random() * 8);
      target = Math.round(price * (1.05 + Math.random() * 0.05));
      reasoning = `기관 매수세 ${inst.toFixed(0)}억원으로 양호합니다.`;
      risks = '시장 변동성 확대 시 일시 조정 가능합니다.';
    } else if (inst < -1000) {
      rec = '매도';
      conf = 65 + Math.floor(Math.random() * 10);
      target = Math.round(price * (0.90 + Math.random() * 0.05));
      reasoning = `기관 매도세 ${Math.abs(inst).toFixed(0)}억원으로 하락 압력이 강합니다.`;
      risks = '추가 하락 시 손실 확대 우려가 있습니다.';
    } else {
      rec = '보유';
      conf = 55 + Math.floor(Math.random() * 10);
      target = Math.round(price * (1.00 + Math.random() * 0.05));
      reasoning = `기관 매매 ${inst.toFixed(0)}억원으로 관망 국면입니다.`;
      risks = '방향성 불명확으로 급변 가능성이 있습니다.';
    }

    return {
      recommendation: rec,
      confidence: conf,
      targetPrice: target,
      reasoning,
      risks,
      timeHorizon: '1개월',
    };
  }
};
