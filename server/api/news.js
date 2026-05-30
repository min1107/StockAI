const axios = require('axios');

const NAVER_NEWS_URL = 'https://openapi.naver.com/v1/search/news.json';

const analyzeSentiment = (title, description) => {
  const text = `${title} ${description}`.toLowerCase();

  const positiveKeywords = [
    '상승', '호재', '성장', '개선', '증가', '최고', '성공', '호조', '긍정', '신고가',
    '돌파', '강세', '랠리', '급등', '반등', '회복', '확대', '실적', '수주', '투자',
    'rise', 'growth', 'increase', 'positive', 'success', 'boom', 'surge', 'rally',
  ];

  const negativeKeywords = [
    '하락', '악재', '감소', '하향', '손실', '우려', '리스크', '부정', '실패', '급락',
    '폭락', '약세', '부진', '적자', '위기', '조정', '매도', '이탈', '침체', '악화',
    'fall', 'decline', 'decrease', 'negative', 'loss', 'risk', 'concern', 'crisis',
  ];

  let score = 50;
  positiveKeywords.forEach(keyword => { if (text.includes(keyword)) score += 8; });
  negativeKeywords.forEach(keyword => { if (text.includes(keyword)) score -= 8; });

  return Math.max(0, Math.min(100, score));
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { symbol, name } = req.query;
    if (!name) return res.status(400).json({ error: '종목명(name) 필요' });

    const isKorean = symbol && (symbol.includes('.KS') || symbol.includes('.KQ'));
    const searchQuery = isKorean ? `${name} 주식` : name;

    const response = await axios.get(NAVER_NEWS_URL, {
      params: {
        query: searchQuery,
        display: 10,
        start: 1,
        sort: 'date',
      },
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
      },
    });

    const items = response.data.items || [];

    const news = items.slice(0, 5).map(item => {
      const cleanTitle = item.title.replace(/<\/?b>/g, '');
      const cleanDescription = item.description.replace(/<\/?b>/g, '');

      return {
        title: cleanTitle,
        summary: cleanDescription || '',
        url: item.link,
        source: item.originallink ? new URL(item.originallink).hostname : '네이버 뉴스',
        date: new Date(item.pubDate),
        sentiment: analyzeSentiment(cleanTitle, cleanDescription),
      };
    });

    res.status(200).json(news);
  } catch (error) {
    console.error('News API error:', error.message);
    res.status(200).json({ error: true, data: [] });
  }
};
