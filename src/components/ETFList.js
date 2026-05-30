import { FlatList, StyleSheet, Text, View } from 'react-native';

export default function ETFList({ etfs }) {
  if (!etfs || etfs.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>📊 관련 ETF</Text>
        <Text style={styles.noDataText}>ETF 데이터 로딩 중...</Text>
      </View>
    );
  }

  const getWeightChangeIcon = (change) => {
    if (change > 0) return '⬆';
    if (change < 0) return '⬇';
    return '➡';
  };

  const getWeightChangeColor = (change) => {
    if (change > 0) return '#00FF88';
    if (change < 0) return '#FF4466';
    return '#A0A0A0';
  };

  const getRankBadgeColor = (rank) => {
    if (rank === 1) return '#FFD700'; // 금색
    if (rank === 2) return '#C0C0C0'; // 은색
    if (rank === 3) return '#CD7F32'; // 동색
    return '#00D9FF'; // 기본
  };

  const renderETFCard = ({ item }) => {
    const changeColor = getWeightChangeColor(item.weightChange);
    const changeIcon = getWeightChangeIcon(item.weightChange);
    const isPositiveReturn = item.returnRate >= 0;

    return (
      <View style={styles.etfCard}>
        {/* ETF 이름 & 순위 */}
        <View style={styles.etfHeader}>
          <Text style={styles.etfName}>{item.name}</Text>
          <View style={[styles.rankBadge, { backgroundColor: getRankBadgeColor(item.rank) }]}>
            <Text style={styles.rankText}>{item.rank}위</Text>
          </View>
        </View>

        {/* 편입비중 */}
        <View style={styles.etfRow}>
          <Text style={styles.etfLabel}>편입비중</Text>
          <View style={styles.weightContainer}>
            <Text style={styles.weightValue}>{item.weight.toFixed(2)}%</Text>
            <Text style={[styles.weightChange, { color: changeColor }]}>
              {changeIcon} {item.weightChange > 0 ? '+' : ''}{item.weightChange.toFixed(2)}%
            </Text>
          </View>
        </View>

        {/* ETF 수익률 (당일) */}
        <View style={styles.etfRow}>
          <Text style={styles.etfLabel}>당일 수익률</Text>
          <Text style={[styles.returnValue, { color: isPositiveReturn ? '#00FF88' : '#FF4466' }]}>
            {isPositiveReturn ? '+' : ''}{item.returnRate.toFixed(2)}%
          </Text>
        </View>

        {/* 1개월 변동률 */}
        <View style={styles.etfRow}>
          <Text style={styles.etfLabel}>1개월 변동</Text>
          <Text style={[styles.returnValue, { color: item.oneMonthChange >= 0 ? '#00FF88' : '#FF4466' }]}>
            {item.oneMonthChange >= 0 ? '+' : ''}{item.oneMonthChange?.toFixed(2) || '0.00'}%
          </Text>
        </View>

        {/* 3개월 변동률 */}
        <View style={styles.etfRow}>
          <Text style={styles.etfLabel}>3개월 변동</Text>
          <Text style={[styles.returnValue, { color: item.threeMonthChange >= 0 ? '#00FF88' : '#FF4466' }]}>
            {item.threeMonthChange >= 0 ? '+' : ''}{item.threeMonthChange?.toFixed(2) || '0.00'}%
          </Text>
        </View>

        {/* 현재가 */}
        <View style={styles.etfRow}>
          <Text style={styles.etfLabel}>현재가</Text>
          <Text style={styles.priceValue}>₩{item.price.toLocaleString()}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📊 관련 ETF ({etfs.length}개)</Text>
      <FlatList
        data={etfs}
        renderItem={renderETFCard}
        keyExtractor={(item) => item.code}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1F3A',
    borderRadius: 12,
    padding: 20,
    marginVertical: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 15,
  },
  noDataText: {
    color: '#A0A0A0',
    textAlign: 'center',
    paddingVertical: 20,
  },
  etfCard: {
    backgroundColor: '#0A0E27',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2F4A',
  },
  etfHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2F4A',
  },
  etfName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
  },
  rankBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
  },
  etfRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  etfLabel: {
    fontSize: 14,
    color: '#A0A0A0',
  },
  weightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weightValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00D9FF',
    marginRight: 8,
  },
  weightChange: {
    fontSize: 13,
    fontWeight: '600',
  },
  returnValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  priceValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});