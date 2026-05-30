import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ── 기술적 지표 계산 함수들 ───────────────────────────────────────

const calculateRSI = (closes, period = 14) => {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

const calculateMACD = (closes) => {
  if (closes.length < 26) return null;

  const ema = (data, period) => {
    const k = 2 / (period + 1);
    let emaVal = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
      emaVal = data[i] * k + emaVal * (1 - k);
    }
    return emaVal;
  };

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12 - ema26;

  const prevCloses = closes.slice(0, -1);
  const prevEma12 = ema(prevCloses, 12);
  const prevEma26 = ema(prevCloses, 26);
  const prevMacd = prevEma12 - prevEma26;

  const signal = prevMacd;
  const histogram = macdLine - signal;

  let crossSignal = '횡보';
  if (macdLine > 0 && prevMacd <= 0) crossSignal = '골든크로스';
  else if (macdLine < 0 && prevMacd >= 0) crossSignal = '데드크로스';
  else if (macdLine > 0) crossSignal = '상승 추세';
  else crossSignal = '하락 추세';

  return { macd: macdLine, signal, histogram, crossSignal };
};

const calculateBollingerBands = (closes, period = 20, multiplier = 2) => {
  if (closes.length < period) return null;

  const recentCloses = closes.slice(-period);
  const sma = recentCloses.reduce((a, b) => a + b, 0) / period;
  const variance = recentCloses.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upperBand = sma + multiplier * stdDev;
  const lowerBand = sma - multiplier * stdDev;
  const currentPrice = closes[closes.length - 1];

  const bandWidth = upperBand - lowerBand;
  const position = bandWidth > 0 ? ((currentPrice - lowerBand) / bandWidth) * 100 : 50;

  let signal = '중립';
  if (currentPrice > upperBand) signal = '상단 돌파 (과매수)';
  else if (currentPrice < lowerBand) signal = '하단 돌파 (과매도)';
  else if (position > 80) signal = '상단 근접';
  else if (position < 20) signal = '하단 근접';

  return { upper: upperBand, middle: sma, lower: lowerBand, position, signal };
};

const calculateStochastic = (chartData, period = 14) => {
  if (chartData.length < period) return null;

  const rawKValues = [];
  for (let i = period - 1; i < chartData.length; i++) {
    const slice = chartData.slice(i - period + 1, i + 1);
    const highestHigh = Math.max(...slice.map(d => d.high));
    const lowestLow = Math.min(...slice.map(d => d.low));
    const range = highestHigh - lowestLow;
    rawKValues.push(range > 0 ? ((chartData[i].close - lowestLow) / range) * 100 : 50);
  }

  if (rawKValues.length < 3) return null;

  const last3K = rawKValues.slice(-3);
  const kSmoothed = last3K.reduce((a, b) => a + b, 0) / last3K.length;

  const last6K = rawKValues.slice(-6);
  const dSmoothed = last6K.reduce((a, b) => a + b, 0) / last6K.length;

  let signal = '중립';
  if (kSmoothed < 20) signal = '과매도';
  else if (kSmoothed > 80) signal = '과매수';
  else if (kSmoothed > dSmoothed) signal = '상승';
  else signal = '하락';

  return { k: kSmoothed, d: dSmoothed, signal };
};

const calculateMovingAverages = (closes) => {
  if (closes.length < 5) return null;

  const ma = (n) => closes.length >= n
    ? closes.slice(-n).reduce((a, b) => a + b, 0) / n
    : null;

  const ma5 = ma(5);
  const ma20 = ma(20);
  const ma60 = ma(60);
  const current = closes[closes.length - 1];

  let bullish = 0;
  let total = 0;

  if (ma5 !== null) { total++; if (current > ma5) bullish++; }
  if (ma20 !== null) {
    total++; if (current > ma20) bullish++;
    if (ma5 !== null) { total++; if (ma5 > ma20) bullish++; }
  }
  if (ma60 !== null) {
    total++; if (current > ma60) bullish++;
    if (ma20 !== null) { total++; if (ma20 > ma60) bullish++; }
  }

  const ratio = total > 0 ? bullish / total : 0.5;

  let signal = '중립';
  if (ratio >= 0.8) signal = '강한 상승';
  else if (ratio >= 0.6) signal = '상승';
  else if (ratio <= 0.2) signal = '강한 하락';
  else if (ratio <= 0.4) signal = '하락';

  return { ma5, ma20, ma60, current, signal, ratio };
};

