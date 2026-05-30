/**
 * AI 채팅 컴포넌트
 * - 채팅 목록 화면 (세션 목록)
 * - 대화 화면 (메시지 + 키보드 대응)
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { sendAIChat } from '../services/kisAPI';
import {
  appendMessage,
  clearAllSessions,
  createSession,
  deleteSession,
  loadSessions,
} from '../utils/aiChatStorage';

// 날짜 포매터
const fmtDate = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const QUICK_GENERAL = [
  '지금 시장 분위기는?',
  '오늘 주목할 섹터는?',
  '환율이 주가에 미치는 영향?',
  '기관 매수 신호란?',
  '지금 매수 적기인가?',
  '리스크 관리 방법은?',
];

const quickStockQuestions = (name) => [
  `${name} 지금 매수해도 될까?`,
  '최근 기관 매매 의미는?',
  '이 종목 리스크는?',
  '목표가를 어떻게 잡을까?',
  '언제 매도하면 좋을까?',
  '적정 비중은?',
];

// ── 말풍선 ──────────────────────────────────────────────────────────
function Bubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <View style={[bStyles.row, isUser ? bStyles.rowUser : bStyles.rowAI]}>
      {!isUser && (
        <View style={bStyles.aiAvatar}>
          <Text style={bStyles.aiAvatarText}>AI</Text>
        </View>
      )}
      <View style={[bStyles.bubble, isUser ? bStyles.bubbleUser : bStyles.bubbleAI]}>
        <Text style={[bStyles.text, isUser ? bStyles.textUser : bStyles.textAI]}>
          {message.content}
        </Text>
        <Text style={bStyles.time}>{fmtDate(message.at)}</Text>
      </View>
    </View>
  );
}

const bStyles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end' },
  rowUser: { justifyContent: 'flex-end' },
  rowAI: { justifyContent: 'flex-start' },
  aiAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center',
    marginRight: 8, marginBottom: 2,
  },
  aiAvatarText: { fontSize: 10, color: '#FFF', fontWeight: 'bold' },
  bubble: {
    maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: '#7C3AED',
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor: '#1A1F3A',
    borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: '#252A47',
  },
  text: { fontSize: 14, lineHeight: 21 },
  textUser: { color: '#FFFFFF' },
  textAI: { color: '#E2E8F0' },
  time: { fontSize: 10, color: '#4A5568', marginTop: 5, textAlign: 'right' },
});

// ── 대화 화면 ───────────────────────────────────────────────────────
function ConversationScreen({ session, onBack, onSessionUpdate }) {
  const [messages, setMessages] = useState(session.messages || []);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const flatRef = useRef(null);
  const inputRef = useRef(null);

  // 메시지가 추가될 때 자동 스크롤
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSend = async (text) => {
    const q = (text || input).trim();
    if (!q || sending) return;

    const userMsg = { role: 'user', content: q, at: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setSending(true);

    // 저장: 유저 메시지
    await appendMessage(session.id, 'user', q);

    try {
      const result = await sendAIChat(q);
      const aiMsg = { role: 'assistant', content: result.answer, at: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
      await appendMessage(session.id, 'assistant', result.answer);
      onSessionUpdate?.();
    } catch {
      const errMsg = {
        role: 'assistant',
        content: 'AI 응답에 실패했습니다. 잠시 후 다시 시도해주세요.',
        at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={cStyles.container}>
        {/* 헤더 */}
        <View style={cStyles.header}>
          <TouchableOpacity style={cStyles.backBtn} onPress={onBack}>
            <Text style={cStyles.backText}>‹ 목록</Text>
          </TouchableOpacity>
          <Text style={cStyles.headerTitle} numberOfLines={1}>
            {session.title || '새 채팅'}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        {/* 메시지 목록 */}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => <Bubble message={item} />}
          contentContainerStyle={cStyles.messageList}
          ListEmptyComponent={
            <View style={cStyles.emptyChat}>
              <Text style={cStyles.emptyChatIcon}>🤖</Text>
              <Text style={cStyles.emptyChatTitle}>AI에게 무엇이든 물어보세요</Text>
              <Text style={cStyles.emptyChatSub}>주식, 시장, 투자 전략 등 자유롭게</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />

        {/* 빠른 질문 (메시지 없을 때만) */}
        {isEmpty && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={cStyles.quickScroll}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          >
            {QUICK_QUESTIONS.map(q => (
              <TouchableOpacity
                key={q}
                style={cStyles.quickBtn}
                onPress={() => handleSend(q)}
              >
                <Text style={cStyles.quickText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* AI 응답 중 인디케이터 */}
        {sending && (
          <View style={cStyles.typingRow}>
            <View style={cStyles.typingBubble}>
              <ActivityIndicator size="small" color="#A78BFA" />
              <Text style={cStyles.typingText}>AI가 답변 중...</Text>
            </View>
          </View>
        )}

        {/* 입력 영역 */}
        <View style={cStyles.inputArea}>
          <TextInput
            ref={inputRef}
            style={cStyles.input}
            placeholder="메시지를 입력하세요..."
            placeholderTextColor="#4A5568"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={300}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => handleSend()}
          />
          <TouchableOpacity
            style={[cStyles.sendBtn, (!input.trim() || sending) && cStyles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!input.trim() || sending}
          >
            <Text style={cStyles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const cStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E1F' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1A1F3A',
    backgroundColor: '#0D1124',
  },
  backBtn: { paddingVertical: 4, paddingRight: 12, minWidth: 60 },
  backText: { color: '#A78BFA', fontSize: 16, fontWeight: '600' },
  headerTitle: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  messageList: { padding: 16, paddingBottom: 16, flexGrow: 1 },
  emptyChat: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyChatIcon: { fontSize: 48, marginBottom: 14 },
  emptyChatTitle: { fontSize: 17, color: '#FFFFFF', fontWeight: '700', marginBottom: 8 },
  emptyChatSub: { fontSize: 13, color: '#4A5568', textAlign: 'center' },
  contextBadge: {
    marginHorizontal: 16, marginBottom: 8, marginTop: 4,
    backgroundColor: '#1A0F3A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#7C3AED40',
  },
  contextBadgeText: { color: '#A78BFA', fontSize: 12, fontWeight: '600' },
  quickScroll: { maxHeight: 48, marginBottom: 8 },
  quickBtn: {
    backgroundColor: '#1A1F3A', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: '#252A47',
  },
  quickText: { fontSize: 13, color: '#A78BFA', fontWeight: '500' },
  typingRow: { paddingHorizontal: 16, marginBottom: 8 },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1A1F3A', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
    alignSelf: 'flex-start', borderWidth: 1, borderColor: '#252A47',
  },
  typingText: { color: '#A78BFA', fontSize: 13 },
  inputArea: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    borderTopWidth: 1, borderTopColor: '#1A1F3A',
    backgroundColor: '#0D1124',
  },
  input: {
    flex: 1, backgroundColor: '#1A1F3A', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10,
    color: '#FFFFFF', fontSize: 14, lineHeight: 20,
    maxHeight: 100, borderWidth: 1, borderColor: '#252A47',
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#252A47' },
  sendIcon: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginTop: -1 },
});

// ── 세션 목록 아이템 ─────────────────────────────────────────────────
function SessionItem({ session, onPress, onDelete }) {
  const msgCount = session.messages?.length || 0;
  const lastMsg = session.messages?.[session.messages.length - 1];

  return (
    <TouchableOpacity style={lStyles.item} onPress={onPress} activeOpacity={0.8}>
      <View style={lStyles.itemIcon}>
        <Text style={lStyles.itemIconText}>💬</Text>
      </View>
      <View style={lStyles.itemBody}>
        <Text style={lStyles.itemTitle} numberOfLines={1}>{session.title}</Text>
        <Text style={lStyles.itemPreview} numberOfLines={1}>
          {lastMsg?.content || '대화 없음'}
        </Text>
      </View>
      <View style={lStyles.itemRight}>
        <Text style={lStyles.itemDate}>{fmtDate(session.createdAt)}</Text>
        <Text style={lStyles.itemCount}>{msgCount}개</Text>
      </View>
      <TouchableOpacity style={lStyles.deleteBtn} onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={lStyles.deleteBtnText}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const lStyles = StyleSheet.create({
  item: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#12172E', borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#1E2A42', gap: 12,
  },
  itemIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1A0F3A', justifyContent: 'center', alignItems: 'center',
  },
  itemIconText: { fontSize: 18 },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 14, color: '#FFFFFF', fontWeight: '700', marginBottom: 4 },
  itemPreview: { fontSize: 12, color: '#4A5568' },
  itemRight: { alignItems: 'flex-end', gap: 4 },
  itemDate: { fontSize: 11, color: '#4A5568' },
  itemCount: { fontSize: 11, color: '#7C3AED' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { color: '#4A5568', fontSize: 14 },
});

// ── 메인 모달 컴포넌트 ───────────────────────────────────────────────
// holdings 배열 → AI 프롬프트용 텍스트
const buildPortfolioText = (holdings) => {
  if (!holdings || holdings.length === 0) return null;
  const lines = ['[내 포트폴리오]'];
  let totalBuy = 0, totalEval = 0;
  holdings.forEach(h => {
    const cur = h.currentPrice ?? h.avg_price;
    const pnl = ((cur - h.avg_price) / h.avg_price * 100).toFixed(1);
    const sign = pnl >= 0 ? '+' : '';
    lines.push(`• ${h.stock_name}(${h.stock_code}): ${h.shares}주 / 매수가 ₩${h.avg_price.toLocaleString()} / 현재가 ₩${cur.toLocaleString()} / 수익률 ${sign}${pnl}%`);
    totalBuy += h.avg_price * h.shares;
    totalEval += cur * h.shares;
  });
  const totalRate = totalBuy > 0 ? ((totalEval - totalBuy) / totalBuy * 100).toFixed(1) : 0;
  const sign = totalRate >= 0 ? '+' : '';
  lines.push(`총 평가액: ₩${Math.round(totalEval).toLocaleString()} / 총 매수금액: ₩${Math.round(totalBuy).toLocaleString()} / 전체 수익률: ${sign}${totalRate}%`);
  return lines.join('\n');
};

export default function AIChatModal({ visible, onClose, stockCode = null, stockName = null, portfolioHoldings = null }) {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null); // null = 목록 화면
  const [loadingNew, setLoadingNew] = useState(false);

  // 모달 열릴 때마다 세션 목록 새로고침
  useEffect(() => {
    if (visible) refreshSessions();
  }, [visible]);

  const refreshSessions = async () => {
    const list = await loadSessions();
    // 최신순 정렬
    setSessions([...list].reverse());
  };

  const handleNewChat = async () => {
    // 빈 세션 미리 만들지 않고 첫 메시지 전송 시 생성
    // 임시 세션 (id 없음) 으로 열기
    setActiveSession({ id: null, title: '새 채팅', messages: [], createdAt: new Date().toISOString() });
  };

  const handleOpenSession = (session) => {
    setActiveSession(session);
  };

  const handleDeleteSession = (sessionId) => {
    Alert.alert('채팅 삭제', '이 대화를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive', onPress: async () => {
          await deleteSession(sessionId);
          await refreshSessions();
        },
      },
    ]);
  };

  const handleClearAll = () => {
    if (sessions.length === 0) return;
    Alert.alert('전체 삭제', '모든 채팅 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '전체 삭제', style: 'destructive', onPress: async () => {
          await clearAllSessions();
          setSessions([]);
        },
      },
    ]);
  };

  const handleClose = () => {
    setActiveSession(null);
    onClose();
  };

  // ConversationScreen에서 세션이 없을 때 첫 메시지 발송 처리
  // → appendMessage 전에 세션 생성 필요
  // activeSession.id === null이면 새 세션
  const getOrCreateSessionId = async (firstQuestion) => {
    if (activeSession?.id) return activeSession.id;
    const session = await createSession(firstQuestion);
    setActiveSession(prev => ({ ...prev, id: session.id, title: session.title }));
    return session.id;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <SafeAreaView style={mStyles.root}>
        {activeSession ? (
          // ── 대화 화면 ──
          <ConversationScreenWrapper
            session={activeSession}
            getOrCreateSessionId={getOrCreateSessionId}
            onBack={() => { setActiveSession(null); refreshSessions(); }}
            onSessionUpdate={refreshSessions}
            stockCode={stockCode}
            stockName={stockName}
            portfolioText={buildPortfolioText(portfolioHoldings)}
          />
        ) : (
          // ── 목록 화면 ──
          <View style={mStyles.listContainer}>
            {/* 헤더 */}
            <View style={mStyles.listHeader}>
              <Text style={mStyles.listTitle}>AI 채팅</Text>
              <TouchableOpacity onPress={handleClose} style={mStyles.closeBtn}>
                <Text style={mStyles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 새 채팅 버튼 */}
            <TouchableOpacity style={mStyles.newChatBtn} onPress={handleNewChat}>
              <Text style={mStyles.newChatIcon}>✏️</Text>
              <Text style={mStyles.newChatText}>새 채팅 시작</Text>
            </TouchableOpacity>

            {/* 세션 목록 */}
            {sessions.length === 0 ? (
              <View style={mStyles.emptyList}>
                <Text style={mStyles.emptyListIcon}>💬</Text>
                <Text style={mStyles.emptyListTitle}>아직 대화가 없어요</Text>
                <Text style={mStyles.emptyListSub}>위 버튼으로 첫 질문을 해보세요</Text>
              </View>
            ) : (
              <>
                <View style={mStyles.sectionRow}>
                  <Text style={mStyles.sectionLabel}>이전 대화 ({sessions.length}개)</Text>
                  <TouchableOpacity onPress={handleClearAll}>
                    <Text style={mStyles.clearAllText}>전체 삭제</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={sessions}
                  keyExtractor={s => s.id}
                  renderItem={({ item }) => (
                    <SessionItem
                      session={item}
                      onPress={() => handleOpenSession(item)}
                      onDelete={() => handleDeleteSession(item.id)}
                    />
                  )}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 40 }}
                />
              </>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ConversationScreen을 감싸서 새 세션 생성 로직 처리
function ConversationScreenWrapper({ session, getOrCreateSessionId, onBack, onSessionUpdate, stockCode, stockName, portfolioText }) {
  const [localSession, setLocalSession] = useState(session);
  const [messages, setMessages] = useState(session.messages || []);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const flatRef = useRef(null);
  const quickList = stockName
    ? quickStockQuestions(stockName)
    : portfolioText
    ? ['내 포트폴리오 전체 분석해줘', '리스크가 높은 종목은?', '어떤 종목을 매도할까?', '포트폴리오 비중 조정 방법은?', '지금 추가 매수할 종목은?', '전체 손익 전망은?']
    : QUICK_GENERAL;

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSend = async (text) => {
    const q = (text || input).trim();
    if (!q || sending) return;

    // 새 세션이면 먼저 생성
    let sessionId = localSession.id;
    if (!sessionId) {
      const newSession = await createSession(q);
      sessionId = newSession.id;
      setLocalSession(prev => ({ ...prev, id: sessionId, title: newSession.title }));
    }

    const userMsg = { role: 'user', content: q, at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    await appendMessage(sessionId, 'user', q);

    try {
      // 현재 메시지 전까지의 히스토리 전달 (AI가 대화 맥락 파악)
      const result = await sendAIChat(q, stockCode, stockName, portfolioText, messages);
      const aiMsg = { role: 'assistant', content: result.answer, at: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
      await appendMessage(sessionId, 'assistant', result.answer);
      onSessionUpdate?.();
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'AI 응답에 실패했습니다. 잠시 후 다시 시도해주세요.',
        at: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={cStyles.container}>
        {/* 헤더 */}
        <View style={cStyles.header}>
          <TouchableOpacity style={cStyles.backBtn} onPress={onBack}>
            <Text style={cStyles.backText}>‹ 목록</Text>
          </TouchableOpacity>
          <Text style={cStyles.headerTitle} numberOfLines={1}>
            {localSession.title || '새 채팅'}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        {/* 컨텍스트 배지 */}
        {stockName && (
          <View style={cStyles.contextBadge}>
            <Text style={cStyles.contextBadgeText}>📌 {stockName} 종목 기준으로 답변합니다</Text>
          </View>
        )}
        {portfolioText && !stockName && (
          <View style={[cStyles.contextBadge, { borderColor: '#00D97E40' }]}>
            <Text style={[cStyles.contextBadgeText, { color: '#00D97E' }]}>💼 내 포트폴리오 정보를 인식하고 있습니다</Text>
          </View>
        )}

        {/* 메시지 */}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => <Bubble message={item} />}
          contentContainerStyle={[cStyles.messageList, isEmpty && { flex: 1 }]}
          ListEmptyComponent={
            <View style={cStyles.emptyChat}>
              <Text style={cStyles.emptyChatIcon}>🤖</Text>
              <Text style={cStyles.emptyChatTitle}>AI에게 무엇이든 물어보세요</Text>
              <Text style={cStyles.emptyChatSub}>
                {stockName ? `${stockName} 관련 질문을 해보세요` : '주식, 시장, 투자 전략 등 자유롭게'}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />

        {/* 빠른 질문 (첫 메시지 없을 때) */}
        {isEmpty && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={cStyles.quickScroll}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          >
            {quickList.map(q => (
              <TouchableOpacity key={q} style={cStyles.quickBtn} onPress={() => handleSend(q)}>
                <Text style={cStyles.quickText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* 타이핑 인디케이터 */}
        {sending && (
          <View style={cStyles.typingRow}>
            <View style={cStyles.typingBubble}>
              <ActivityIndicator size="small" color="#A78BFA" />
              <Text style={cStyles.typingText}>AI가 답변 중...</Text>
            </View>
          </View>
        )}

        {/* 입력창 */}
        <View style={cStyles.inputArea}>
          <TextInput
            style={cStyles.input}
            placeholder="메시지를 입력하세요..."
            placeholderTextColor="#4A5568"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={300}
          />
          <TouchableOpacity
            style={[cStyles.sendBtn, (!input.trim() || sending) && cStyles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!input.trim() || sending}
          >
            <Text style={cStyles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const mStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0E1F' },
  listContainer: { flex: 1, backgroundColor: '#0A0E1F' },
  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1A1F3A',
  },
  listTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  closeBtn: { padding: 6 },
  closeBtnText: { fontSize: 18, color: '#4A5568' },
  newChatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    margin: 16, backgroundColor: '#7C3AED', borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 16,
  },
  newChatIcon: { fontSize: 20 },
  newChatText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  sectionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 10,
  },
  sectionLabel: { fontSize: 13, color: '#4A5568', fontWeight: '600' },
  clearAllText: { fontSize: 13, color: '#FF4466' },
  emptyList: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyListIcon: { fontSize: 52, marginBottom: 16 },
  emptyListTitle: { fontSize: 18, color: '#FFFFFF', fontWeight: '700', marginBottom: 8 },
  emptyListSub: { fontSize: 14, color: '#4A5568' },
});
