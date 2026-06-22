import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext';
import { setupNotifHandler } from './src/services/notificationService';
import { injectPWAMeta, registerServiceWorker, initInstallPrompt } from './src/services/webPush';

// react-native-web의 Alert.alert는 no-op(아무것도 안 함) → 웹에서 브라우저 대화상자로 대체.
// 이걸로 앱 전체의 성공/실패 배너 + 삭제 확인창(onPress 콜백)이 웹에서도 동작함.
if (Platform.OS === 'web') {
  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    if (Array.isArray(buttons) && buttons.length > 1) {
      const cancelBtn = buttons.find(b => b.style === 'cancel');
      const actionBtns = buttons.filter(b => b.style !== 'cancel');
      const ok = typeof window !== 'undefined' && window.confirm(text);
      if (ok) { actionBtns[actionBtns.length - 1]?.onPress?.(); }
      else { cancelBtn?.onPress?.(); }
    } else {
      if (typeof window !== 'undefined') window.alert(text);
      buttons?.[0]?.onPress?.();
    }
  };
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
      </GestureHandlerRootView>
    );
  }

  // 온보딩 완료 → 메인 앱
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <NavigationContainer>
          <MainTabs />
        </NavigationContainer>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
