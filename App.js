import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, getStateFromPath, getPathFromState } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext';
import { setupNotifHandler } from './src/services/notificationService';
import { injectPWAMeta, registerServiceWorker, initInstallPrompt } from './src/services/webPush';
import AppAlert, { showAppAlert } from './src/components/AppAlert';

// react-native-web의 Alert.alert는 no-op → 앱 자체 커스텀 알림(AppAlert)으로 대체.
// (브라우저 기본 confirm/alert는 사이트 주소를 강제 노출 → 커스텀 모달로 깔끔하게)
if (Platform.OS === 'web') {
  Alert.alert = (title, message, buttons) => showAppAlert(title, message, buttons);
}
import HomeScreen from './src/screens/HomeScreen';
import StockDetailScreen from './src/screens/StockDetailScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import AuthScreen from './src/screens/AuthScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import OpportunityScreen from './src/screens/OpportunityScreen';
import SettingsScreen from './src/screens/SettingsScreen';

setupNotifHandler();

const ONBOARDING_DONE_KEY = '@StockAI:onboardingDone';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const stackScreenOptions = {
  headerStyle: { backgroundColor: '#1A1F3A' },
  headerTintColor: '#FFFFFF',
  headerTitleStyle: { fontWeight: 'bold' },
};

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="StockDetail" component={StockDetailScreen} options={{ title: '종목 상세' }} />
    </Stack.Navigator>
  );
}

function PortfolioStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Portfolio" component={PortfolioScreen} options={{ headerShown: false }} />
      <Stack.Screen name="StockDetail" component={StockDetailScreen} options={{ title: '종목 상세' }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ title: '로그인' }} />
    </Stack.Navigator>
  );
}

function OpportunityStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Opportunity" component={OpportunityScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OpportunityStockDetail" component={StockDetailScreen} options={{ title: '종목 상세' }} />
    </Stack.Navigator>
  );
}

function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ title: '로그인' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let icon;
          if (route.name === 'HomeTab') icon = focused ? 'home' : 'home-outline';
          else if (route.name === 'PortfolioTab') icon = focused ? 'briefcase' : 'briefcase-outline';
          else if (route.name === 'OpportunityTab') icon = focused ? 'flash' : 'flash-outline';
          else icon = focused ? 'settings' : 'settings-outline';
          return <Ionicons name={icon} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#00D9FF',
        tabBarInactiveTintColor: '#8A9BAE',
        tabBarStyle: {
          backgroundColor: '#1A1F3A',
          borderTopColor: '#2A3F5A',
          borderTopWidth: 1,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: '홈' }} />
      <Tab.Screen name="OpportunityTab" component={OpportunityStack} options={{ title: '발굴' }} />
      <Tab.Screen name="PortfolioTab" component={PortfolioStack} options={{ title: '포트폴리오' }} />
      <Tab.Screen name="SettingsTab" component={SettingsStack} options={{ title: '설정' }} />
    </Tab.Navigator>
  );
}

// 웹(PWA) 전용 딥링크/히스토리 연동.
// 이게 있어야 화면 이동이 브라우저 히스토리에 쌓여서, 안드로이드 시스템 뒤로가기가
// 앱을 나가지 않고 이전 화면으로 돌아간다. GitHub Pages 베이스 경로(/StockAI)를
// 커스텀 get*Path 로 붙였다/뗐다 해서 새로고침·딥링크 URL도 깨지지 않게 한다.
const BASE_PATH = '/StockAI';
const webLinking = Platform.OS === 'web' ? {
  prefixes: [
    'stockai://',
    (typeof window !== 'undefined' ? window.location.origin : 'https://min1107.github.io') + BASE_PATH,
  ],
  config: {
    screens: {
      HomeTab: { path: 'home', screens: { Home: '', StockDetail: 'stock/:symbol' } },
      OpportunityTab: { path: 'opportunity', screens: { Opportunity: '', OpportunityStockDetail: 'stock/:symbol' } },
      PortfolioTab: { path: 'portfolio', screens: { Portfolio: '', StockDetail: 'stock/:symbol', Auth: 'auth' } },
      SettingsTab: { path: 'settings', screens: { Settings: '', Auth: 'auth' } },
    },
  },
  getStateFromPath: (path, options) => {
    const stripped = path.startsWith(BASE_PATH) ? (path.slice(BASE_PATH.length) || '/') : path;
    return getStateFromPath(stripped, options);
  },
  getPathFromState: (state, options) => BASE_PATH + getPathFromState(state, options),
} : undefined;

export default function App() {
  const [onboardingDone, setOnboardingDone] = useState(null); // null = 로딩 중

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_DONE_KEY).then(value => {
      setOnboardingDone(value === 'done');
    });
    // 웹(PWA): manifest/Apple 메타 주입 + 서비스워커 등록
    injectPWAMeta();
    registerServiceWorker();
    initInstallPrompt(); // 안드로이드 설치 프롬프트 가로채기
  }, []);

  // 로딩 중 스플래시
  if (onboardingDone === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0E27', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#00D9FF" size="large" />
      </View>
    );
  }

  // 온보딩 미완료 → 온보딩 화면
  if (!onboardingDone) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <OnboardingScreen onComplete={() => setOnboardingDone(true)} />
        <AppAlert />
      </GestureHandlerRootView>
    );
  }

  // 온보딩 완료 → 메인 앱
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <NavigationContainer linking={webLinking}>
          <MainTabs />
        </NavigationContainer>
      </AuthProvider>
      <AppAlert />
    </GestureHandlerRootView>
  );
}