const calculateOverallScore = (rsi, macd, bollinger, stochastic, movingAverages) => {
  let score = 50;

  if (rsi !== null) {
    if (rsi < 30) score += 18;
    else if (rsi < 40) score += 9;
    else if (rsi > 70) score -= 18;
    else if (rsi > 60) score -= 5;
    else score += 3;
  }

  if (macd !== null) {
    if (macd.crossSignal === '골든크로스') score += 20;
    else if (macd.crossSignal === '상승 추세') score += 8;
    else if (macd.crossSignal === '데드크로스') score -= 20;
    else if (macd.crossSignal === '하락 추세') score -= 8;
  }

  if (bollinger !== null) {
    if (bollinger.signal.includes('하단 돌파')) score += 12;
    else if (bollinger.signal.includes('하단 근접')) score += 6;
    else if (bollinger.signal.includes('상단 돌파')) score -= 12;
    else if (bollinger.signal.includes('상단 근접')) score -= 4;
  }

  if (stochastic !== null) {
    if (stochastic.signal === '과매도') score += 10;
    else if (stochastic.signal === '상승') score += 5;
    else if (stochastic.signal === '과매수') score -= 10;
    else if (stochastic.signal === '하락') score -= 5;
  }

  if (movingAverages !== null) {
    if (movingAverages.signal === '강한 상승') score += 10;
    else if (movingAverages.signal === '상승') score += 5;
    else if (movingAverages.signal === '강한 하락') score -= 10;
    else if (movingAverages.signal === '하락') score -= 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
};

// ── 게이지 바 컴포넌트 ────────────────────────────────────────────
const GaugeBar = ({ value, min = 0, max = 100, zones }) => {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <View style={gaugeStyles.wrapper}>
      <View style={gaugeStyles.track}>
        {zones.map((z, i) => (
          <View key={i} style={[gaugeStyles.zone, { flex: z.flex, backgroundColor: z.color }]} />
        ))}
        <View style={[gaugeStyles.indicator, { left: `${pct}%` }]} />
      </View>
      <View style={gaugeStyles.labelRow}>
        {zones.map((z, i) => (
          <Text key={i} style={[gaugeStyles.zoneLabel, { flex: z.flex, textAlign: i === 0 ? 'left' : i === zones.length - 1 ? 'right' : 'center' }]}>
            {z.label}
          </Text>
        ))}
      </View>
    </View>
  );
};

const gaugeStyles = StyleSheet.create({
  wrapper: { marginTop: 10 },
  track: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'visible',
    position: 'relative',
  },
  zone: {},
  indicator: {
    position: 'absolute',
    top: -5,
    width: 18,
    height: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    marginLeft: -9,
    borderWidth: 3,
    borderColor: '#00D9FF',
    shadowColor: '#00D9FF',
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  labelRow: { flexDirection: 'row', marginTop: 10 },
  zoneLabel: { fontSize: 10, color: '#4A5568' },
});

