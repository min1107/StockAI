import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAT_KEY = '@StockAI:ai_chats';
const MAX_SESSIONS = 30;

// UUID 대체 (Expo에서 별도 라이브러리 없이)
const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// 전체 세션 목록 불러오기
export const loadSessions = async () => {
  try {
    const raw = await AsyncStorage.getItem(CHAT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

// 세션 목록 저장 (최대 MAX_SESSIONS)
const saveSessions = async (sessions) => {
  const trimmed = sessions.slice(-MAX_SESSIONS);
  await AsyncStorage.setItem(CHAT_KEY, JSON.stringify(trimmed));
};

// 새 세션 생성
export const createSession = async (firstQuestion) => {
  const session = {
    id: genId(),
    title: firstQuestion.trim().slice(0, 30),
    createdAt: new Date().toISOString(),
    messages: [],
  };
  const sessions = await loadSessions();
  sessions.push(session);
  await saveSessions(sessions);
  return session;
};

// 특정 세션에 메시지 추가
export const appendMessage = async (sessionId, role, content) => {
  const sessions = await loadSessions();
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx === -1) return;
  sessions[idx].messages.push({ role, content, at: new Date().toISOString() });
  await saveSessions(sessions);
};

// 세션 삭제
export const deleteSession = async (sessionId) => {
  const sessions = await loadSessions();
  await saveSessions(sessions.filter(s => s.id !== sessionId));
};

// 세션 전체 삭제
export const clearAllSessions = async () => {
  await AsyncStorage.removeItem(CHAT_KEY);
};
