import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function AuthScreen({ navigation }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;

  const switchMode = (next) => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start();
    setMode(next);
    setPassword('');
    setPasswordConfirm('');
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('입력 오류', '이메일과 비밀번호를 입력해주세요.');
      return;
    }
    if (mode === 'signup') {
      if (password.length < 6) {
        Alert.alert('비밀번호 오류', '비밀번호는 6자 이상이어야 합니다.');
        return;
      }
      if (password !== passwordConfirm) {
        Alert.alert('비밀번호 불일치', '비밀번호가 일치하지 않습니다.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
        navigation.goBack();
      } else {
        await signUp(email.trim(), password);
        Alert.alert(
          '회원가입 완료 🎉',
          '가입이 완료되었습니다!\n이제 로그인하세요.',
          [{ text: '로그인하기', onPress: () => switchMode('login') }]
        );
      }
    } catch (error) {
      const msg = error.message?.includes('Invalid login') || error.message?.includes('invalid_credentials')
        ? '이메일 또는 비밀번호가 올바르지 않습니다.'
        : error.message?.includes('already registered') || error.message?.includes('already been registered')
        ? '이미 가입된 이메일입니다.'
        : error.message?.includes('Email not confirmed') || error.message?.includes('email_not_confirmed')
        ? '이메일 인증이 완료되지 않았습니다.\n가입 시 발송된 이메일을 확인해주세요.\n\n(또는 Supabase 대시보드에서 이메일 인증을 비활성화하세요.)'
        : error.message || '오류가 발생했습니다.';
      Alert.alert('로그인 실패', msg);
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === 'login';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 로고 */}
        <View style={styles.logoArea}>
          <View style={styles.logoIconBox}>
            <Text style={styles.logoIcon}>📈</Text>
          </View>
          <Text style={styles.logoTitle}>StockAI</Text>
          <Text style={styles.logoSub}>AI 기반 주식 분석 플랫폼</Text>
        </View>

        {/* 탭 선택 */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, isLogin && styles.tabBtnActive]}
            onPress={() => switchMode('login')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBtnText, isLogin && styles.tabBtnTextActive]}>
              로그인
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, !isLogin && styles.tabBtnActiveGreen]}
            onPress={() => switchMode('signup')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBtnText, !isLogin && styles.tabBtnTextActiveGreen]}>
              회원가입
            </Text>
          </TouchableOpacity>
        </View>

        {/* 폼 카드 */}
        <Animated.View style={[
          styles.card,
          isLogin ? styles.cardLogin : styles.cardSignup,
          { opacity: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) },
        ]}>
          {/* 카드 헤더 */}
          <View style={styles.cardHeader}>
            <View style={[styles.cardAccent, { backgroundColor: isLogin ? '#00D9FF' : '#00FF88' }]} />
            <View>
              <Text style={styles.cardTitle}>
                {isLogin ? '다시 오셨군요!' : '새로 시작해볼까요?'}
              </Text>
              <Text style={styles.cardSubtitle}>
                {isLogin
                  ? '계속하려면 로그인하세요'
                  : '무료로 계정을 만들어보세요'}
              </Text>
            </View>
          </View>

          {/* 이메일 */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>이메일</Text>
            <View style={styles.inputBox}>
              <Text style={styles.inputIcon}>✉</Text>
              <TextInput
                style={styles.input}
                placeholder="example@email.com"
                placeholderTextColor="#4A5568"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
          </View>

          {/* 비밀번호 */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>비밀번호{!isLogin && ' (6자 이상)'}</Text>
            <View style={styles.inputBox}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={styles.input}
                placeholder={isLogin ? '비밀번호 입력' : '6자 이상 입력'}
                placeholderTextColor="#4A5568"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 비밀번호 확인 (회원가입만) */}
          {!isLogin && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>비밀번호 확인</Text>
              <View style={[
                styles.inputBox,
                passwordConfirm.length > 0 && {
                  borderColor: password === passwordConfirm ? '#00FF88' : '#FF4466',
                },
              ]}>
                <Text style={styles.inputIcon}>🔒</Text>
                <TextInput
                  style={styles.input}
                  placeholder="비밀번호 재입력"
                  placeholderTextColor="#4A5568"
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  secureTextEntry={!showPassword}
                />
                {passwordConfirm.length > 0 && (
                  <Text style={{ fontSize: 16 }}>
                    {password === passwordConfirm ? '✅' : '❌'}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* 제출 버튼 */}
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: isLogin ? '#00D9FF' : '#00FF88' }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#0A0E27" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isLogin ? '로그인' : '회원가입 완료'}
              </Text>
            )}
          </TouchableOpacity>

          {/* 하단 안내 */}
          {isLogin && (
            <View style={styles.hintRow}>
              <Text style={styles.hintText}>처음이신가요?  </Text>
              <TouchableOpacity onPress={() => switchMode('signup')}>
                <Text style={styles.hintLink}>회원가입 →</Text>
              </TouchableOpacity>
            </View>
          )}
          {!isLogin && (
            <View style={styles.hintRow}>
              <Text style={styles.hintText}>이미 계정이 있으신가요?  </Text>
              <TouchableOpacity onPress={() => switchMode('login')}>
                <Text style={[styles.hintLink, { color: '#00D9FF' }]}>로그인 →</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        {/* 회원가입 안내 */}
        {!isLogin && (
          <View style={styles.termsBox}>
            <Text style={styles.termsText}>
              가입 시 <Text style={styles.termsLink}>이용약관</Text> 및{' '}
              <Text style={styles.termsLink}>개인정보처리방침</Text>에 동의합니다.
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },

  // 로고
  logoArea: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoIconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#161B35',
    borderWidth: 1,
    borderColor: '#252A47',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoIcon: { fontSize: 40 },
  logoTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  logoSub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
  },

  // 탭
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#161B35',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#252A47',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: '#00D9FF20',
    borderWidth: 1,
    borderColor: '#00D9FF50',
  },
  tabBtnActiveGreen: {
    backgroundColor: '#00FF8820',
    borderWidth: 1,
    borderColor: '#00FF8850',
  },
  tabBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4A5568',
  },
  tabBtnTextActive: {
    color: '#00D9FF',
    fontWeight: '700',
  },
  tabBtnTextActiveGreen: {
    color: '#00FF88',
    fontWeight: '700',
  },

  // 카드
  card: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
  },
  cardLogin: {
    backgroundColor: '#161B35',
    borderColor: '#00D9FF30',
  },
  cardSignup: {
    backgroundColor: '#161B35',
    borderColor: '#00FF8830',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 24,
  },
  cardAccent: {
    width: 4,
    height: 40,
    borderRadius: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 3,
  },

  // 인풋
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8892A4',
    marginBottom: 7,
    letterSpacing: 0.5,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1128',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#252A47',
    paddingHorizontal: 14,
    paddingVertical: 2,
    gap: 10,
  },
  inputIcon: { fontSize: 16 },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 14,
  },
  eyeBtn: { padding: 4 },
  eyeIcon: { fontSize: 16 },

  // 제출
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  submitBtnText: {
    color: '#0A0E27',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // 하단
  hintRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintText: { fontSize: 13, color: '#6B7280' },
  hintLink: { fontSize: 13, color: '#00FF88', fontWeight: '700' },

  // 약관
  termsBox: {
    marginTop: 20,
    alignItems: 'center',
  },
  termsText: { fontSize: 11, color: '#4A5568', textAlign: 'center', lineHeight: 18 },
  termsLink: { color: '#6B7280', textDecorationLine: 'underline' },
});