// ── 메인 컴포넌트 ──────────────────────────────────────────────────
export default function QuantAnalysis({ chartData }) {
  const [expanded, setExpanded] = useState({
    rsi: false,
    macd: false,
    bollinger: false,
    stochastic: false,
    ma: false,
  });

  const toggleExpand = (key) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (!chartData || chartData.length < 14) {
    return (
      <View style={styles.container}>
        <View style={styles.titleRow}>
          <View style={styles.titleAccent} />
          <Text style={styles.title}>퀀트 분석</Text>
        </View>
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.noDataText}>차트 데이터가 부족합니다 (최소 14일 필요)</Text>
          <Text style={styles.hintText}>1개월 또는 3개월 탭에서 확인하세요</Text>
        </View>
      </View>
    );
  }

  const closes = chartData.map(d => d.close);

  const rsi = calculateRSI(closes);
  const macd = calculateMACD(closes);
  const bollinger = calculateBollingerBands(closes);
  const stochastic = calculateStochastic(chartData);
  const movingAverages = calculateMovingAverages(closes);
  const overallScore = calculateOverallScore(rsi, macd, bollinger, stochastic, movingAverages);

  const getRSIStatus = (value) => {
    if (value === null) return { text: 'N/A', color: '#6B7280', icon: '–' };
    if (value < 30) return { text: '과매도', color: '#00FF88', icon: '⚡' };
    if (value < 40) return { text: '저가권', color: '#00D9FF', icon: '↓' };
    if (value > 70) return { text: '과매수', color: '#FF4466', icon: '⚠' };
    if (value > 60) return { text: '고가권', color: '#FFD700', icon: '↑' };
    return { text: '중립', color: '#8892A4', icon: '→' };
  };

  const getMACDStatus = (data) => {
    if (!data) return { text: 'N/A', color: '#6B7280', icon: '–' };
    switch (data.crossSignal) {
      case '골든크로스': return { text: '골든크로스', color: '#00FF88', icon: '★' };
      case '상승 추세':  return { text: '상승 추세',  color: '#00D9FF', icon: '↑' };
      case '데드크로스': return { text: '데드크로스', color: '#FF4466', icon: '✕' };
      case '하락 추세':  return { text: '하락 추세',  color: '#FF8844', icon: '↓' };
      default: return { text: '횡보', color: '#8892A4', icon: '→' };
    }
  };

  const getBollingerStatus = (data) => {
    if (!data) return { text: 'N/A', color: '#6B7280', icon: '–' };
    if (data.signal.includes('하단 돌파')) return { text: '하단 돌파', color: '#00FF88', icon: '⚡' };
    if (data.signal.includes('하단 근접')) return { text: '하단 근접', color: '#00D9FF', icon: '↓' };
    if (data.signal.includes('상단 돌파')) return { text: '상단 돌파', color: '#FF4466', icon: '⚠' };
    if (data.signal.includes('상단 근접')) return { text: '상단 근접', color: '#FFD700', icon: '↑' };
    return { text: '중립', color: '#8892A4', icon: '→' };
  };

  const getStochasticStatus = (data) => {
    if (!data) return { text: 'N/A', color: '#6B7280', icon: '–' };
    if (data.signal === '과매도') return { text: '과매도', color: '#00FF88', icon: '⚡' };
    if (data.signal === '상승')   return { text: '상승',   color: '#00D9FF', icon: '↑' };
    if (data.signal === '과매수') return { text: '과매수', color: '#FF4466', icon: '⚠' };
    if (data.signal === '하락')   return { text: '하락',   color: '#FF8844', icon: '↓' };
    return { text: '중립', color: '#8892A4', icon: '→' };
  };

  const getMAStatus = (data) => {
    if (!data) return { text: 'N/A', color: '#6B7280', icon: '–' };
    if (data.signal === '강한 상승') return { text: '강한 상승', color: '#00FF88', icon: '🚀' };
    if (data.signal === '상승')      return { text: '상승',      color: '#00D9FF', icon: '↑' };
    if (data.signal === '강한 하락') return { text: '강한 하락', color: '#FF4466', icon: '⚠' };
    if (data.signal === '하락')      return { text: '하락',      color: '#FF8844', icon: '↓' };
    return { text: '중립', color: '#8892A4', icon: '→' };
  };

  const getScoreConfig = (score) => {
    if (score >= 70) return { color: '#00FF88', label: '매수 유리', bg: '#00FF8815', border: '#00FF8840' };
    if (score >= 55) return { color: '#00D9FF', label: '매수 우세', bg: '#00D9FF15', border: '#00D9FF40' };
    if (score >= 45) return { color: '#FFD700', label: '중립',     bg: '#FFD70015', border: '#FFD70040' };
    if (score >= 30) return { color: '#FF8844', label: '매도 우세', bg: '#FF884415', border: '#FF884440' };
    return { color: '#FF4466', label: '매도 고려', bg: '#FF446615', border: '#FF446640' };
  };

  const getScoreMeter = (score) => {
    if (score >= 80) return '●●●●●';
    if (score >= 65) return '●●●●○';
    if (score >= 50) return '●●●○○';
    if (score >= 35) return '●●○○○';
    return '●○○○○';
  };

  const formatPrice = (v) => v ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : 'N/A';

  const rsiStatus  = getRSIStatus(rsi);
  const macdStatus = getMACDStatus(macd);
  const bollingerStatus = getBollingerStatus(bollinger);
  const stochasticStatus = getStochasticStatus(stochastic);
  const maStatus = getMAStatus(movingAverages);
  const scoreConfig = getScoreConfig(overallScore);

  // 접기/펼치기 카드
  const IndicatorCard = ({ indicatorKey, name, status, children }) => {
    const isOpen = expanded[indicatorKey];
    return (
      <View style={[styles.indicatorCard, { borderLeftColor: status.color }]}>
        <TouchableOpacity
          style={styles.indicatorHeader}
          onPress={() => toggleExpand(indicatorKey)}
          activeOpacity={0.7}
        >
          <View style={styles.indicatorHeaderLeft}>
            <Text style={styles.indicatorName}>{name}</Text>
          </View>
          <View style={styles.indicatorHeaderRight}>
            <View style={[styles.indicatorBadge, { backgroundColor: status.color + '20' }]}>
              <Text style={[styles.indicatorStatus, { color: status.color }]}>
                {status.icon}  {status.text}
              </Text>
            </View>
            <Text style={[styles.chevron, isOpen && { color: '#00D9FF' }]}>
              {isOpen ? '▲' : '▼'}
            </Text>
          </View>
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.indicatorContent}>
            {children}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <View style={styles.titleAccent} />
          <Text style={styles.title}>퀀트 분석</Text>
        </View>
        <Text style={styles.dataCount}>5개 지표</Text>
      </View>

      {/* 종합 점수 */}
      <View style={[styles.scoreSection, { backgroundColor: scoreConfig.bg, borderColor: scoreConfig.border }]}>
        <View style={styles.scoreLeft}>
          <Text style={[styles.scoreNumber, { color: scoreConfig.color }]}>{overallScore}</Text>
          <Text style={styles.scoreDivider}>/100</Text>
        </View>
        <View style={styles.scoreDividerLine} />
        <View style={styles.scoreRight}>
          <Text style={[styles.scoreMeter, { color: scoreConfig.color }]}>{getScoreMeter(overallScore)}</Text>
          <Text style={[styles.scoreLabel, { color: scoreConfig.color }]}>{scoreConfig.label}</Text>
          <Text style={styles.scoreHint}>탭하여 지표 상세 확인</Text>
        </View>
      </View>

      {/* RSI */}
      <IndicatorCard indicatorKey="rsi" name="RSI  ·  14일" status={rsiStatus}>
        <Text style={[styles.indicatorBigValue, { color: rsiStatus.color }]}>
          {rsi !== null ? rsi.toFixed(1) : 'N/A'}
        </Text>
        {rsi !== null && (
          <GaugeBar
            value={rsi}
            zones={[
              { flex: 30, color: '#00FF8840', label: '과매도 (<30)' },
              { flex: 40, color: '#FFD70025', label: '중립' },
              { flex: 30, color: '#FF446640', label: '과매수 (>70)' },
            ]}
          />
        )}
      </IndicatorCard>

      {/* MACD */}
      <IndicatorCard indicatorKey="macd" name="MACD  ·  12,26,9" status={macdStatus}>
        {macd && (
          <View style={styles.valueGrid}>
            <ValueRow label="MACD 라인" value={macd.macd.toFixed(0)} color={macd.macd >= 0 ? '#00FF88' : '#FF4466'} />
            <ValueRow label="히스토그램" value={(macd.histogram >= 0 ? '+' : '') + macd.histogram.toFixed(0)} color={macd.histogram >= 0 ? '#00FF88' : '#FF4466'} />
            <ValueRow label="시그널" value={macd.crossSignal} color={macdStatus.color} />
          </View>
        )}
      </IndicatorCard>

      {/* 볼린저 밴드 */}
      <IndicatorCard indicatorKey="bollinger" name="볼린저 밴드  ·  20,2" status={bollingerStatus}>
        {bollinger && (
          <>
            <View style={styles.valueGrid}>
              <ValueRow label="상단 밴드" value={formatPrice(bollinger.upper)} color="#FF4466" />
              <ValueRow label="중심 (SMA)" value={formatPrice(bollinger.middle)} color="#FFFFFF" />
              <ValueRow label="하단 밴드" value={formatPrice(bollinger.lower)} color="#00FF88" />
              <ValueRow label="밴드 내 위치" value={`${bollinger.position.toFixed(1)}%`} color="#00D9FF" />
            </View>
            <GaugeBar
              value={bollinger.position}
              zones={[
                { flex: 20, color: '#00FF8840', label: '하단' },
                { flex: 60, color: '#FFFFFF10', label: '중립' },
                { flex: 20, color: '#FF446640', label: '상단' },
              ]}
            />
          </>
        )}
      </IndicatorCard>

      {/* 스토캐스틱 */}
      <IndicatorCard indicatorKey="stochastic" name="스토캐스틱  ·  14,3" status={stochasticStatus}>
        {stochastic && (
          <>
            <View style={styles.valueGrid}>
              <ValueRow label="%K (Slow)" value={stochastic.k.toFixed(1)} color={stochasticStatus.color} />
              <ValueRow label="%D (Signal)" value={stochastic.d.toFixed(1)} color="#8892A4" />
            </View>
            <GaugeBar
              value={stochastic.k}
              zones={[
                { flex: 20, color: '#00FF8840', label: '과매도 (<20)' },
                { flex: 60, color: '#FFFFFF10', label: '중립' },
                { flex: 20, color: '#FF446640', label: '과매수 (>80)' },
              ]}
            />
          </>
        )}
      </IndicatorCard>

      {/* 이동평균 크로스 */}
      <IndicatorCard indicatorKey="ma" name="이동평균 크로스" status={maStatus}>
        {movingAverages && (
          <View style={styles.valueGrid}>
            <ValueRow label="현재가" value={formatPrice(movingAverages.current)} color="#FFFFFF" />
            <ValueRow
              label="5MA"
              value={formatPrice(movingAverages.ma5)}
              color={movingAverages.ma5 && movingAverages.current > movingAverages.ma5 ? '#00FF88' : '#FF4466'}
              sub={movingAverages.ma5 && movingAverages.current > movingAverages.ma5 ? '▲ 위' : '▼ 아래'}
            />
            <ValueRow
              label="20MA"
              value={formatPrice(movingAverages.ma20)}
              color={movingAverages.ma20 && movingAverages.current > movingAverages.ma20 ? '#00FF88' : '#FF4466'}
              sub={movingAverages.ma20 && movingAverages.current > movingAverages.ma20 ? '▲ 위' : '▼ 아래'}
            />
            {movingAverages.ma60 && (
              <ValueRow
                label="60MA"
                value={formatPrice(movingAverages.ma60)}
                color={movingAverages.current > movingAverages.ma60 ? '#00FF88' : '#FF4466'}
                sub={movingAverages.current > movingAverages.ma60 ? '▲ 위' : '▼ 아래'}
              />
            )}
          </View>
        )}
      </IndicatorCard>
    </View>
  );
}

