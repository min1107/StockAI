import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LineChart, PieChart } from 'react-native-chart-kit';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import AIChatModal from '../components/AIChatModal';
import { getHoldings, deleteHolding, addHolding, getAccounts, createAccount, deleteAccount, moveHolding } from '../services/portfolioAPI';
import { fetchStockDetail, searchStocks } from '../services/stockAPI';
import { analyzePortfolio } from '../services/groqAPI';
import { loadNotifSettings, checkPnlAlert, checkBigMovementAlert } from '../services/notificationService';

const SCREEN_W = Dimensions.get('window').width;
const SNAPSHOT_KEY = '@StockAI:pnl_snapshots';

// 오늘 날짜 문자열 (YYYY-MM-DD)
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// AsyncStorage에 오늘 포트폴리오 평가액 저장 (최근 14일 보관)
const saveSnapshot = async (totalEval) => {
  if (!totalEval || totalEval <= 0) return;
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    const history = raw ? JSON.parse(raw) : [];
    const today = todayStr();
    // 오늘 날짜 항목이 이미 있으면 업데이트, 없으면 추가
    const idx = history.findIndex(h => h.date === today);
    if (idx >= 0) {
      history[idx].value = totalEval;
    } else {
      history.push({ date: today, value: totalEval });
    }
    // 최근 14일만 유지
    const trimmed = history.slice(-14);
    await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(trimmed));
  } catch {}
};

const loadSnapshots = async () => {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

// ── 수익률 차트 컴포넌트 ──────────────────────────────────────────────
function PnLChart({ history }) {
  if (!history || history.length < 2) return null;

  const values = history.map(h => h.value);
  const labels = history.map(h => {
    const [, m, d] = h.date.split('-');
    return `${parseInt(m)}/${parseInt(d)}`;
  });

  const first = values[0];
  const last = values[values.length - 1];
  const isPositive = last >= first;
  const lineColor = isPositive ? '#00FF88' : '#FF4466';

  // 최소/최대로 y축 범위 조정
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal;
  // 모두 같은 값이면 스킵
  if (range === 0) return null;

  const pctChange = ((last - first) / first * 100).toFixed(2);
  const sign = isPositive ? '+' : '';

  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.headerRow}>
        <Text style={chartStyles.title}>수익률 추이</Text>
        <Text style={[chartStyles.pctChange, { color: lineColor }]}>
          {sign}{pctChange}% ({history.length}일)
        </Text>
      </View>
      <LineChart
        data={{ labels, datasets: [{ data: values, color: () => lineColor, strokeWidth: 2 }] }}
        width={SCREEN_W - 32}
        height={140}
        withDots={history.length <= 7}
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLabels={true}
        withHorizontalLabels={false}
        withShadow={false}
        chartConfig={{
          backgroundColor: 'transparent',
          backgroundGradientFrom: '#161B35',
          backgroundGradientTo: '#161B35',
          decimalPlaces: 0,
          color: () => lineColor,
          labelColor: () => '#4A5568',
          propsForDots: { r: '3', strokeWidth: '1', stroke: lineColor },
          propsForBackgroundLines: { stroke: 'transparent' },
        }}
        bezier
        style={{ borderRadius: 10, marginLeft: -10 }}
      />
    </View>
  );
}

// ── 보유 비중 파이차트 ─────────────────────────────────────────────
const PIE_COLORS = ['#00D9FF', '#00FF88', '#FFB800', '#FF4466', '#A78BFA', '#FF6B35', '#4ADE80', '#60A5FA', '#F472B6', '#34D399'];

function PortfolioPieChart({ holdings }) {
  if (!holdings || holdings.length < 2) return null;

  const totalEval = holdings.reduce((s, h) => s + (h.currentPrice ?? h.avg_price) * h.shares, 0);
  if (totalEval === 0) return null;

  const data = holdings.map((h, i) => {
    const value = (h.currentPrice ?? h.avg_price) * h.shares;
    const pct = ((value / totalEval) * 100).toFixed(1);
    return {
      name: `${h.stock_name} ${pct}%`,
      value,
      color: PIE_COLORS[i % PIE_COLORS.length],
      legendFontColor: '#8892A4',
      legendFontSize: 11,
    };
  });

  return (
    <View style={pieStyles.container}>
      <Text style={pieStyles.title}>보유 비중</Text>
      <PieChart
        data={data}
        width={SCREEN_W - 32}
        height={180}
        chartConfig={{ color: () => '#fff', backgroundColor: 'transparent', backgroundGradientFrom: '#161B35', backgroundGradientTo: '#161B35' }}
        accessor="value"
        backgroundColor="transparent"
        paddingLeft="10"
        absolute={false}
        hasLegend={true}
      />
    </View>
  );
}

const pieStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#161B35', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#252A47',
  },
  title: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginBottom: 4 },
});

// ── 섹터 분산 파이차트 ─────────────────────────────────────────────
const SECTOR_COLORS = ['#00D9FF', '#A78BFA', '#00FF88', '#FFB800', '#FF4466', '#FF6B35', '#4ADE80', '#60A5FA', '#F472B6', '#34D399'];

const ACCOUNT_COLORS = ['#00D9FF', '#00FF88', '#FFB800', '#A78BFA', '#FF6B35', '#FF4466', '#4ADE80', '#F472B6'];
const BROKER_OPTIONS = ['키움증권', '미래에셋증권', '한국투자증권', 'NH투자증권', '삼성증권', 'KB증권', '신한투자증권', '토스증권', '카카오페이증권', '기타'];

function SectorPieChart({ holdings }) {
  if (!holdings || holdings.length < 2) return null;

  const sectorMap = {};
  for (const h of holdings) {
    const sectorName = h.sector || '기타';
    const value = (h.currentPrice ?? h.avg_price) * h.shares;
    sectorMap[sectorName] = (sectorMap[sectorName] || 0) + value;
  }

  const totalEval = Object.values(sectorMap).reduce((s, v) => s + v, 0);
  if (totalEval === 0) return null;

  const sectors = Object.keys(sectorMap);
  if (sectors.length < 2) return null;

  const data = sectors.map((name, i) => ({
    name: `${name} ${((sectorMap[name] / totalEval) * 100).toFixed(0)}%`,
    value: sectorMap[name],
    color: SECTOR_COLORS[i % SECTOR_COLORS.length],
    legendFontColor: '#8892A4',
    legendFontSize: 11,
  }));

  // 집중도 경고 (한 섹터 50% 이상)
  const maxSector = sectors.reduce((a, b) => sectorMap[a] > sectorMap[b] ? a : b);
  const maxPct = (sectorMap[maxSector] / totalEval) * 100;
  const showWarning = maxPct >= 50;

  return (
    <View style={pieStyles.container}>
      <Text style={pieStyles.title}>섹터 분산</Text>
      <PieChart
        data={data}
        width={SCREEN_W - 32}
        height={180}
        chartConfig={{ color: () => '#fff', backgroundColor: 'transparent', backgroundGradientFrom: '#161B35', backgroundGradientTo: '#161B35' }}
        accessor="value"
        backgroundColor="transparent"
        paddingLeft="10"
        absolute={false}
        hasLegend={true}
      />
      {showWarning && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, padding: 8, backgroundColor: '#FF446615', borderRadius: 8, borderWidth: 1, borderColor: '#FF446640' }}>
          <Text style={{ fontSize: 12 }}>⚠️</Text>
          <Text style={{ fontSize: 12, color: '#FF6B6B', flex: 1 }}>
            {maxSector} 섹터 집중도 {maxPct.toFixed(0)}% — 분산 투자를 고려해보세요
          </Text>
        </View>
      )}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#161B35', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#252A47',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  pctChange: { fontSize: 14, fontWeight: '700' },
});

