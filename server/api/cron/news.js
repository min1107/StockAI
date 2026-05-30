/**
 * 시장 뉴스 수집 엔드포인트
 * - Vercel Cron: 1시간마다 자동 호출
 * - 네이버 뉴스 API로 증시 관련 키워드 뉴스 수집
 * - 수집 결과 → Redis 캐시 → AI 프롬프트 주입
 */

const axios = require('axios');
const { setNews } = require('../../lib/newsCache');

const KEYWORDS = ['코스피 증시', '코스닥 증시', '외국인 매매', '기관 순매수', '반도체 주가', '2차전지 주식'];

function cleanTag(str) {
  return (str || '').replace(/<\/?b>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
}

async function fetchNaverNews(query) {
  const res = await axios.get('https://openapi.naver.com/v1/search/news.json', {
    params: { query, display: 5, sort: 'date' },
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
    },
    timeout: 6000,
  });
  return (res.data.items || []).map(item => ({
    title: cleanTag(item.title),
    summary: cleanTag(item.description),
    pubDate: item.pubDate,
    keyword: query,
  }));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    return res.status(200).json({ ok: false, message: '네이버 API 키 미설정' });
  }

  try {
    console.log('📰 시장 뉴스 수집 시작...');

    const results = await Promise.allSettled(KEYWORDS.map(fetchNaverNews));

    // 모든 뉴스 합치기, 중복 제거, 최신순 정렬
    const seen = new Set();
    const allNews = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const item of r.value) {
        if (!seen.has(item.title)) {
          seen.add(item.title);
          allNews.push(item);
        }
      }
    }

    allNews.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    const news = allNews.slice(0, 15);

    await setNews({ items: news, count: news.length });

    console.log(`✅ 시장 뉴스 수집 완료: ${news.length}건`);

    if (res) res.status(200).json({ ok: true, count: news.length, collectedAt: new Date().toISOString() });
  } catch (error) {
    console.error('❌ 뉴스 수집 실패:', error.message);
    if (res) res.status(500).json({ error: error.message });
  }
};
