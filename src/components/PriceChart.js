import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

const screenWidth = Dimensions.get('window').width;
const chartWidth = screenWidth - 40;
const candleWidth = 12;

// 레이아웃 상수
const padding = { top: 30, right: 15, bottom: 40, left: 60 };
const PRICE_AREA_HEIGHT = 200;
const VOLUME_GAP = 14;
const VOLUME_AREA_HEIGHT = 52;
const CHART_HEIGHT = padding.top + PRICE_AREA_HEIGHT + VOLUME_GAP + VOLUME_AREA_HEIGHT + padding.bottom;

const PRICE_TOP = padding.top;
const PRICE_BOTTOM = PRICE_TOP + PRICE_AREA_HEIGHT;
const VOLUME_TOP = PRICE_BOTTOM + VOLUME_GAP;
const VOLUME_BOTTOM = VOLUME_TOP + VOLUME_AREA_HEIGHT;

export default function PriceChart({ data, period }) {
  if (!data || data.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.noDataText}>차트 데이터 로딩 중...</Text>
      </View>
    );
  }

  const prices = data.map(item => [item.high, item.low]).flat();
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const priceRange = maxPrice - minPrice;
  const priceChange = data[data.length - 1]?.close - data[0]?.open;
  const isPositive = priceChange >= 0;

  const innerWidth = chartWidth - padding.left - padding.right;
  const totalWidth = Math.max(innerWidth, data.length * (candleWidth + 4));
  const candleSpacing = totalWidth / data.length;

  // 가격 → Y 좌표 (가격 영역 기준)
  const priceToY = (price) => {
    const ratio = (price - minPrice) / (priceRange || 1);
    return PRICE_TOP + PRICE_AREA_HEIGHT * (1 - ratio);
  };

  // 이동평균 계산
  const calcMA = (period) => data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((sum, d) => sum + d.close, 0) / period;
  });

  const ma5Values = calcMA(5);
  const ma20Values = calcMA(20);
  const ma60Values = data.length >= 60 ? calcMA(60) : null;

  // MA → SVG Path (null 구간에서 선 끊기)
  const maToPath = (maValues) => {
    if (!maValues) return '';
    let pathStr = '';
    let lastNull = true;
    maValues.forEach((val, i) => {
      if (val !== null) {
        const x = padding.left + candleSpacing * i + candleSpacing / 2;
        const y = priceToY(val);
        pathStr += lastNull ? `M ${x} ${y} ` : `L ${x} ${y} `;
        lastNull = false;
      } else {
        lastNull = true;
      }
    });
    return pathStr;
  };

  // 거래량
  const volumes = data.map(d => d.volume || 0);
  const maxVolume = Math.max(...volumes, 1);
  const hasVolume = volumes.some(v => v > 0);
  const volToHeight = (vol) => (vol / maxVolume) * VOLUME_AREA_HEIGHT;

  // Y축 눈금 (5개)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const value = minPrice + (priceRange * i / 4);
    return { value, y: priceToY(value) };
  });

  const formatPrice = (price) => {
    if (price >= 1000000) return `${(price / 1000000).toFixed(1)}M`;
    if (price >= 1000) return `${(price / 1000).toFixed(1)}K`;
    if (price >= 100) return price.toFixed(0);
    if (price >= 1) return price.toFixed(1);
    return price.toFixed(2);
  };

  let maxLabels;
  if (data.length <= 10) maxLabels = data.length;
  else if (period === '1d') maxLabels = Math.min(12, data.length);
  else if (period === '5d') maxLabels = Math.min(15, data.length);
  else if (period === '1mo') maxLabels = Math.min(8, data.length);
  else maxLabels = data.length > 100 ? Math.min(20, data.length) : Math.min(10, data.length);

  const labelInterval = Math.max(1, Math.floor(data.length / maxLabels));
  const xLabels = data
    .map((item, index) => ({ ...item, index }))
    .filter((_, i) => i % labelInterval === 0 || i === data.length - 1);

  const svgWidth = Math.max(chartWidth, totalWidth + padding.left + padding.right);

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.priceInfo}>
          <Text style={styles.priceLabel}>기간</Text>
          <Text style={styles.periodValue}>
            {period === '1d' ? '1일' : period === '5d' ? '5일' : period === '1mo' ? '1개월' : '3개월'}
          </Text>
        </View>
        <View style={styles.priceInfo}>
          <Text style={styles.priceLabel}>최고</Text>
          <Text style={[styles.priceValue, { color: '#00FF88' }]}>{formatPrice(maxPrice)}</Text>
        </View>
        <View style={styles.priceInfo}>
          <Text style={styles.priceLabel}>최저</Text>
          <Text style={[styles.priceValue, { color: '#FF4466' }]}>{formatPrice(minPrice)}</Text>
        </View>
        <View style={styles.priceInfo}>
          <Text style={styles.priceLabel}>변동</Text>
          <Text style={[styles.priceValue, { color: isPositive ? '#00FF88' : '#FF4466' }]}>
            {isPositive ? '+' : ''}{formatPrice(Math.abs(priceChange))}
          </Text>
        </View>
      </View>

      {/* MA 범례 */}
      <View style={styles.maLegend}>
        <View style={styles.maLegendItem}>
          <View style={[styles.maLegendLine, { backgroundColor: '#FFD700' }]} />
          <Text style={styles.maLegendText}>MA5</Text>
        </View>
        <View style={styles.maLegendItem}>
          <View style={[styles.maLegendLine, { backgroundColor: '#00D9FF' }]} />
          <Text style={styles.maLegendText}>MA20</Text>
        </View>
        {ma60Values && (
          <View style={styles.maLegendItem}>
            <View style={[styles.maLegendLine, { backgroundColor: '#FF88BB' }]} />
            <Text style={styles.maLegendText}>MA60</Text>
          </View>
        )}
        <View style={[styles.maLegendItem, { marginLeft: 'auto' }]}>
          <View style={[styles.maLegendBox, { backgroundColor: '#00FF8860' }]} />
          <Text style={styles.maLegendText}>Vol+</Text>
        </View>
        <View style={styles.maLegendItem}>
          <View style={[styles.maLegendBox, { backgroundColor: '#FF446660' }]} />
          <Text style={styles.maLegendText}>Vol-</Text>
        </View>
      </View>

      {/* 차트 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 5 }}
        style={styles.scrollView}
      >
        <Svg width={svgWidth} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="gridGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#3A4F6A" stopOpacity="0.3" />
              <Stop offset="1" stopColor="#3A4F6A" stopOpacity="0.1" />
            </LinearGradient>
          </Defs>

          {/* 가격 영역 배경 */}
          <Rect x={padding.left} y={PRICE_TOP} width={totalWidth} height={PRICE_AREA_HEIGHT}
            fill="#1E2A3A" rx="8" />

          {/* Y축 그리드 라인 */}
          {yTicks.map((tick, i) => (
            <Line key={`grid-${i}`}
              x1={padding.left} y1={tick.y} x2={padding.left + totalWidth} y2={tick.y}
              stroke="#3A4F6A" strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
          ))}

          {/* Y축 레이블 */}
          {yTicks.map((tick, i) => (
            <SvgText key={`ylabel-${i}`}
              x={padding.left - 8} y={tick.y + 5}
              fontSize="12" fill="#8A9BAE" textAnchor="end" fontWeight="600">
              {formatPrice(tick.value)}
            </SvgText>
          ))}

          {/* MA 선 (캔들 아래에 먼저 그림) */}
          <Path d={maToPath(ma5Values)} stroke="#FFD700" strokeWidth="1.5" fill="none" opacity="0.9" />
          <Path d={maToPath(ma20Values)} stroke="#00D9FF" strokeWidth="1.5" fill="none" opacity="0.9" />
          {ma60Values && (
            <Path d={maToPath(ma60Values)} stroke="#FF88BB" strokeWidth="1.5" fill="none" opacity="0.9" />
          )}

          {/* 캔들스틱 (MA 위에 그림) */}
          {data.map((item, index) => {
            const x = padding.left + candleSpacing * index + candleSpacing / 2;
            const openY = priceToY(item.open);
            const closeY = priceToY(item.close);
            const highY = priceToY(item.high);
            const lowY = priceToY(item.low);
            const isUp = item.close >= item.open;
            const candleColor = isUp ? '#00FF88' : '#FF4466';
            const candleHeight = Math.max(Math.abs(closeY - openY), 2);

            return (
              <View key={`candle-${index}`}>
                <Line x1={x} y1={highY} x2={x} y2={lowY} stroke={candleColor} strokeWidth="2" />
                <Rect
                  x={x - candleWidth / 2} y={Math.min(openY, closeY)}
                  width={candleWidth} height={candleHeight}
                  fill={candleColor} stroke={candleColor} strokeWidth="1" rx="2" />
              </View>
            );
          })}

          {/* 가격 영역 축 라인 */}
          <Line x1={padding.left} y1={PRICE_TOP} x2={padding.left} y2={PRICE_BOTTOM}
            stroke="#3A4F6A" strokeWidth="2" />
          <Line x1={padding.left} y1={PRICE_BOTTOM} x2={padding.left + totalWidth} y2={PRICE_BOTTOM}
            stroke="#3A4F6A" strokeWidth="2" />

          {/* 거래량 영역 */}
          {hasVolume && (
            <>
              {/* VOL 레이블 */}
              <SvgText x={padding.left - 8} y={VOLUME_TOP + VOLUME_AREA_HEIGHT / 2 + 4}
                fontSize="10" fill="#657786" textAnchor="end" fontWeight="600">
                VOL
              </SvgText>

              {/* 거래량 바 */}
              {data.map((item, index) => {
                const x = padding.left + candleSpacing * index + candleSpacing / 2;
                const isUp = item.close >= item.open;
                const volH = Math.max(volToHeight(item.volume || 0), 1);
                return (
                  <Rect key={`vol-${index}`}
                    x={x - candleWidth / 2}
                    y={VOLUME_BOTTOM - volH}
                    width={candleWidth}
                    height={volH}
                    fill={isUp ? '#00FF8870' : '#FF446670'}
                    rx="1" />
                );
              })}

              {/* 거래량 영역 구분선 */}
              <Line x1={padding.left} y1={VOLUME_TOP} x2={padding.left + totalWidth} y2={VOLUME_TOP}
                stroke="#2A3A4A" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />
              <Line x1={padding.left} y1={VOLUME_BOTTOM} x2={padding.left + totalWidth} y2={VOLUME_BOTTOM}
                stroke="#3A4F6A" strokeWidth="1" />
              <Line x1={padding.left} y1={VOLUME_TOP} x2={padding.left} y2={VOLUME_BOTTOM}
                stroke="#3A4F6A" strokeWidth="2" />
            </>
          )}

          {/* X축 레이블 */}
          {xLabels.map((item) => {
            const x = padding.left + candleSpacing * item.index + candleSpacing / 2;
            return (
              <SvgText key={`xlabel-${item.index}`}
                x={x} y={CHART_HEIGHT - 15}
                fontSize="11" fill="#8A9BAE" textAnchor="middle" fontWeight="500">
                {item.time}
              </SvgText>
            );
          })}
        </Svg>
      </ScrollView>

      {/* 범례 */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#00FF88' }]} />
          <Text style={styles.legendText}>상승</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#FF4466' }]} />
          <Text style={styles.legendText}>하락</Text>
        </View>
        <Text style={styles.legendHint}>← 좌우로 스크롤하세요</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1F3A',
    borderRadius: 16,
    padding: 16,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#2A3F5A',
  },
  priceInfo: {
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 11,
    color: '#8A9BAE',
    marginBottom: 5,
    fontWeight: '500',
  },
  periodValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00D9FF',
  },
  priceValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  maLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  maLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  maLegendLine: {
    width: 18,
    height: 2,
    borderRadius: 1,
  },
  maLegendBox: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  maLegendText: {
    fontSize: 11,
    color: '#8A9BAE',
    fontWeight: '600',
  },
  scrollView: {
    marginVertical: 6,
  },
  noDataText: {
    color: '#8A9BAE',
    fontSize: 15,
    textAlign: 'center',
    padding: 40,
    fontWeight: '500',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 13,
    color: '#B0BEC5',
    fontWeight: '600',
  },
  legendHint: {
    fontSize: 11,
    color: '#6A7A8E',
    fontStyle: 'italic',
    marginLeft: 10,
  },
});