// ── 로그인 유도 ────────────────────────────────────────────────────
function LoginPrompt({ onLogin }) {
  return (
    <View style={styles.loginPromptBox}>
      <Text style={styles.loginPromptIcon}>🔐</Text>
      <Text style={styles.loginPromptTitle}>로그인이 필요합니다</Text>
      <Text style={styles.loginPromptSub}>
        포트폴리오를 저장하고{'\n'}어디서든 확인하세요
      </Text>
      <TouchableOpacity style={styles.loginBtn} onPress={onLogin}>
        <Text style={styles.loginBtnText}>로그인 / 회원가입</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── AI 액션 뱃지 색상 ──────────────────────────────────────────────
const ACTION_COLOR = {
  '추가매수': '#00FF88',
  '보유':     '#FFB800',
  '일부매도': '#FF8C00',
  '전량매도': '#FF4466',
};

const URGENCY_COLOR = { '즉시': '#FF4466', '1주일내': '#FF8C00', '1개월내': '#FFB800', '관망': '#6B7280' };

// ── 종목 카드 ──────────────────────────────────────────────────────
function HoldingCard({ item, aiItem, onDelete, onPress }) {
  const pnl = (item.currentPrice - item.avg_price) * item.shares;
  const pnlRate = ((item.currentPrice - item.avg_price) / item.avg_price) * 100;
  const isPositive = pnl >= 0;
  const pnlColor = isPositive ? '#00FF88' : '#FF4466';
  const actionColor = aiItem ? (ACTION_COLOR[aiItem.action] || '#6B7280') : null;

  return (
    <TouchableOpacity
      style={[styles.holdingCard, { borderLeftColor: pnlColor }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.holdingHeader}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={styles.holdingName}>{item.stock_name}</Text>
            {aiItem && (
              <View style={[styles.actionBadge, { borderColor: actionColor + '80', backgroundColor: actionColor + '15' }]}>
                <Text style={[styles.actionBadgeText, { color: actionColor }]}>{aiItem.action}</Text>
              </View>
            )}
            {aiItem?.urgency && (
              <View style={[styles.urgencyBadge, { borderColor: URGENCY_COLOR[aiItem.urgency] + '60' }]}>
                <Text style={[styles.urgencyBadgeText, { color: URGENCY_COLOR[aiItem.urgency] }]}>{aiItem.urgency}</Text>
              </View>
            )}
          </View>
          <Text style={styles.holdingCode}>{item.stock_code}  ▶ 상세보기</Text>
        </View>
        <TouchableOpacity onPress={() => onDelete(item.id, item.stock_name)} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>삭제</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.holdingRow}>
        <View style={styles.holdingCol}>
          <Text style={styles.holdingLabel}>현재가</Text>
          <Text style={styles.holdingValue}>
            {item.currentPrice ? `₩${item.currentPrice.toLocaleString()}` : '—'}
          </Text>
        </View>
        <View style={styles.holdingCol}>
          <Text style={styles.holdingLabel}>평균 매입가</Text>
          <Text style={styles.holdingValue}>₩{item.avg_price.toLocaleString()}</Text>
        </View>
        <View style={styles.holdingCol}>
          <Text style={styles.holdingLabel}>보유 수량</Text>
          <Text style={styles.holdingValue}>{item.shares.toLocaleString()}주</Text>
        </View>
      </View>

      <View style={styles.holdingPnlRow}>
        <View style={styles.holdingCol}>
          <Text style={styles.holdingLabel}>평가액</Text>
          <Text style={styles.holdingValue}>
            {item.currentPrice ? `₩${(item.currentPrice * item.shares).toLocaleString()}` : '—'}
          </Text>
        </View>
        <View style={styles.holdingCol}>
          <Text style={styles.holdingLabel}>평가 손익</Text>
          <Text style={[styles.holdingValue, { color: pnlColor }]}>
            {item.currentPrice ? `${isPositive ? '+' : ''}₩${Math.round(pnl).toLocaleString()}` : '—'}
          </Text>
        </View>
        <View style={styles.holdingCol}>
          <Text style={styles.holdingLabel}>수익률</Text>
          <Text style={[styles.holdingValue, { color: pnlColor }]}>
            {item.currentPrice ? `${isPositive ? '+' : ''}${pnlRate.toFixed(2)}%` : '—'}
          </Text>
        </View>
      </View>

      {/* AI 판단 */}
      {aiItem && (
        <View style={styles.aiReasonRow}>
          {(aiItem.targetPct || aiItem.stopPct) && (
            <View style={styles.aiPriceRow}>
              {aiItem.targetPct && (
                <View style={styles.aiPriceTag}>
                  <Text style={styles.aiPriceLabel}>목표</Text>
                  <Text style={[styles.aiPriceVal, { color: '#00FF88' }]}>{aiItem.targetPct}</Text>
                </View>
              )}
              {aiItem.stopPct && (
                <View style={styles.aiPriceTag}>
                  <Text style={styles.aiPriceLabel}>손절</Text>
                  <Text style={[styles.aiPriceVal, { color: '#FF4466' }]}>{aiItem.stopPct}</Text>
                </View>
              )}
            </View>
          )}
          {aiItem.reason ? <Text style={styles.aiReasonText}>▸ {aiItem.reason}</Text> : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── 계좌별 종목 행 (compact 2-line) ───────────────────────────────
function CompactHoldingRow({ item, aiItem, onPress, onDelete, onMove }) {
  const hasPrice  = item.currentPrice != null;
  const perShare  = hasPrice ? item.currentPrice - item.avg_price : null;        // 한 주당 손익
  const totalPnl  = hasPrice ? perShare * item.shares : null;                    // 평가손익
  const pnlRate   = hasPrice ? (perShare / item.avg_price) * 100 : null;         // 수익률
  const isUp      = perShare != null ? perShare >= 0 : null;
  const pnlColor  = isUp == null ? '#8892A4' : isUp ? '#00FF88' : '#FF4466';
  const sign      = isUp ? '+' : '';
  const actionColor = aiItem ? (ACTION_COLOR[aiItem.action] || '#6B7280') : null;

  return (
    <View style={cStyles.card}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {/* 헤더: 종목명 + 코드 / 평가손익 + 수익률 */}
        <View style={cStyles.header}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={cStyles.name}>{item.stock_name}</Text>
              {aiItem && (
                <View style={[styles.actionBadge, { borderColor: (actionColor || '#6B7280') + '80', backgroundColor: (actionColor || '#6B7280') + '15' }]}>
                  <Text style={[styles.actionBadgeText, { color: actionColor || '#6B7280' }]}>{aiItem.action}</Text>
                </View>
              )}
            </View>
            <Text style={cStyles.code}>{item.stock_code}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[cStyles.pnlAmount, { color: pnlColor }]}>
              {hasPrice ? `${sign}₩${Math.round(totalPnl).toLocaleString()}` : '—'}
            </Text>
            {hasPrice && (
              <Text style={[cStyles.pnlRate, { color: pnlColor }]}>
                {sign}{pnlRate.toFixed(2)}% {isUp ? '▲' : '▼'}
              </Text>
            )}
          </View>
        </View>

        {/* 메타 그리드: 보유 · 평단가 · 현재가 · 주당손익 */}
        <View style={cStyles.metaGrid}>
          <View style={cStyles.metaItem}>
            <Text style={cStyles.metaLabel}>보유</Text>
            <Text style={cStyles.metaValue}>{item.shares.toLocaleString()}주</Text>
          </View>
          <View style={cStyles.metaDivider} />
          <View style={cStyles.metaItem}>
            <Text style={cStyles.metaLabel}>평단가</Text>
            <Text style={cStyles.metaValue}>₩{item.avg_price.toLocaleString()}</Text>
          </View>
          <View style={cStyles.metaDivider} />
          <View style={cStyles.metaItem}>
            <Text style={cStyles.metaLabel}>현재가</Text>
            <Text style={cStyles.metaValue}>{hasPrice ? `₩${item.currentPrice.toLocaleString()}` : '—'}</Text>
          </View>
          <View style={cStyles.metaDivider} />
          <View style={cStyles.metaItem}>
            <Text style={cStyles.metaLabel}>주당손익</Text>
            <Text style={[cStyles.metaValue, { color: pnlColor }]}>
              {hasPrice ? `${sign}₩${Math.round(perShare).toLocaleString()}` : '—'}
            </Text>
          </View>
        </View>

        {aiItem?.reason ? <Text style={cStyles.aiReason} numberOfLines={1}>▸ {aiItem.reason}</Text> : null}
      </TouchableOpacity>

      {/* 액션 버튼 */}
      <View style={cStyles.actions}>
        {onMove && (
          <TouchableOpacity onPress={() => onMove(item)} style={cStyles.moveBtn}>
            <Text style={cStyles.moveBtnText}>계좌이동</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => onDelete(item.id, item.stock_name)} style={cStyles.delBtn}>
          <Text style={cStyles.delBtnText}>삭제</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cStyles = StyleSheet.create({
  card: { paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1A2040' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  name: { fontSize: 16.5, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  code: { fontSize: 11, color: '#5B6478', marginTop: 3 },
  pnlAmount: { fontSize: 16, fontWeight: '800' },
  pnlRate: { fontSize: 12.5, fontWeight: '700', marginTop: 2 },
  metaGrid: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0E1226', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 4,
    borderWidth: 1, borderColor: '#1A2040',
  },
  metaItem: { flex: 1, alignItems: 'center' },
  metaDivider: { width: 1, alignSelf: 'stretch', backgroundColor: '#1A2040', marginVertical: 2 },
  metaLabel: { fontSize: 10, color: '#5B6478', marginBottom: 4, fontWeight: '600' },
  metaValue: { fontSize: 13, fontWeight: '700', color: '#D8DEF0' },
  aiReason: { fontSize: 11.5, color: '#7C89A6', marginTop: 9 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 11 },
  moveBtn: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: '#2E3A5C', backgroundColor: '#1A2138',
  },
  moveBtnText: { fontSize: 11.5, color: '#8FA8D8', fontWeight: '600' },
  delBtn: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: '#3A2230', backgroundColor: '#241620',
  },
  delBtnText: { fontSize: 11.5, color: '#CC7788', fontWeight: '600' },
});

// ── 계좌 탭바 ────────────────────────────────────────────────────────
function AccountTabBar({ accounts, selectedId, onSelect, onAdd, onLongPress }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={tabStyles.scroll}
      contentContainerStyle={tabStyles.content}
    >
      <TouchableOpacity
        style={[tabStyles.pill, selectedId === 'all' && tabStyles.pillActive]}
        onPress={() => onSelect('all')}
      >
        <Text style={[tabStyles.pillText, selectedId === 'all' && tabStyles.pillTextActive]}>전체</Text>
      </TouchableOpacity>
      {accounts.map(acc => (
        <TouchableOpacity
          key={acc.id}
          style={[tabStyles.pill, selectedId === acc.id && { borderColor: acc.color + '80', backgroundColor: acc.color + '18' }]}
          onPress={() => onSelect(acc.id)}
          onLongPress={() => onLongPress && onLongPress(acc)}
        >
          <View style={[tabStyles.dot, { backgroundColor: acc.color }]} />
          <Text style={[tabStyles.pillText, selectedId === acc.id && { color: acc.color }]}>{acc.alias}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={[tabStyles.pill, tabStyles.pillAdd]} onPress={onAdd}>
        <Text style={tabStyles.addText}>+ 계좌</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const tabStyles = StyleSheet.create({
  scroll: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: '#1E2340' },
  content: { paddingHorizontal: 16, paddingVertical: 9, gap: 8, flexDirection: 'row', alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#252A47',
    backgroundColor: '#12172E',
  },
  pillActive: { backgroundColor: '#00D9FF20', borderColor: '#00D9FF60' },
  pillAdd: { borderStyle: 'dashed' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 13, color: '#8892A4', fontWeight: '600' },
  pillTextActive: { color: '#00D9FF' },
  addText: { fontSize: 13, color: '#4A5568', fontWeight: '600' },
});

// ── 계좌 섹션 카드 ────────────────────────────────────────────────────
function AccountSection({ account, holdings, diagnosis, navigation, onDelete, onMove }) {
  const buy   = holdings.reduce((s, h) => s + h.avg_price * h.shares, 0);
  const eval_ = holdings.reduce((s, h) => s + (h.currentPrice ?? h.avg_price) * h.shares, 0);
  const pnl   = eval_ - buy;
  const rate  = buy > 0 ? (pnl / buy) * 100 : 0;
  const isUp  = pnl >= 0;
  const pnlColor = isUp ? '#00FF88' : '#FF4466';
  const acColor  = account?.color || '#6B7280';

  return (
    <View style={acStyles.section}>
      <View style={[acStyles.header, { borderLeftColor: acColor }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[acStyles.dot, { backgroundColor: acColor }]} />
            <Text style={acStyles.alias}>{account?.alias || '미분류'}</Text>
            {account?.brokerage ? <Text style={acStyles.brokerage}>· {account.brokerage}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 5 }}>
            <Text style={acStyles.evalText}>
              평가액 <Text style={acStyles.evalVal}>₩{Math.round(eval_).toLocaleString()}</Text>
            </Text>
            <Text style={[acStyles.pnlText, { color: pnlColor }]}>
              {isUp ? '+' : ''}₩{Math.round(pnl).toLocaleString()}
            </Text>
          </View>
        </View>
        <Text style={[acStyles.rate, { color: pnlColor }]}>
          {isUp ? '+' : ''}{rate.toFixed(2)}%
        </Text>
      </View>
      {holdings.length === 0 ? (
        <Text style={acStyles.empty}>보유 종목이 없습니다</Text>
      ) : (
        holdings.map(item => {
          const baseCode = item.stock_code.split('.')[0];
          const aiItem = diagnosis?.items?.find(d => d.code === baseCode || d.code === item.stock_code);
          const symbol = item.stock_code.includes('.') ? item.stock_code : item.stock_code + '.KS';
          return (
            <CompactHoldingRow
              key={item.id}
              item={item}
              aiItem={aiItem}
              onDelete={onDelete}
              onMove={onMove}
              onPress={() => navigation.navigate('StockDetail', { symbol, name: item.stock_name })}
            />
          );
        })
      )}
    </View>
  );
}

const acStyles = StyleSheet.create({
  section: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#12172E', borderRadius: 16,
    borderWidth: 1, borderColor: '#1E2A42', overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderLeftWidth: 4,
    backgroundColor: '#161B35',
    borderBottomWidth: 1, borderBottomColor: '#1E2A42',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  alias: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  brokerage: { fontSize: 12, color: '#6B7280' },
  evalText: { fontSize: 12, color: '#6B7280' },
  evalVal: { color: '#D0D8E8', fontWeight: '600' },
  pnlText: { fontSize: 12, fontWeight: '600' },
  rate: { fontSize: 20, fontWeight: '800' },
  empty: { color: '#4A5568', fontSize: 13, textAlign: 'center', paddingVertical: 18 },
});

// ── 계좌 생성 모달 ────────────────────────────────────────────────────
function CreateAccountModal({ visible, onClose, onCreate }) {
  const [brokerage, setBrokerage] = useState(BROKER_OPTIONS[0]);
  const [alias, setAlias] = useState('');
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!alias.trim()) { Alert.alert('입력 오류', '계좌 별칭을 입력해주세요.'); return; }
    setLoading(true);
    try {
      await onCreate(brokerage, alias.trim(), color);
      setBrokerage(BROKER_OPTIONS[0]); setAlias(''); setColor(ACCOUNT_COLORS[0]);
      onClose();
    } catch (e) {
      Alert.alert('오류', '계좌 생성 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>새 계좌 추가</Text>

          <Text style={[styles.inputLabel, { marginBottom: 8 }]}>색상</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 2 }}>
              {ACCOUNT_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setColor(c)}
                  style={[{ width: 34, height: 34, borderRadius: 17, backgroundColor: c },
                    color === c && { borderWidth: 3, borderColor: '#FFFFFF' }]}
                />
              ))}
            </View>
          </ScrollView>

          <Text style={[styles.inputLabel, { marginBottom: 8 }]}>증권사</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {BROKER_OPTIONS.map(b => (
                <TouchableOpacity
                  key={b}
                  style={[addStyles.optionBtn, { paddingHorizontal: 12, paddingVertical: 8, marginBottom: 0 },
                    brokerage === b && { borderColor: color + '80', backgroundColor: color + '15' }]}
                  onPress={() => setBrokerage(b)}
                >
                  <Text style={[addStyles.optionTitle, { fontSize: 13, marginBottom: 0 }, brokerage === b && { color }]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>계좌 별칭</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="예: CMA, 주식, 연금저축"
              placeholderTextColor="#4A5568"
              value={alias}
              onChangeText={setAlias}
            />
          </View>

          {alias.trim() ? (
            <View style={[acStyles.header, { borderLeftColor: color, borderRadius: 10, marginBottom: 16 }]}>
              <View style={[acStyles.dot, { backgroundColor: color, marginRight: 8 }]} />
              <Text style={acStyles.alias}>{alias.trim()}</Text>
              <Text style={[acStyles.brokerage, { marginLeft: 6 }]}>· {brokerage}</Text>
            </View>
          ) : null}

          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={handleCreate} disabled={loading}>
              {loading ? <ActivityIndicator color="#0A0E27" /> : <Text style={styles.addBtnText}>계좌 만들기</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── 계좌 이동 선택 시트 ──────────────────────────────────────────────
function AccountPickerModal({ visible, holding, accounts, onClose, onSelect }) {
  const currentId = holding?.account_id ?? null;
  const options = [{ id: null, alias: '미분류', brokerage: '', color: '#6B7280' }, ...accounts];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>계좌 이동</Text>
          {holding ? (
            <Text style={{ fontSize: 13, color: '#8892A4', marginBottom: 14 }}>
              "{holding.stock_name}"을(를) 옮길 계좌를 선택하세요
            </Text>
          ) : null}

          {options.map(opt => {
            const isCurrent = (opt.id ?? null) === currentId;
            return (
              <TouchableOpacity
                key={opt.id ?? 'unassigned'}
                style={[pickStyles.row, isCurrent && { borderColor: opt.color + '80', backgroundColor: opt.color + '15' }]}
                onPress={() => onSelect(opt.id)}
                disabled={isCurrent}
                activeOpacity={0.8}
              >
                <View style={[pickStyles.dot, { backgroundColor: opt.color }]} />
                <Text style={[pickStyles.alias, isCurrent && { color: opt.color }]}>{opt.alias}</Text>
                {opt.brokerage ? <Text style={pickStyles.broker}>· {opt.brokerage}</Text> : null}
                {isCurrent ? <Text style={pickStyles.current}>현재</Text> : null}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity style={[styles.cancelBtn, { marginTop: 8 }]} onPress={onClose}>
            <Text style={styles.cancelBtnText}>취소</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const pickStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8,
    borderRadius: 12, borderWidth: 1, borderColor: '#252A47', backgroundColor: '#12172E',
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  alias: { fontSize: 15, fontWeight: '700', color: '#E2E8F0' },
  broker: { fontSize: 12, color: '#6B7280' },
  current: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginLeft: 'auto' },
});

// ── 붙여넣기 텍스트 파서 ────────────────────────────────────────────
// 휴대폰 OCR(텍스트 인식)로 변환한 증권사 보유종목 텍스트를 유연하게 파싱.
// 형식이 제각각이라 "최선 추측" 후, 확인 화면에서 사용자가 직접 수정하는 것을 전제로 함.
const NOISE_RE = /(보유종목|평가금액|평가손익|수익률|평균단가|평균매입|매입가|현재가|보유수량|예수금|출금가능|총\s*평가|총\s*매입|합계|계좌|구분|종목명|수량|단가|주문|체결|미체결|관심|D\+|원화|외화)/;

const parsePastedText = (text) => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  let cur = null;

  const flush = () => {
    if (!cur || !cur.name) { cur = null; return; }
    const nums = cur.nums;
    // 수량: "주" 태그가 붙은 숫자 우선
    let shares = cur.sharesTagged;
    // 단가: 100~5,000,000 범위의 가격성 숫자
    const prices = nums.filter(n => n >= 100 && n <= 5000000 && Number.isFinite(n));
    if (shares == null) {
      const smalls = nums.filter(n => n >= 1 && n <= 100000 && Number.isInteger(n));
      if (smalls.length) shares = Math.min(...smalls);
    }
    let avgPrice = 0;
    if (prices.length) {
      const sorted = prices.slice().sort((a, b) => a - b);
      // 가격이 여러 개면 중앙값(보통 평단/현재가 사이) 추정
      avgPrice = sorted[Math.floor(sorted.length / 2)] || sorted[0];
    }
    items.push({ code: cur.code || '', name: cur.name, shares: shares || 0, avgPrice: avgPrice || 0 });
    cur = null;
  };

  for (const line of lines) {
    const codeMatch = line.match(/\b(\d{6})\b/);
    const nameChars = line.replace(/[\d.,%+\-주원\s()]/g, '');
    const looksName = /[가-힣]{2,}|[A-Za-z]{2,}/.test(line) && nameChars.length >= 2 && !NOISE_RE.test(line);

    if (looksName) {
      flush();
      // 종목명: 숫자/기호 떼고 한글·영문·공백만
      const name = (line.match(/[가-힣A-Za-z][가-힣A-Za-z0-9&\s]*[가-힣A-Za-z0-9]/) || [line])[0].trim();
      cur = { name, nums: [], code: codeMatch ? codeMatch[1] : '', sharesTagged: null };
    }
    if (!cur) continue;

    const sharesM = line.match(/(\d[\d,]*)\s*주/);
    if (sharesM) cur.sharesTagged = parseInt(sharesM[1].replace(/,/g, ''));

    const tokens = line.match(/\d[\d,]*(?:\.\d+)?/g) || [];
    for (const t of tokens) {
      if (t === cur.code) continue;
      const n = parseFloat(t.replace(/,/g, ''));
      if (!isNaN(n)) cur.nums.push(n);
    }
  }
  flush();
  return items;
};

// ── CSV 파싱 유틸 ──────────────────────────────────────────────────
const parsePortfolioCSV = (text) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const results = [];

  for (const line of lines) {
    // 탭·쉼표 구분자 모두 지원
    const cols = line.split(/\t|,/).map(c => c.trim().replace(/"/g, ''));

    // 종목코드 패턴: 6자리 숫자
    const codeIdx = cols.findIndex(c => /^\d{6}$/.test(c));
    if (codeIdx === -1) continue;

    const code = cols[codeIdx];

    // 종목명: 코드 앞뒤 컬럼 중 한글 포함된 것
    let name = '';
    for (let i = Math.max(0, codeIdx - 2); i <= Math.min(cols.length - 1, codeIdx + 2); i++) {
      if (i !== codeIdx && /[가-힣]/.test(cols[i]) && cols[i].length >= 2) {
        name = cols[i]; break;
      }
    }
    if (!name) continue;

    // 수량·단가: 숫자가 큰 순서대로 — 단가가 수량보다 보통 큼
    const nums = cols
      .filter((_, i) => i !== codeIdx)
      .map(c => parseInt(c.replace(/,/g, '')))
      .filter(n => !isNaN(n) && n > 0)
      .sort((a, b) => b - a);

    if (nums.length < 2) continue;
    const avgPrice = nums[0]; // 가장 큰 수 = 단가
    const shares   = nums[1]; // 두 번째   = 수량

    // 단가 범위 검증 (100원 ~ 5,000,000원), 수량 범위 (1 ~ 100,000주)
    if (avgPrice < 100 || avgPrice > 5000000) continue;
    if (shares < 1 || shares > 100000) continue;

    results.push({ code, name, shares, avgPrice });
  }

  return results;
};

// ── 종목 추가 모달 ─────────────────────────────────────────────────
function AddHoldingModal({ visible, onClose, onAdd, accounts = [], defaultAccountId = null, onCreateAccount }) {
  const [mode, setMode] = useState(null); // null=선택화면 | 'manual' | 'csv' | 'image'

  // 직접입력 state
  const [stockCode, setStockCode] = useState('');
  const [stockName, setStockName] = useState('');
  const [shares, setShares] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [loading, setLoading] = useState(false);

  // CSV state
  const [csvItems, setCsvItems] = useState([]);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [selected, setSelected] = useState({});

  // 텍스트 붙여넣기 state
  const [pasteText, setPasteText] = useState('');
  const [pasteRows, setPasteRows] = useState([]); // [{_id, name, code, shares, avgPrice, include}]
  const [pasteBusy, setPasteBusy] = useState(false);

  // 계좌 선택 state
  const [targetAccountId, setTargetAccountId] = useState(null);

  useEffect(() => {
    if (visible) setTargetAccountId(defaultAccountId || null);
  }, [visible, defaultAccountId]);

  const reset = () => {
    setMode(null);
    setStockCode(''); setStockName(''); setShares(''); setAvgPrice('');
    setCsvItems([]); setCsvError(''); setSelected({});
    setPasteText(''); setPasteRows([]);
    setTargetAccountId(null);
  };

  const handleClose = () => { reset(); onClose(); };

  // ── 직접입력 ──
  const handleManualAdd = async () => {
    if (!stockCode.trim() || !stockName.trim() || !shares.trim() || !avgPrice.trim()) {
      Alert.alert('입력 오류', '모든 항목을 입력해주세요.');
      return;
    }
    const sharesNum = parseInt(shares.replace(/,/g, ''));
    const priceNum  = parseInt(avgPrice.replace(/,/g, ''));
    if (isNaN(sharesNum) || sharesNum <= 0) { Alert.alert('입력 오류', '수량을 확인해주세요.'); return; }
    if (isNaN(priceNum)  || priceNum  <= 0) { Alert.alert('입력 오류', '평균 매입가를 확인해주세요.'); return; }
    setLoading(true);
    try {
      await onAdd(stockCode.trim(), stockName.trim(), sharesNum, priceNum, targetAccountId);
      reset(); onClose();
    } catch (e) {
      Alert.alert('오류', e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── CSV 파일 선택 ──
  const handlePickCSV = async () => {
    setCsvError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'application/vnd.ms-excel',
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      setCsvLoading(true);
      let content;
      if (Platform.OS === 'web') {
        const file = result.assets[0].file;
        content = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsText(file, 'utf-8');
        });
      } else {
        const fileUri = result.assets[0].uri;
        content = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
      }
      const parsed = parsePortfolioCSV(content);

      if (parsed.length === 0) {
        setCsvError('인식된 종목이 없습니다.\n종목코드(6자리), 종목명, 수량, 평균매입가 컬럼이 포함된 CSV/TXT 파일을 사용하세요.');
      } else {
        setCsvItems(parsed);
        // 기본 전체 선택
        const sel = {};
        parsed.forEach(p => { sel[p.code] = true; });
        setSelected(sel);
      }
    } catch (e) {
      setCsvError('파일을 읽을 수 없습니다: ' + e.message);
    } finally {
      setCsvLoading(false);
    }
  };

  // ── CSV 선택 항목 일괄 추가 ──
  const handleCSVAdd = async () => {
    const toAdd = csvItems.filter(item => selected[item.code]);
    if (toAdd.length === 0) { Alert.alert('선택 없음', '추가할 종목을 선택해주세요.'); return; }
    setLoading(true);
    let added = 0;
    for (const item of toAdd) {
      try { await onAdd(item.code, item.name, item.shares, item.avgPrice, targetAccountId); added++; }
      catch {}
    }
    setLoading(false);
    Alert.alert('완료', `${added}개 종목이 추가되었습니다.`);
    reset(); onClose();
  };

  // ── 붙여넣기: 텍스트 분석 ──
  const handleParsePaste = () => {
    const parsed = parsePastedText(pasteText);
    if (parsed.length === 0) {
      Alert.alert('인식 실패', '종목을 찾지 못했습니다.\n종목명이 한 줄에 하나씩 들어가도록 붙여넣어 보세요.');
      return;
    }
    setPasteRows(parsed.map((r, i) => ({ ...r, _id: i, include: true })));
  };

  // ── 붙여넣기: 행 편집 ──
  const editRow = (id, field, value) => {
    setPasteRows(prev => prev.map(r => r._id === id ? { ...r, [field]: value } : r));
  };
  const toggleRow = (id) => {
    setPasteRows(prev => prev.map(r => r._id === id ? { ...r, include: !r.include } : r));
  };
  const removeRow = (id) => {
    setPasteRows(prev => prev.filter(r => r._id !== id));
  };

  // ── 붙여넣기: 최종 추가 (코드 없으면 검색으로 해결) ──
  const handlePasteAdd = async () => {
    const rows = pasteRows.filter(r => r.include);
    if (rows.length === 0) { Alert.alert('선택 없음', '추가할 종목을 선택해주세요.'); return; }
    setPasteBusy(true);
    let added = 0;
    const failed = [];
    for (const r of rows) {
      const name = (r.name || '').trim();
      const sharesNum = parseInt(String(r.shares).replace(/,/g, '')) || 0;
      const priceNum = parseInt(String(r.avgPrice).replace(/,/g, '')) || 0;
      if (!name || sharesNum <= 0 || priceNum <= 0) { failed.push(name || '(이름없음)'); continue; }

      let code = (r.code || '').trim();
      if (!/^\d{6}$/.test(code)) {
        try {
          const results = await searchStocks(name);
          const hit = results?.find(x => /^\d{6}$/.test(x.code)) || results?.[0];
          if (hit?.code && /^\d{6}$/.test(hit.code)) code = hit.code;
        } catch {}
      }
      if (!/^\d{6}$/.test(code)) { failed.push(name); continue; }

      try { await onAdd(code, name, sharesNum, priceNum, targetAccountId); added++; }
      catch { failed.push(name); }
    }
    setPasteBusy(false);
    const msg = `${added}개 종목이 추가되었습니다.` +
      (failed.length ? `\n\n실패 ${failed.length}개: ${failed.join(', ')}\n(종목명을 정확히 고쳐 다시 시도하세요)` : '');
    Alert.alert('완료', msg);
    if (added > 0) { reset(); onClose(); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={handleClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />

          {/* ── 선택 화면 ── */}
          {!mode && (
            <>
              <Text style={styles.modalTitle}>종목 추가</Text>

              {/* 계좌 선택 */}
              {accounts.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.inputLabel, { marginBottom: 8 }]}>어느 계좌에 추가할까요?</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[tabStyles.pill, targetAccountId === null && tabStyles.pillActive]}
                        onPress={() => setTargetAccountId(null)}
                      >
                        <Text style={[tabStyles.pillText, targetAccountId === null && tabStyles.pillTextActive]}>미분류</Text>
                      </TouchableOpacity>
                      {accounts.map(acc => (
                        <TouchableOpacity
                          key={acc.id}
                          style={[tabStyles.pill, targetAccountId === acc.id && { borderColor: acc.color + '80', backgroundColor: acc.color + '18' }]}
                          onPress={() => setTargetAccountId(acc.id)}
                        >
                          <View style={[tabStyles.dot, { backgroundColor: acc.color }]} />
                          <Text style={[tabStyles.pillText, targetAccountId === acc.id && { color: acc.color }]}>{acc.alias}</Text>
                        </TouchableOpacity>
                      ))}
                      {onCreateAccount && (
                        <TouchableOpacity
                          style={[tabStyles.pill, tabStyles.pillAdd]}
                          onPress={async () => {
                            // 인라인 계좌 생성을 위해 닫고 계좌 추가 탭 열기는 복잡하므로 알림으로 안내
                            Alert.alert('계좌 추가', '종목 추가를 닫고 포트폴리오 탭에서 "+ 계좌" 버튼을 눌러 계좌를 먼저 만들어주세요.');
                          }}
                        >
                          <Text style={tabStyles.addText}>+ 새 계좌</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </ScrollView>
                </View>
              )}

              <Text style={styles.modalSubtitle}>추가 방법을 선택하세요</Text>

              <TouchableOpacity style={addStyles.optionBtn} onPress={() => setMode('manual')}>
                <Text style={addStyles.optionIcon}>✏️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={addStyles.optionTitle}>직접 입력</Text>
                  <Text style={addStyles.optionDesc}>종목코드, 수량, 평균매입가를 직접 입력</Text>
                </View>
                <Text style={addStyles.optionArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[addStyles.optionBtn, { borderColor: '#A78BFA40', marginTop: 10 }]} onPress={() => setMode('paste')}>
                <Text style={addStyles.optionIcon}>📋</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[addStyles.optionTitle, { color: '#A78BFA' }]}>텍스트 붙여넣기 (추천)</Text>
                  <Text style={addStyles.optionDesc}>증권사 화면을 휴대폰으로 텍스트 인식 → 복사 → 붙여넣기</Text>
                </View>
                <Text style={addStyles.optionArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[addStyles.optionBtn, { borderColor: '#00D97E40', marginTop: 10 }]} onPress={() => setMode('csv')}>
                <Text style={addStyles.optionIcon}>📂</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[addStyles.optionTitle, { color: '#00D97E' }]}>파일로 가져오기</Text>
                  <Text style={addStyles.optionDesc}>증권사 보유종목 CSV/엑셀 파일 업로드</Text>
                </View>
                <Text style={addStyles.optionArrow}>›</Text>
              </TouchableOpacity>

              <View style={addStyles.hintBox}>
                <Text style={addStyles.hintText}>💡 텍스트 붙여넣기 방법</Text>
                <Text style={addStyles.hintDesc}>
                  ① 증권사 앱 보유종목 화면을 캡처{'\n'}
                  ② 사진 앱에서 사진 열고 텍스트 길게 눌러 전체 선택·복사{'\n'}
                  {'   '}(아이폰: 텍스트 인식 / 안드로이드: 구글 렌즈){'\n'}
                  ③ 여기 "텍스트 붙여넣기"에 붙여넣기
                </Text>
              </View>

              <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelBtnText}>닫기</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── 직접 입력 ── */}
          {mode === 'manual' && (
            <>
              <TouchableOpacity onPress={() => setMode(null)} style={addStyles.backBtn}>
                <Text style={addStyles.backText}>‹ 뒤로</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>직접 입력</Text>
              {(() => {
                const acc = accounts.find(a => a.id === targetAccountId);
                return acc ? (
                  <View style={[tabStyles.pill, { alignSelf: 'flex-start', marginBottom: 12, borderColor: acc.color + '80', backgroundColor: acc.color + '18' }]}>
                    <View style={[tabStyles.dot, { backgroundColor: acc.color }]} />
                    <Text style={[tabStyles.pillText, { color: acc.color }]}>{acc.alias}</Text>
                  </View>
                ) : null;
              })()}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>종목코드</Text>
                <TextInput style={styles.modalInput} placeholder="예: 005930"
                  placeholderTextColor="#4A5568" value={stockCode}
                  onChangeText={setStockCode} keyboardType="number-pad" maxLength={6} />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>종목명</Text>
                <TextInput style={styles.modalInput} placeholder="예: 삼성전자"
                  placeholderTextColor="#4A5568" value={stockName} onChangeText={setStockName} />
              </View>
              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.inputLabel}>수량 (주)</Text>
                  <TextInput style={styles.modalInput} placeholder="10"
                    placeholderTextColor="#4A5568" value={shares}
                    onChangeText={setShares} keyboardType="numeric" />
                </View>
                <View style={[styles.inputGroup, { flex: 1.4 }]}>
                  <Text style={styles.inputLabel}>평균 매입가 (원)</Text>
                  <TextInput style={styles.modalInput} placeholder="75000"
                    placeholderTextColor="#4A5568" value={avgPrice}
                    onChangeText={setAvgPrice} keyboardType="numeric" />
                </View>
              </View>
              {shares && avgPrice && !isNaN(parseInt(shares)) && !isNaN(parseInt(avgPrice)) && (
                <View style={styles.previewBox}>
                  <Text style={styles.previewLabel}>예상 매입금액</Text>
                  <Text style={styles.previewValue}>₩{(parseInt(shares) * parseInt(avgPrice)).toLocaleString()}</Text>
                </View>
              )}
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode(null)}>
                  <Text style={styles.cancelBtnText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addBtn} onPress={handleManualAdd} disabled={loading}>
                  {loading ? <ActivityIndicator color="#0A0E27" /> : <Text style={styles.addBtnText}>추가하기</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── 텍스트 붙여넣기 ── */}
          {mode === 'paste' && (
            <>
              <TouchableOpacity onPress={() => { setMode(null); setPasteText(''); setPasteRows([]); }} style={addStyles.backBtn}>
                <Text style={addStyles.backText}>‹ 뒤로</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>텍스트 붙여넣기</Text>

              {pasteRows.length === 0 ? (
                <>
                  <Text style={addStyles.pasteGuide}>
                    증권사 보유종목 화면을 휴대폰으로 텍스트 인식(아이폰)·구글렌즈(안드로이드)한 뒤,
                    복사한 내용을 아래에 붙여넣고 "분석"을 누르세요.
                  </Text>
                  <TextInput
                    style={addStyles.pasteInput}
                    placeholder={"예시)\n삼성전자 100주 72,000\nSK하이닉스 50주 130,000\n..."}
                    placeholderTextColor="#4A5568"
                    value={pasteText}
                    onChangeText={setPasteText}
                    multiline
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    style={[styles.addBtn, { marginTop: 12, backgroundColor: '#A78BFA' }]}
                    onPress={handleParsePaste}
                  >
                    <Text style={styles.addBtnText}>분석하기</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={addStyles.parsedCount}>
                    {pasteRows.length}개 인식됨 — 틀린 부분은 직접 고치세요
                  </Text>
                  <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                    {pasteRows.map(row => (
                      <View key={row._id} style={[addStyles.pasteRow, !row.include && { opacity: 0.4 }]}>
                        <TouchableOpacity onPress={() => toggleRow(row._id)} style={[addStyles.checkbox, row.include && addStyles.checkboxOn]}>
                          {row.include && <Text style={addStyles.checkmark}>✓</Text>}
                        </TouchableOpacity>
                        <View style={{ flex: 1, gap: 6 }}>
                          <TextInput
                            style={addStyles.pasteCellName}
                            value={row.name}
                            onChangeText={t => editRow(row._id, 'name', t)}
                            placeholder="종목명"
                            placeholderTextColor="#4A5568"
                          />
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TextInput
                              style={addStyles.pasteCellNum}
                              value={String(row.shares || '')}
                              onChangeText={t => editRow(row._id, 'shares', t.replace(/[^0-9]/g, ''))}
                              placeholder="수량"
                              placeholderTextColor="#4A5568"
                              keyboardType="numeric"
                            />
                            <TextInput
                              style={addStyles.pasteCellNum}
                              value={String(row.avgPrice || '')}
                              onChangeText={t => editRow(row._id, 'avgPrice', t.replace(/[^0-9]/g, ''))}
                              placeholder="평단가"
                              placeholderTextColor="#4A5568"
                              keyboardType="numeric"
                            />
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => removeRow(row._id)} style={addStyles.pasteDel}>
                          <Text style={{ color: '#FF4466', fontSize: 18 }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                  <View style={styles.modalBtnRow}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setPasteRows([])}>
                      <Text style={styles.cancelBtnText}>다시</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.addBtn} onPress={handlePasteAdd} disabled={pasteBusy}>
                      {pasteBusy
                        ? <ActivityIndicator color="#0A0E27" />
                        : <Text style={styles.addBtnText}>
                            {pasteRows.filter(r => r.include).length}개 추가
                          </Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}

          {/* ── CSV 가져오기 ── */}
          {mode === 'csv' && (
            <>
              <TouchableOpacity onPress={() => { setMode(null); setCsvItems([]); setCsvError(''); }} style={addStyles.backBtn}>
                <Text style={addStyles.backText}>‹ 뒤로</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>파일로 가져오기</Text>

              {csvItems.length === 0 ? (
                <>
                  <View style={addStyles.uploadArea}>
                    <Text style={addStyles.uploadIcon}>📂</Text>
                    <Text style={addStyles.uploadTitle}>CSV / 텍스트 파일 선택</Text>
                    <Text style={addStyles.uploadDesc}>
                      증권사 앱에서 보유종목을 내보낸 파일을 선택하세요{'\n'}
                      (CSV, TXT, XLS 형식 지원)
                    </Text>
                  </View>
                  {csvError ? <Text style={addStyles.csvError}>{csvError}</Text> : null}
                  <TouchableOpacity
                    style={[styles.addBtn, { marginTop: 8 }]}
                    onPress={handlePickCSV}
                    disabled={csvLoading}
                  >
                    {csvLoading
                      ? <ActivityIndicator color="#0A0E27" />
                      : <Text style={styles.addBtnText}>파일 선택하기</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={addStyles.parsedCount}>{csvItems.length}개 종목 인식됨 — 추가할 종목을 선택하세요</Text>
                  <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                    {csvItems.map(item => (
                      <TouchableOpacity
                        key={item.code}
                        style={[addStyles.csvRow, selected[item.code] && addStyles.csvRowSelected]}
                        onPress={() => setSelected(prev => ({ ...prev, [item.code]: !prev[item.code] }))}
                      >
                        <View style={[addStyles.checkbox, selected[item.code] && addStyles.checkboxOn]}>
                          {selected[item.code] && <Text style={addStyles.checkmark}>✓</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={addStyles.csvName}>{item.name}</Text>
                          <Text style={addStyles.csvCode}>{item.code}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={addStyles.csvShares}>{item.shares}주</Text>
                          <Text style={addStyles.csvPrice}>₩{item.avgPrice.toLocaleString()}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View style={styles.modalBtnRow}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setCsvItems([])}>
                      <Text style={styles.cancelBtnText}>다시 선택</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.addBtn} onPress={handleCSVAdd} disabled={loading}>
                      {loading
                        ? <ActivityIndicator color="#0A0E27" />
                        : <Text style={styles.addBtnText}>
                            {Object.values(selected).filter(Boolean).length}개 추가
                          </Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const addStyles = StyleSheet.create({
  backBtn: { marginBottom: 12 },
  backText: { color: '#A78BFA', fontSize: 15, fontWeight: '600' },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#0A0E27', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#252A47',
  },
  optionIcon: { fontSize: 26 },
  optionTitle: { fontSize: 15, color: '#FFFFFF', fontWeight: '700', marginBottom: 3 },
  optionDesc: { fontSize: 12, color: '#6B7280' },
  optionArrow: { color: '#4A5568', fontSize: 22 },
  hintBox: {
    backgroundColor: '#0A0E27', borderRadius: 12, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#252A47',
  },
  hintText: { color: '#FFB800', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  hintDesc: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
  uploadArea: {
    alignItems: 'center', paddingVertical: 28,
    borderWidth: 1, borderColor: '#252A47', borderRadius: 14,
    borderStyle: 'dashed', marginBottom: 14,
  },
  uploadIcon: { fontSize: 42, marginBottom: 10 },
  uploadTitle: { fontSize: 15, color: '#FFFFFF', fontWeight: '700', marginBottom: 6 },
  uploadDesc: { fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 18 },
  csvError: { color: '#FF4466', fontSize: 12, marginBottom: 10, lineHeight: 18 },
  parsedCount: { fontSize: 13, color: '#00D97E', fontWeight: '600', marginBottom: 10 },
  csvRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 10, marginBottom: 8,
    backgroundColor: '#0A0E27', borderWidth: 1, borderColor: '#252A47',
  },
  csvRowSelected: { borderColor: '#00D97E60', backgroundColor: '#00D97E08' },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: '#4A5568',
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxOn: { backgroundColor: '#00D97E', borderColor: '#00D97E' },
  checkmark: { color: '#000', fontWeight: 'bold', fontSize: 13 },
  csvName: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
  csvCode: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  csvShares: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  csvPrice: { fontSize: 11, color: '#6B7280', marginTop: 2 },

  pasteGuide: { fontSize: 12, color: '#8892A4', lineHeight: 18, marginBottom: 12 },
  pasteInput: {
    minHeight: 160, maxHeight: 240,
    backgroundColor: '#0A0E27', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#252A47',
    color: '#FFFFFF', fontSize: 14, lineHeight: 20,
  },
  pasteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 10, marginBottom: 8,
    backgroundColor: '#0A0E27', borderWidth: 1, borderColor: '#252A47',
  },
  pasteCellName: {
    backgroundColor: '#12172E', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    color: '#FFFFFF', fontSize: 14, fontWeight: '600',
    borderWidth: 1, borderColor: '#252A47',
  },
  pasteCellNum: {
    flex: 1, backgroundColor: '#12172E', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    color: '#FFFFFF', fontSize: 13,
    borderWidth: 1, borderColor: '#252A47',
  },
  pasteDel: { padding: 4 },
});

// ── AI 진단 카드 ───────────────────────────────────────────────────
function AIDiagnosisCard({ diagnosis, loading, onRequest }) {
  const riskColor = { '낮음': '#00FF88', '중간': '#FFB800', '높음': '#FF4466' };
  const color = riskColor[diagnosis?.overallRisk] || '#9D4EDD';

  if (!diagnosis && !loading) {
    return (
      <TouchableOpacity style={styles.aiDiagnosisBtn} onPress={onRequest} activeOpacity={0.8}>
        <Text style={styles.aiDiagnosisBtnIcon}>🤖</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.aiDiagnosisBtnTitle}>AI 포트폴리오 진단</Text>
          <Text style={styles.aiDiagnosisBtnSub}>보유 종목 전체를 AI가 분석합니다</Text>
        </View>
        <Text style={styles.aiDiagnosisBtnArrow}>▶</Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.aiDiagnosisCard}>
        <ActivityIndicator size="small" color="#9D4EDD" />
        <Text style={[styles.aiDiagnosisBtnSub, { marginTop: 10, textAlign: 'center' }]}>AI 진단 중입니다...</Text>
      </View>
    );
  }

  return (
    <View style={styles.aiDiagnosisCard}>
      {/* 헤더 */}
      <View style={styles.aiDiagnosisHeader}>
        <Text style={styles.aiDiagnosisTitle}>AI 포트폴리오 진단</Text>
        <View style={[styles.riskBadge, { borderColor: color + '80', backgroundColor: color + '15' }]}>
          <Text style={[styles.riskBadgeText, { color }]}>리스크 {diagnosis.overallRisk}</Text>
        </View>
      </View>

      {/* 종합 코멘트 */}
      <Text style={styles.aiSummaryText}>"{diagnosis.summary}"</Text>

      {/* 매크로 영향 */}
      {diagnosis.macroImpact ? (
        <View style={styles.macroImpactRow}>
          <Text style={styles.macroImpactLabel}>🌍 매크로</Text>
          <Text style={styles.macroImpactText}>{diagnosis.macroImpact}</Text>
        </View>
      ) : null}

      {/* 주목 종목 */}
      {diagnosis.attention?.length > 0 ? (
        <View style={styles.attentionRow}>
          <Text style={styles.attentionLabel}>⚡ 주목</Text>
          {diagnosis.attention.map((name, i) => (
            <View key={i} style={styles.attentionTag}>
              <Text style={styles.attentionTagText}>{name}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* 재진단 버튼 */}
      <TouchableOpacity style={styles.reDiagnoseBtn} onPress={onRequest}>
        <Text style={styles.reDiagnoseBtnText}>다시 진단</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── 메인 화면 ──────────────────────────────────────────────────────
export default function PortfolioScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [holdings, setHoldings] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null); // 계좌 이동할 종목
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [pnlHistory, setPnlHistory] = useState([]);
  const [chatVisible, setChatVisible] = useState(false);

  const loadPortfolio = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [data, accs] = await Promise.all([getHoldings(user.id), getAccounts(user.id)]);
      setAccounts(accs);
      const withPrices = await Promise.all(
        data.map(async (item) => {
          try {
            // stock_code는 순수 6자리(예: 005930)로 저장됨 → 한국주식 인식되도록 .KS 부착
            const symbol = item.stock_code.includes('.') ? item.stock_code : item.stock_code + '.KS';
            const detail = await fetchStockDetail(symbol);
            return { ...item, currentPrice: detail?.regularMarketPrice ?? null, sector: detail?.sector ?? null };
          } catch {
            return { ...item, currentPrice: null, sector: null };
          }
        })
      );
      setHoldings(withPrices);

      // 오늘 총 평가액 스냅샷 저장
      const eval_ = withPrices.reduce((s, h) => s + (h.currentPrice ?? h.avg_price) * h.shares, 0);
      if (eval_ > 0) await saveSnapshot(eval_);

      // 차트용 히스토리 로드
      const snaps = await loadSnapshots();
      setPnlHistory(snaps);

      // 알림 조건 체크 (설정된 경우)
      const notifSettings = await loadNotifSettings();
      if (notifSettings.pnlAlert) {
        await checkPnlAlert(withPrices, notifSettings.pnlThresholdPct);
      }
      if (notifSettings.bigMovement) {
        await checkBigMovementAlert(withPrices, notifSettings.bigMovementPct);
      }
    } catch (e) {
      console.error('포트폴리오 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadPortfolio();
    }, [loadPortfolio])
  );

  const handleDelete = (id, stockName) => {
    Alert.alert('종목 삭제', `${stockName}을(를) 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive', onPress: async () => {
          try {
            await deleteHolding(id);
            setHoldings(prev => prev.filter(h => h.id !== id));
          } catch (e) {
            Alert.alert('오류', '삭제 실패: ' + e.message);
          }
        },
      },
    ]);
  };

  const handleAdd = async (stockCode, stockName, shares, avgPrice, accountId) => {
    await addHolding(user.id, stockCode, stockName, shares, avgPrice, accountId || null);
    await loadPortfolio();
  };

  const handleCreateAccount = async (brokerage, alias, color) => {
    const newAcc = await createAccount(user.id, brokerage, alias, color);
    setAccounts(prev => [...prev, newAcc]);
  };

  const handleConfirmMove = async (accountId) => {
    if (!moveTarget) return;
    try {
      await moveHolding(moveTarget.id, accountId);
      setMoveTarget(null);
      await loadPortfolio();
    } catch (e) {
      Alert.alert('오류', '계좌 이동 실패: ' + e.message);
    }
  };

  const handleDeleteAccount = (acc) => {
    Alert.alert(
      '계좌 삭제',
      `"${acc.alias}" 계좌를 삭제할까요?\n해당 계좌의 종목은 미분류로 이동됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제', style: 'destructive', onPress: async () => {
            try {
              await deleteAccount(acc.id);
              setAccounts(prev => prev.filter(a => a.id !== acc.id));
              if (selectedAccountId === acc.id) setSelectedAccountId('all');
              await loadPortfolio();
            } catch (e) {
              Alert.alert('오류', '삭제 실패: ' + e.message);
            }
          },
        },
      ]
    );
  };

  const requestDiagnosis = async () => {
    if (holdings.length === 0) return;
    setDiagnosisLoading(true);
    try {
      const payload = holdings.map(h => ({
        name:         h.stock_name,
        code:         h.stock_code,
        shares:       h.shares,
        avgPrice:     h.avg_price,
        currentPrice: h.currentPrice ?? h.avg_price,
      }));
      const result = await analyzePortfolio(payload);
      setDiagnosis(result);
    } catch (e) {
      console.error('진단 실패:', e);
    } finally {
      setDiagnosisLoading(false);
    }
  };

  const totalBuy  = holdings.reduce((s, h) => s + h.avg_price * h.shares, 0);
  const totalEval = holdings.reduce((s, h) => s + (h.currentPrice ?? h.avg_price) * h.shares, 0);
  const totalPnl  = totalEval - totalBuy;
  const totalRate = totalBuy > 0 ? (totalPnl / totalBuy) * 100 : 0;
  const isPositive = totalPnl >= 0;

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>포트폴리오</Text>
        </View>
        <LoginPrompt onLogin={() => navigation.navigate('Auth')} />
      </View>
    );
  }

  // 현재 선택된 계좌 기준으로 필터된 holdings
  const visibleHoldings = selectedAccountId === 'all'
    ? holdings
    : holdings.filter(h => h.account_id === selectedAccountId);

  // 전체 보기: 계좌별 그룹
  const accountGroups = accounts.map(acc => ({
    account: acc,
    holdings: holdings.filter(h => h.account_id === acc.id),
  }));
  const unassigned = holdings.filter(h => !h.account_id);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* 헤더 */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>포트폴리오</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.summaryValue, { fontSize: 20, marginBottom: 2 }]}>
              ₩{totalEval.toLocaleString()}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: isPositive ? '#00FF88' : '#FF4466' }}>
              {isPositive ? '+' : ''}{totalRate.toFixed(2)}% {isPositive ? '▲' : '▼'}
            </Text>
          </View>
        </View>

        {/* 계좌 탭바 */}
        <AccountTabBar
          accounts={accounts}
          selectedId={selectedAccountId}
          onSelect={setSelectedAccountId}
          onAdd={() => setShowAccountModal(true)}
          onLongPress={handleDeleteAccount}
        />

        {/* 수익률 추이 차트 */}
        <View style={{ marginTop: 12 }}>
          <PnLChart history={pnlHistory} />
        </View>

        {/* AI 포트폴리오 진단 */}
        {holdings.length > 0 && (
          <AIDiagnosisCard
            diagnosis={diagnosis}
            loading={diagnosisLoading}
            onRequest={requestDiagnosis}
          />
        )}

        {/* 전체 요약 카드 (단일 계좌 뷰에서는 작게) */}
        {selectedAccountId === 'all' && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>전체 포트폴리오 요약</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryItemLabel}>총 매수금액</Text>
                <Text style={styles.summaryItemValue}>₩{totalBuy.toLocaleString()}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryItemLabel}>평가 손익</Text>
                <Text style={[styles.summaryItemValue, { color: isPositive ? '#00FF88' : '#FF4466' }]}>
                  {isPositive ? '+' : ''}₩{Math.round(totalPnl).toLocaleString()}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryItemLabel}>{holdings.length}종목</Text>
                <Text style={styles.summaryItemValue}>{accounts.length}계좌</Text>
              </View>
            </View>
          </View>
        )}

        {/* 보유 비중 파이차트 */}
        <PortfolioPieChart holdings={visibleHoldings} />

        {/* 섹터 분산 파이차트 */}
        <SectorPieChart holdings={visibleHoldings} />

        {/* 보유 종목 — 계좌별 그룹 or 단일 계좌 필터 */}
        {loading ? (
          <ActivityIndicator color="#00D9FF" style={{ paddingVertical: 30 }} />
        ) : holdings.length === 0 ? (
          <View style={[styles.emptyBox, { marginHorizontal: 16 }]}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>보유 종목이 없습니다</Text>
            <Text style={styles.emptySubText}>아래 + 버튼으로 직접 추가해보세요</Text>
          </View>
        ) : selectedAccountId === 'all' ? (
          <>
            {accountGroups.map(({ account, holdings: ah }) => (
              <AccountSection
                key={account.id}
                account={account}
                holdings={ah}
                diagnosis={diagnosis}
                navigation={navigation}
                onDelete={handleDelete}
                onMove={setMoveTarget}
              />
            ))}
            {unassigned.length > 0 && (
              <AccountSection
                account={null}
                holdings={unassigned}
                diagnosis={diagnosis}
                navigation={navigation}
                onDelete={handleDelete}
                onMove={setMoveTarget}
              />
            )}
          </>
        ) : (
          <AccountSection
            account={accounts.find(a => a.id === selectedAccountId) || null}
            holdings={visibleHoldings}
            diagnosis={diagnosis}
            navigation={navigation}
            onDelete={handleDelete}
            onMove={setMoveTarget}
          />
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 플로팅 추가 버튼 */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowAddModal(true)} activeOpacity={0.85}>
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>종목 추가</Text>
      </TouchableOpacity>

      <AddHoldingModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAdd}
        accounts={accounts}
        defaultAccountId={selectedAccountId === 'all' ? null : selectedAccountId}
        onCreateAccount={handleCreateAccount}
      />

      <CreateAccountModal
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        onCreate={handleCreateAccount}
      />

      <AccountPickerModal
        visible={!!moveTarget}
        holding={moveTarget}
        accounts={accounts}
        onClose={() => setMoveTarget(null)}
        onSelect={handleConfirmMove}
      />

      {/* AI 채팅 FAB */}
      <TouchableOpacity style={pStyles.chatFab} onPress={() => setChatVisible(true)}>
        <Text style={pStyles.chatFabText}>💬</Text>
      </TouchableOpacity>

      <AIChatModal
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        portfolioHoldings={holdings}
      />
    </View>
  );
}

const pStyles = StyleSheet.create({
  chatFab: {
    position: 'absolute', bottom: 90, right: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },
  chatFabText: { fontSize: 22 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E27' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF' },
  signOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#252A47',
  },
  signOutText: { color: '#6B7280', fontSize: 13 },
  userEmail: { color: '#6B7280', fontSize: 12, marginTop: 2 },

  // 요약 카드
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#161B35',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#252A47',
  },
  summaryLabel: { fontSize: 12, color: '#6B7280', marginBottom: 6 },
  summaryValue: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', marginBottom: 20 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 30, backgroundColor: '#252A47' },
  summaryItemLabel: { fontSize: 11, color: '#6B7280', marginBottom: 4 },
  summaryItemValue: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },

  // 섹션
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#161B35',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#252A47',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  sectionCount: { fontSize: 13, color: '#6B7280' },

  // 종목 카드
  holdingCard: {
    backgroundColor: '#0D1128',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: '#252A47',
  },
  holdingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  holdingName: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  holdingCode: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FF446640',
  },
  deleteBtnText: { color: '#FF4466', fontSize: 12 },
  holdingRow: { flexDirection: 'row', marginBottom: 8 },
  holdingPnlRow: { flexDirection: 'row', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1E2340' },
  holdingCol: { flex: 1, alignItems: 'center' },
  holdingLabel: { fontSize: 11, color: '#6B7280', marginBottom: 4 },
  holdingValue: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },

  // AI 진단
  aiDiagnosisBtn: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#161B35',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#9D4EDD40',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiDiagnosisBtnIcon: { fontSize: 24 },
  aiDiagnosisBtnTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 },
  aiDiagnosisBtnSub:   { fontSize: 12, color: '#6B7280' },
  aiDiagnosisBtnArrow: { fontSize: 14, color: '#9D4EDD' },

  aiDiagnosisCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#161B35',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#9D4EDD50',
    padding: 16,
  },
  aiDiagnosisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiDiagnosisTitle: { fontSize: 14, fontWeight: '700', color: '#9D4EDD' },
  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  riskBadgeText: { fontSize: 12, fontWeight: '700' },
  aiSummaryText: {
    fontSize: 13,
    color: '#C0C8E0',
    lineHeight: 21,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  macroImpactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
    backgroundColor: '#0D1128',
    borderRadius: 10,
    padding: 10,
  },
  macroImpactLabel: { fontSize: 12, color: '#9D4EDD', fontWeight: '600', width: 50 },
  macroImpactText:  { flex: 1, fontSize: 12, color: '#8892A4', lineHeight: 18 },
  attentionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  attentionLabel: { fontSize: 12, color: '#FFB800', fontWeight: '600' },
  attentionTag: {
    backgroundColor: '#FFB80015',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFB80040',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  attentionTagText: { fontSize: 12, color: '#FFB800', fontWeight: '600' },
  reDiagnoseBtn: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#9D4EDD50',
    marginTop: 4,
  },
  reDiagnoseBtnText: { fontSize: 12, color: '#9D4EDD', fontWeight: '600' },

  // 종목 카드 AI
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBadgeText: { fontSize: 11, fontWeight: '700' },
  urgencyBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  urgencyBadgeText: { fontSize: 10, fontWeight: '600' },
  aiReasonRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E2340',
    gap: 6,
  },
  aiPriceRow: { flexDirection: 'row', gap: 8 },
  aiPriceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1128',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
  },
  aiPriceLabel: { fontSize: 11, color: '#6B7280' },
  aiPriceVal:   { fontSize: 12, fontWeight: '700' },
  aiReasonText: { fontSize: 12, color: '#8892A4', lineHeight: 18 },

  // 빈 상태
  emptyBox: { alignItems: 'center', paddingVertical: 24 },
  emptyIcon: { fontSize: 36, marginBottom: 10 },
  emptyText: { color: '#6B7280', fontSize: 14, fontWeight: '500' },
  emptySubText: { color: '#4A5568', fontSize: 12, marginTop: 6 },

  // 플로팅 버튼
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#00D9FF',
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 8,
    shadowColor: '#00D9FF',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabIcon: { fontSize: 22, color: '#0A0E27', fontWeight: '800', lineHeight: 24 },
  fabText: { fontSize: 15, fontWeight: '700', color: '#0A0E27' },

  // 모달
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000080' },
  modalSheet: {
    backgroundColor: '#161B35',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: '#252A47',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#252A47',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 20 },

  inputGroup: { marginBottom: 14 },
  inputRow: { flexDirection: 'row' },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#8892A4', marginBottom: 7 },
  modalInput: {
    backgroundColor: '#0D1128',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#252A47',
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#FFFFFF',
    fontSize: 15,
  },

  previewBox: {
    backgroundColor: '#00D9FF12',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00D9FF30',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  previewLabel: { fontSize: 13, color: '#6B7280' },
  previewValue: { fontSize: 16, fontWeight: '700', color: '#00D9FF' },

  modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252A47',
  },
  cancelBtnText: { color: '#6B7280', fontSize: 16, fontWeight: '600' },
  addBtn: {
    flex: 2,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#00D9FF',
  },
  addBtnText: { color: '#0A0E27', fontSize: 16, fontWeight: '800' },

  // 로그인 유도
  loginPromptBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  loginPromptIcon: { fontSize: 60, marginBottom: 20 },
  loginPromptTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12 },
  loginPromptSub: { fontSize: 14, color: '#8A9BAE', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  loginBtn: {
    backgroundColor: '#00D9FF',
    borderRadius: 14,
    paddingHorizontal: 36,
    paddingVertical: 14,
  },
  loginBtnText: { color: '#0A0E27', fontSize: 16, fontWeight: 'bold' },
});
