import * as KISAPI from './kisAPI';

// ETF 상세 정보 조회 (가격, 1개월/3개월 변동률)
const getETFDetails = async (etfCode) => {
  try {
    // 한투 API로 ETF 현재가 조회
    const priceData = await KISAPI.getKISStockPrice(etfCode);

    // 한투 API로 ETF 차트 데이터 조회 (3개월)
    const chartData = await KISAPI.getKISChartData(etfCode, '3mo');

    if (!chartData || chartData.length === 0) {
      return {
        price: priceData?.currentPrice || 0,
        returnRate: priceData?.changeRate || 0,
        oneMonthChange: 0,
        threeMonthChange: 0,
      };
    }

    const currentPrice = priceData?.currentPrice || chartData[chartData.length - 1]?.close || 0;

    // 1개월 전 가격 (약 20거래일)
    const oneMonthAgoPrice = chartData.length >= 20
      ? chartData[chartData.length - 20].close
      : chartData[0].close;

    // 3개월 전 가격
    const threeMonthAgoPrice = chartData[0].close;

    // 변동률 계산
    const oneMonthChange = oneMonthAgoPrice > 0
      ? ((currentPrice - oneMonthAgoPrice) / oneMonthAgoPrice * 100)
      : 0;

    const threeMonthChange = threeMonthAgoPrice > 0
      ? ((currentPrice - threeMonthAgoPrice) / threeMonthAgoPrice * 100)
      : 0;

    return {
      price: currentPrice,
      returnRate: priceData?.changeRate || 0,
      oneMonthChange: oneMonthChange,
      threeMonthChange: threeMonthChange,
    };

  } catch (error) {
    console.error(`❌ ETF [${etfCode}] 상세 정보 조회 실패:`, error.message);
    return {
      price: 0,
      returnRate: 0,
      oneMonthChange: 0,
      threeMonthChange: 0,
    };
  }
};

// 관심 종목의 ETF 편입 정보 가져오기 (수동 관리)
export const fetchETFInfo = async (stockCode) => {
  try {
    // 한국 주식 코드만 처리 (.KS, .KQ 제거)
    const code = stockCode.replace('.KS', '').replace('.KQ', '');

    console.log(`📊 [${code}] ETF 편입 정보 조회 시작`);

    // 관심 종목 데이터에서 ETF 정보 조회
    const etfList = await KISAPI.getETFsContainingStock(code);

    if (etfList.length === 0) {
      console.log(`ℹ️ [${code}] ETF 정보 없음 (관심 종목에 추가 필요)`);
      return [];
    }

    // 1개월/3개월 변동률 추가
    const enrichedList = [];
    for (const etf of etfList) {
      const details = await getETFDetails(etf.code);
      enrichedList.push({
        ...etf,
        oneMonthChange: details.oneMonthChange,
        threeMonthChange: details.threeMonthChange,
      });
    }

    console.log(`✅ [${code}] ETF 편입 정보: ${enrichedList.length}개 ETF`);
    return enrichedList;

  } catch (error) {
    console.error('❌ ETF 정보 조회 실패:', error.message);
    return [];
  }
};