// ── 값 행 컴포넌트 ────────────────────────────────────────────────
const ValueRow = ({ label, value, color, sub }) => (
  <View style={vrStyles.row}>
    <Text style={vrStyles.label}>{label}</Text>
    <View style={vrStyles.right}>
      {sub && <Text style={[vrStyles.sub, { color }]}>{sub}</Text>}
      <Text style={[vrStyles.value, { color: color || '#FFFFFF' }]}>{value}</Text>
    </View>
  </View>
);

const vrStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2340',
  },
  label: { fontSize: 13, color: '#6B7280' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sub: { fontSize: 11, fontWeight: '600' },
  value: { fontSize: 15, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#161B35',
    borderRadius: 16,
    padding: 20,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#252A47',
  },

  // 헤더
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleAccent: {
    width: 4,
    height: 20,
    backgroundColor: '#A78BFA',
    borderRadius: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  dataCount: {
    fontSize: 11,
    color: '#A78BFA',
    backgroundColor: '#A78BFA15',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    fontWeight: '600',
  },
  emptyBox: { alignItems: 'center', paddingVertical: 30 },
  emptyIcon: { fontSize: 32, marginBottom: 10 },
  noDataText: { color: '#6B7280', fontSize: 14, marginBottom: 6 },
  hintText: { color: '#4A5568', fontSize: 12 },

  // 종합 점수
  scoreSection: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    gap: 16,
  },
  scoreLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: '900',
    lineHeight: 52,
  },
  scoreDivider: {
    fontSize: 16,
    color: '#4A5568',
    fontWeight: '600',
  },
  scoreDividerLine: {
    width: 1,
    height: 50,
    backgroundColor: '#252A47',
  },
  scoreRight: {
    flex: 1,
    gap: 4,
  },
  scoreMeter: {
    fontSize: 16,
    letterSpacing: 3,
    fontWeight: '700',
  },
  scoreLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  scoreHint: {
    fontSize: 11,
    color: '#4A5568',
    marginTop: 2,
  },

  // 지표 카드
  indicatorCard: {
    backgroundColor: '#0D1128',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#252A47',
    borderLeftWidth: 3,
    overflow: 'hidden',
  },
  indicatorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  indicatorHeaderLeft: {
    flex: 1,
  },
  indicatorHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  indicatorName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8892A4',
    letterSpacing: 0.3,
  },
  indicatorBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  indicatorStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 9,
    color: '#4A5568',
  },
  indicatorContent: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#1E2340',
  },
  indicatorBigValue: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 2,
    letterSpacing: -0.5,
  },
  valueGrid: {
    marginTop: 4,
  },
});
