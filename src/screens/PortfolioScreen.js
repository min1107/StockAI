import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useCallback, useState } from 'react';
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
import { getHoldings, deleteHolding, addHolding } from '../services/portfolioAPI';
import { fetchStockDetail } from '../services/stockAPI';
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
function AddHoldingModal({ visible, onClose, onAdd }) {
  const [mode, setMode] = useState(null); // null=선택화면 | 'manual' | 'csv'

  // 직접입력 state
  const [stockCode, setStockCode] = useState('');
  const [stockName, setStockName] = useState('');
  const [shares, setShares] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [loading, setLoading] = useState(false);

  // CSV state
  const [csvItems, setCsvItems] = useState([]); // 파싱된 종목 목록
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [selected, setSelected] = useState({}); // { code: true/false }

  const reset = () => {
    setMode(null);
    setStockCode(''); setStockName(''); setShares(''); setAvgPrice('');
    setCsvItems([]); setCsvError(''); setSelected({});
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
      await onAdd(stockCode.trim(), stockName.trim(), sharesNum, priceNum);
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
      const fileUri = result.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
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
      try { await onAdd(item.code, item.name, item.shares, item.avgPrice); added++; }
      catch {}
    }
    setLoading(false);
    Alert.alert('완료', `${added}개 종목이 추가되었습니다.`);
    reset(); onClose();
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
              <Text style={styles.modalSubtitle}>추가 방법을 선택하세요</Text>

              <TouchableOpacity style={addStyles.optionBtn} onPress={() => setMode('manual')}>
                <Text style={addStyles.optionIcon}>✏️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={addStyles.optionTitle}>직접 입력</Text>
                  <Text style={addStyles.optionDesc}>종목코드, 수량, 평균매입가를 직접 입력</Text>
                </View>
                <Text style={addStyles.optionArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[addStyles.optionBtn, { borderColor: '#00D97E40' }]} onPress={() => setMode('csv')}>
                <Text style={addStyles.optionIcon}>📂</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[addStyles.optionTitle, { color: '#00D97E' }]}>파일로 가져오기</Text>
                  <Text style={addStyles.optionDesc}>증권사 보유종목 CSV/엑셀 파일 업로드</Text>
                </View>
                <Text style={addStyles.optionArrow}>›</Text>
              </TouchableOpacity>

              <View style={addStyles.hintBox}>
                <Text style={addStyles.hintText}>💡 CSV 가져오기 방법</Text>
                <Text style={addStyles.hintDesc}>
                  증권사 MTS → 보유종목 → 내보내기/공유{'\n'}
                  키움·미래에셋·삼성·NH·KB증권 등 지원
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
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [diagnosis, setDiagnosis] = useState(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [pnlHistory, setPnlHistory] = useState([]);
  const [chatVisible, setChatVisible] = useState(false);

  const loadPortfolio = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getHoldings(user.id);
      const withPrices = await Promise.all(
        data.map(async (item) => {
          try {
            const detail = await fetchStockDetail(item.stock_code);
            return { ...item, currentPrice: detail?.regularMarketPrice ?? null };
          } catch {
            return { ...item, currentPrice: null };
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

  const handleAdd = async (stockCode, stockName, shares, avgPrice) => {
    await addHolding(user.id, stockCode, stockName, shares, avgPrice);
    await loadPortfolio();
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

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>포트폴리오</Text>
          <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.userEmail}>{user.email}</Text>

        {/* 수익률 추이 차트 */}
        <PnLChart history={pnlHistory} />

        {/* AI 포트폴리오 진단 */}
        {holdings.length > 0 && (
          <AIDiagnosisCard
            diagnosis={diagnosis}
            loading={diagnosisLoading}
            onRequest={requestDiagnosis}
          />
        )}

        {/* 총 평가 요약 */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>총 평가액</Text>
          <Text style={styles.summaryValue}>₩{totalEval.toLocaleString()}</Text>
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
              <Text style={styles.summaryItemLabel}>수익률</Text>
              <Text style={[styles.summaryItemValue, { color: isPositive ? '#00FF88' : '#FF4466' }]}>
                {isPositive ? '+' : ''}{totalRate.toFixed(2)}%
              </Text>
            </View>
          </View>
        </View>

        {/* 보유 비중 파이차트 */}
        <PortfolioPieChart holdings={holdings} />

        {/* 보유 종목 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>보유 종목</Text>
            <Text style={styles.sectionCount}>{holdings.length}종목</Text>
          </View>

          {loading ? (
            <ActivityIndicator color="#00D9FF" style={{ paddingVertical: 30 }} />
          ) : holdings.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>보유 종목이 없습니다</Text>
              <Text style={styles.emptySubText}>아래 + 버튼으로 직접 추가해보세요</Text>
            </View>
          ) : (
            holdings.map(item => {
              const baseCode = item.stock_code.split('.')[0];
              const aiItem = diagnosis?.items?.find(
                d => d.code === baseCode || d.code === item.stock_code
              );
              const symbol = item.stock_code.includes('.')
                ? item.stock_code
                : item.stock_code + '.KS';
              return (
                <HoldingCard
                  key={item.id}
                  item={item}
                  aiItem={aiItem}
                  onDelete={handleDelete}
                  onPress={() => navigation.navigate('StockDetail', {
                    symbol,
                    name: item.stock_name,
                  })}
                />
              );
            })
          )}
        </View>

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
  userEmail: { color: '#6B7280', fontSize: 12, paddingHorizontal: 20, marginBottom: 16 },

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
