import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

const screenWidth = Dimensions.get('window').width;
const chartWidth = screenWidth - 32;
const CANDLE_W = 9;
const CANDLE_GAP = 3;

const PAD = { top: 16, right: 8, bottom: 32, left: 58 };
const PRICE_H = 240;
const VOL_H = 44;
const VOL_GAP = 8;
const TOTAL_H = PAD.top + PRICE_H + VOL_GAP + VOL_H + PAD.bottom;

const PRICE_TOP = PAD.top;
const PRICE_BOT = PRICE_TOP + PRICE_H;
const VOL_TOP = PRICE_BOT + VOL_GAP;
const VOL_BOT = VOL_TOP + VOL_H;

// 색상 팔레트 (TradingView 다크 기준)
const C = {
  bg: '#131722',
  chartBg: '#0E1116',
  grid: '#1E2230',
  axis: '#2A3042',
  up: '#26A69A',
  down: '#EF5350',
  upVol: '#26A69A55',
  downVol: '#EF535055',
  ma5: '#F7B731',
  ma20: '#5C6BC0',
  ma60: '#AB47BC',
  text: '#D9E0E8',
  textDim: '#4A5568',
  textMid: '#718096',
};

export default function PriceChart({ data, period }) {
  if (!data || data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>차트 데이터 로딩 중...</Text>
      </View>
    );
  }

  const prices = data.flatMap(d => [d.high, d.low]);
  const rawMax = Math.max(...prices);
  const rawMin = Math.min(...prices);
  const pad = (rawMax - rawMin) * 0.05;
  const maxP = rawMax + pad;
  const minP = rawMin - pad;
  const priceRange = maxP - minP;

  const innerW = chartWidth - PAD.left - PAD.right;
  const candleStep = CANDLE_W + CANDLE_GAP;
  const totalW = Math.max(innerW, data.length * candleStep);

  const pY = (price) => PRICE_TOP + PRICE_H * (1 - (price - minP) / (priceRange || 1));

  const calcMA = (n) => data.map((_, i) => {
    if (i < n - 1) return null;
    return data.slice(i - n + 1, i + 1).reduce((s, d) => s + d.close, 0) / n;
  });

  const maPath = (vals, color) => {
    if (!vals) return null;
    let d = '';
    let gap = true;
    vals.forEach((v, i) => {
      if (v == null) { gap = true; return; }
      const x = PAD.left + i * candleStep + CANDLE_W / 2;
      const y = pY(v);
      d += gap ? `M${x},${y}` : `L${x},${y}`;
      gap = false;
    });
    return d ? <Path key={color} d={d} stroke={color} strokeWidth="1.5" fill="none" /> : null;
  };

  const ma5 = calcMA(5);
  const ma20 = calcMA(20);
  const ma60 = data.length >= 30 ? calcMA(60) : null;

  const volumes = data.map(d => d.volume || 0);
  const maxVol = Math.max(...volumes, 1);
  const hasVol = volumes.some(v => v > 0);

  // Y축 눈금 4개
  const yTicks = [0, 1, 2, 3].map(i => {
    const v = minP + (priceRange * i / 3);
    return { v, y: pY(v) };
  });

  const fmtPrice = (p) => {
    if (p >= 1000000) return (p / 1000000).toFixed(2) + 'M';
    if (p >= 1000) return Math.round(p).toLocaleString();
    return p.toFixed(0);
  };

  // X축 레이블 (최대 6개)
  const maxX = 6;
  const step = Math.max(1, Math.floor(data.length / maxX));
  const xLabels = data
    .map((d, i) => ({ ...d, i }))
    .filter((_, i) => i % step === 0 || i === data.length - 1);

  const svgW = totalW + PAD.left + PAD.right;

  const periodLabel = { '1d': '1일', '5d': '5일', '1mo': '1개월', '3mo': '3개월' }[period] || period;
  const lastClose = data[data.length - 1]?.close;
  const firstOpen = data[0]?.open;
  const change = lastClose - firstOpen;
  const changePct = firstOpen ? (change / firstOpen) * 100 : 0;
  const isUp = change >= 0;

  return (
    <View style={styles.wrap}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.periodChip}>{periodLabel}</Text>
          <Text style={[styles.changeText, { color: isUp ? C.up : C.down }]}>
            {isUp ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.statLabel}>고 <Text style={{ color: C.up }}>{fmtPrice(rawMax)}</Text></Text>
          <Text style={[styles.statLabel, { marginLeft: 12 }]}>저 <Text style={{ color: C.down }}>{fmtPrice(rawMin)}</Text></Text>
        </View>
      </View>

      {/* MA 범례 */}
      <View style={styles.legend}>
        {[['MA5', C.ma5], ['MA20', C.ma20], ...(ma60 ? [['MA60', C.ma60]] : [])].map(([label, color]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: color }]} />
            <Text style={styles.legendLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* 차트 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={{ paddingRight: 8 }}
      >
        <Svg width={svgW} height={TOTAL_H}>
          <Defs>
            <LinearGradient id="volUp" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={C.up} stopOpacity="0.5" />
              <Stop offset="1" stopColor={C.up} stopOpacity="0.1" />
            </LinearGradient>
            <LinearGradient id="volDn" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={C.down} stopOpacity="0.5" />
              <Stop offset="1" stopColor={C.down} stopOpacity="0.1" />
            </LinearGradient>
          </Defs>

          {/* 차트 배경 */}
          <Rect x={PAD.left} y={PRICE_TOP} width={totalW} height={PRICE_H} fill={C.chartBg} />

          {/* 수평 그리드 */}
          {yTicks.map((t, i) => (
            <Line key={i} x1={PAD.left} y1={t.y} x2={PAD.left + totalW} y2={t.y}
              stroke={C.grid} strokeWidth="1" />
          ))}

          {/* Y축 레이블 */}
          {yTicks.map((t, i) => (
            <SvgText key={i} x={PAD.left - 6} y={t.y + 4}
              fontSize="11" fill={C.textMid} textAnchor="end" fontFamily="monospace">
              {fmtPrice(t.v)}
            </SvgText>
          ))}

          {/* MA 선 */}
          {maPath(ma5, C.ma5)}
          {maPath(ma20, C.ma20)}
          {ma60 && maPath(ma60, C.ma60)}

          {/* 캔들 심지 (몸통보다 먼저 그려야 몸통이 위에 올라옴) */}
          {data.map((d, i) => {
            const cx = PAD.left + i * candleStep + CANDLE_W / 2;
            const color = d.close >= d.open ? C.up : C.down;
            return (
              <Line key={`w${i}`}
                x1={cx} y1={pY(d.high)} x2={cx} y2={pY(d.low)}
                stroke={color} strokeWidth="1" />
            );
          })}

          {/* 캔들 몸통 */}
          {data.map((d, i) => {
            const cx = PAD.left + i * candleStep + CANDLE_W / 2;
            const openY = pY(d.open);
            const closeY = pY(d.close);
            const color = d.close >= d.open ? C.up : C.down;
            const bodyTop = Math.min(openY, closeY);
            const bodyH = Math.max(Math.abs(closeY - openY), 1.5);
            return (
              <Rect key={`b${i}`}
                x={cx - CANDLE_W / 2} y={bodyTop}
                width={CANDLE_W} height={bodyH}
                fill={color} rx="1" />
            );
          })}

          {/* 좌측 축선 */}
          <Line x1={PAD.left} y1={PRICE_TOP} x2={PAD.left} y2={PRICE_BOT}
            stroke={C.axis} strokeWidth="1" />
          <Line x1={PAD.left} y1={PRICE_BOT} x2={PAD.left + totalW} y2={PRICE_BOT}
            stroke={C.axis} strokeWidth="1" />

          {/* 거래량 */}
          {hasVol && data.map((d, i) => {
            const cx = PAD.left + i * candleStep + CANDLE_W / 2;
            const up = d.close >= d.open;
            const h = Math.max((d.volume / maxVol) * VOL_H, 1);
            return (
              <Rect key={`v${i}`}
                x={cx - CANDLE_W / 2} y={VOL_BOT - h}
                width={CANDLE_W} height={h}
                fill={up ? C.upVol : C.downVol}
                rx="1" />
            );
          })}

          {/* 거래량 상단 구분선 */}
          {hasVol && (
            <Line x1={PAD.left} y1={VOL_TOP} x2={PAD.left + totalW} y2={VOL_TOP}
              stroke={C.grid} strokeWidth="1" />
          )}

          {/* X축 레이블 */}
          {xLabels.map((d) => (
            <SvgText key={d.i}
              x={PAD.left + d.i * candleStep + CANDLE_W / 2}
              y={TOTAL_H - 8}
              fontSize="10" fill={C.textMid} textAnchor="middle">
              {d.time}
            </SvgText>
          ))}
        </Svg>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: C.bg,
    borderRadius: 12,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 8,
    marginVertical: 8,
  },
  empty: {
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  emptyText: {
    color: C.textMid,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  periodChip: {
    fontSize: 12,
    color: C.text,
    fontWeight: '700',
    backgroundColor: '#1E2230',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  changeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: C.textMid,
    fontWeight: '500',
  },
  legend: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 8,
    paddingLeft: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendLine: {
    width: 16,
    height: 2,
    borderRadius: 1,
  },
  legendLabel: {
    fontSize: 10,
    color: C.textMid,
    fontWeight: '600',
  },
  scroll: {
    marginTop: 2,
  },
});
