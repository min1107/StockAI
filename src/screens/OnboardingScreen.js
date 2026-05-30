import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import { SECTORS } from '../data/onboardingStocks';

const FAVORITES_STORAGE_KEY = '@StockAI:favorites';
const ONBOARDING_DONE_KEY = '@StockAI:onboardingDone';

export default function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState(1); // 1: 분야 선택, 2: 종목 선택
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [selectedStocks, setSelectedStocks] = useState([]);

  const toggleSector = (sectorId) => {
    setSelectedSectors(prev =>
      prev.includes(sectorId)
        ? prev.filter(id => id !== sectorId)
        : [...prev, sectorId]
    );
  };

  const toggleStock = (stock) => {
    setSelectedStocks(prev => {
      const exists = prev.some(s => s.symbol === stock.symbol);
      return exists
        ? prev.filter(s => s.symbol !== stock.symbol)
        : [...prev, stock];
    });
  };

  const goToStep2 = () => {
    // 분야 선택 없이도 넘어갈 수 있게 (건너뛰기)
    setStep(2);
  };

  const handleComplete = async () => {
    try {
      if (selectedStocks.length > 0) {
        await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(selectedStocks));
      }
      await AsyncStorage.setItem(ONBOARDING_DONE_KEY, 'done');
      onComplete();
    } catch (e) {
      console.error('온보딩 저장 실패:', e);
      onComplete(); // 실패해도 메인으로 진입
    }
  };

  const selectedSectorData = SECTORS.filter(s => selectedSectors.includes(s.id));

  // ── Step 1: 분야 선택 ──────────────────────────────────────
  if (step === 1) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, styles.stepDotActive]} />
            <View style={styles.stepLine} />
            <View style={styles.stepDot} />
          </View>

          <Text style={styles.title}>관심 분야를 선택해주세요</Text>
          <Text style={styles.subtitle}>선택한 분야의 대표 종목을 추천해드려요{'\n'}나중에 언제든지 변경할 수 있어요</Text>

          <View style={styles.sectorGrid}>
            {SECTORS.map(sector => {
              const isSelected = selectedSectors.includes(sector.id);
              return (
                <TouchableOpacity
                  key={sector.id}
                  style={[
                    styles.sectorCard,
                    isSelected && { borderColor: sector.color, backgroundColor: sector.color + '18' },
                  ]}
                  onPress={() => toggleSector(sector.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sectorIcon}>{sector.icon}</Text>
                  <Text style={[styles.sectorLabel, isSelected && { color: sector.color }]}>
                    {sector.label}
                  </Text>
                  {isSelected && (
                    <View style={[styles.checkBadge, { backgroundColor: sector.color }]}>
                      <Text style={styles.checkText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.skipBtn} onPress={goToStep2}>
            <Text style={styles.skipText}>건너뛰기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.nextBtn, selectedSectors.length === 0 && styles.nextBtnDisabled]}
            onPress={goToStep2}
          >
            <Text style={styles.nextText}>
              {selectedSectors.length > 0 ? `다음 (${selectedSectors.length}개 선택)` : '다음'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Step 2: 종목 선택 ──────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.stepIndicator}>
          <TouchableOpacity onPress={() => setStep(1)}>
            <View style={[styles.stepDot, styles.stepDotDone]} />
          </TouchableOpacity>
          <View style={[styles.stepLine, styles.stepLineDone]} />
          <View style={[styles.stepDot, styles.stepDotActive]} />
        </View>

        <Text style={styles.title}>관심 종목을 선택해주세요</Text>
        <Text style={styles.subtitle}>선택한 종목이 홈 화면에 바로 표시돼요</Text>

        {selectedSectorData.length === 0 ? (
          // 분야를 선택하지 않은 경우 전체 종목 보여주기
          SECTORS.map(sector => (
            <SectorStockGroup
              key={sector.id}
              sector={sector}
              selectedStocks={selectedStocks}
              onToggle={toggleStock}
            />
          ))
        ) : (
          selectedSectorData.map(sector => (
            <SectorStockGroup
              key={sector.id}
              sector={sector}
              selectedStocks={selectedStocks}
              onToggle={toggleStock}
            />
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.skipBtn} onPress={handleComplete}>
          <Text style={styles.skipText}>건너뛰기</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextBtn, selectedStocks.length === 0 && styles.nextBtnDisabled]}
          onPress={handleComplete}
        >
          <Text style={styles.nextText}>
            {selectedStocks.length > 0
              ? `시작하기 (${selectedStocks.length}개 선택)`
              : '시작하기'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function SectorStockGroup({ sector, selectedStocks, onToggle }) {
  return (
    <View style={styles.sectorGroup}>
      <View style={styles.sectorGroupHeader}>
        <Text style={styles.sectorGroupIcon}>{sector.icon}</Text>
        <Text style={[styles.sectorGroupLabel, { color: sector.color }]}>{sector.label}</Text>
      </View>
      {sector.stocks.map(stock => {
        const isSelected = selectedStocks.some(s => s.symbol === stock.symbol);
        return (
          <TouchableOpacity
            key={stock.symbol}
            style={[
              styles.stockRow,
              isSelected && { borderColor: sector.color, backgroundColor: sector.color + '12' },
            ]}
            onPress={() => onToggle(stock)}
            activeOpacity={0.7}
          >
            <View style={styles.stockRowLeft}>
              <Text style={styles.stockRowName}>{stock.name}</Text>
              <Text style={styles.stockRowSymbol}>{stock.symbol}</Text>
            </View>
            <View style={[
              styles.stockCheckCircle,
              isSelected && { backgroundColor: sector.color, borderColor: sector.color },
            ]}>
              {isSelected && <Text style={styles.stockCheckMark}>✓</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 40,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 36,
    alignSelf: 'center',
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2A3F5A',
  },
  stepDotActive: {
    backgroundColor: '#00D9FF',
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  stepDotDone: {
    backgroundColor: '#00FF88',
  },
  stepLine: {
    width: 60,
    height: 2,
    backgroundColor: '#2A3F5A',
    marginHorizontal: 8,
  },
  stepLineDone: {
    backgroundColor: '#00FF88',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#8A9BAE',
    lineHeight: 22,
    marginBottom: 32,
  },
  // 분야 그리드
  sectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sectorCard: {
    width: '47%',
    backgroundColor: '#1A1F3A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#2A3F5A',
    alignItems: 'center',
    position: 'relative',
  },
  sectorIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  sectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // 종목 선택
  sectorGroup: {
    marginBottom: 28,
  },
  sectorGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectorGroupIcon: {
    fontSize: 20,
  },
  sectorGroupLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1F3A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#2A3F5A',
  },
  stockRowLeft: {
    flex: 1,
  },
  stockRowName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  stockRowSymbol: {
    fontSize: 12,
    color: '#8A9BAE',
    marginTop: 2,
  },
  stockCheckCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#2A3F5A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stockCheckMark: {
    color: '#000',
    fontSize: 13,
    fontWeight: 'bold',
  },
  // 하단 버튼
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 20,
    paddingBottom: 36,
    backgroundColor: '#0A0E27',
    borderTopWidth: 1,
    borderTopColor: '#1A1F3A',
    gap: 12,
  },
  skipBtn: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  skipText: {
    color: '#8A9BAE',
    fontSize: 15,
  },
  nextBtn: {
    flex: 1,
    backgroundColor: '#00D9FF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextBtnDisabled: {
    backgroundColor: '#1A2F4A',
  },
  nextText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
