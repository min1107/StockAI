import { FlatList, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function NewsList({ news }) {
  // 에러 상태 처리
  const isError = news && typeof news === 'object' && !Array.isArray(news) && news.error;
  const newsList = isError ? [] : (Array.isArray(news) ? news : []);

  if (isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>📰 최신 뉴스</Text>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>📡</Text>
          <Text style={styles.errorText}>뉴스를 불러올 수 없습니다</Text>
          <Text style={styles.errorSubText}>네트워크 연결을 확인하거나 잠시 후 다시 시도해주세요</Text>
        </View>
      </View>
    );
  }

  if (!newsList || newsList.length === 0) {
    // news 자체가 null/undefined면 아직 로딩 중, 빈 배열이면 뉴스 없음
    const isLoading = news === null || news === undefined;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>📰 최신 뉴스</Text>
        <Text style={styles.noDataText}>
          {isLoading ? '뉴스 로딩 중...' : '관련 뉴스가 없습니다'}
        </Text>
      </View>
    );
  }

  const getSentimentEmoji = (sentiment) => {
    if (sentiment >= 70) return '😊';
    if (sentiment >= 50) return '😐';
    return '😟';
  };

  const getSentimentColor = (sentiment) => {
    if (sentiment >= 70) return '#00FF88';
    if (sentiment >= 50) return '#FFD700';
    return '#FF4466';
  };

  const getSentimentText = (sentiment) => {
    if (sentiment >= 70) return '긍정';
    if (sentiment >= 50) return '중립';
    return '부정';
  };

  const getTimeAgo = (date) => {
    const now = new Date();
    const newsDate = new Date(date);
    const diffMs = now - newsDate;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}일 전`;
    if (diffHours > 0) return `${diffHours}시간 전`;
    return '방금 전';
  };

  const renderNewsCard = ({ item }) => {
    const sentimentColor = getSentimentColor(item.sentiment);
    const sentimentEmoji = getSentimentEmoji(item.sentiment);
    const hasUrl = !!item.url;

    const cardContent = (
      <View style={[styles.newsCard, hasUrl && styles.newsCardClickable]}>
        <Text style={styles.newsTitle} numberOfLines={2}>
          {item.title}
        </Text>

        <View style={styles.newsFooter}>
          <View style={styles.sentimentContainer}>
            <Text style={styles.sentimentEmoji}>{sentimentEmoji}</Text>
            <Text style={[styles.sentimentText, { color: sentimentColor }]}>
              {getSentimentText(item.sentiment)} ({item.sentiment}%)
            </Text>
          </View>
          <Text style={styles.timeText}>{getTimeAgo(item.date)}</Text>
        </View>

        {item.source && (
          <Text style={styles.sourceText}>{item.source}</Text>
        )}

        {item.summary && (
          <Text style={styles.newsSummary} numberOfLines={2}>
            {item.summary}
          </Text>
        )}

        {hasUrl && (
          <Text style={styles.readMoreText}>원문 보기 →</Text>
        )}
      </View>
    );

    if (hasUrl) {
      return (
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => Linking.openURL(item.url)}
        >
          {cardContent}
        </TouchableOpacity>
      );
    }
    return cardContent;
  };

  const displayList = newsList.slice(0, 3);
  const averageSentiment = displayList.reduce((sum, item) => sum + item.sentiment, 0) / displayList.length;
  const overallEmoji = getSentimentEmoji(averageSentiment);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📰 최신 뉴스</Text>
        <View style={styles.overallSentiment}>
          <Text style={styles.overallEmoji}>{overallEmoji}</Text>
          <Text style={[styles.overallText, { color: getSentimentColor(averageSentiment) }]}>
            {getSentimentText(averageSentiment)} ({Math.round(averageSentiment)}%)
          </Text>
        </View>
      </View>
      
      <FlatList
        data={displayList}
        renderItem={renderNewsCard}
        keyExtractor={(item, index) => index.toString()}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  overallSentiment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0E27',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  overallEmoji: {
    fontSize: 16,
    marginRight: 4,
  },
  overallText: {
    fontSize: 12,
    color: '#A0A0A0',
    fontWeight: '600',
  },
  noDataText: {
    color: '#A0A0A0',
    textAlign: 'center',
    paddingVertical: 20,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 25,
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  errorText: {
    color: '#FF8844',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  errorSubText: {
    color: '#657786',
    fontSize: 13,
    textAlign: 'center',
  },
  newsCard: {
    backgroundColor: '#0A0E27',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2F4A',
  },
  newsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
    lineHeight: 22,
  },
  newsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sentimentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sentimentEmoji: {
    fontSize: 18,
    marginRight: 6,
  },
  sentimentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 12,
    color: '#A0A0A0',
  },
  newsSummary: {
    fontSize: 13,
    color: '#A0A0A0',
    marginTop: 8,
    lineHeight: 18,
  },
  sourceText: {
    fontSize: 11,
    color: '#657786',
    marginTop: 6,
  },
  newsCardClickable: {
    borderColor: '#3A4F6A',
  },
  readMoreText: {
    fontSize: 12,
    color: '#00D9FF',
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'right',
  },
});