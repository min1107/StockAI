const express = require('express');
const cors = require('cors');
const path = require('path');

// .env.local 로드
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const app = express();
app.use(cors());
app.use(express.json());

// API 핸들러 로드
const kisPrice = require('./api/kis/price');
const kisChart = require('./api/kis/chart');
const kisInvestor = require('./api/kis/investor');
const kisSearch = require('./api/kis/search');
const kisIntraday = require('./api/kis/intraday');
const kisEtf = require('./api/kis/etf');
const kisPrices = require('./api/kis/prices');
const kisWarmup = require('./api/kis/warmup');
const kisIndex = require('./api/kis/index');
const aiConservative = require('./api/ai/conservative');
const aiAggressive = require('./api/ai/aggressive');
const aiAnalyze = require('./api/ai/analyze');
const aiRecommend = require('./api/ai/recommend');
const aiPortfolio = require('./api/ai/portfolio');
const aiChat = require('./api/ai/chat');
const kisSectors = require('./api/kis/sectors');
const stocksSearch = require('./api/stocks/search');
const stocksDB = require('./lib/stocksDB');
const news = require('./api/news');
const macroCollect = require('./api/macro/collect');
const macroContext = require('./api/macro/context');
const cronNews = require('./api/cron/news');
const cronSupply = require('./api/cron/supply');
const cronScreen = require('./api/cron/screen');

// KIS API
app.all('/api/kis/price', kisPrice);
app.all('/api/kis/chart', kisChart);
app.all('/api/kis/investor', kisInvestor);
app.all('/api/kis/search', kisSearch);
app.all('/api/kis/intraday', kisIntraday);
app.all('/api/kis/etf', kisEtf);
app.all('/api/kis/prices', kisPrices);
app.all('/api/kis/warmup', kisWarmup);
app.all('/api/kis/index', kisIndex);

// AI API
app.all('/api/ai/conservative', aiConservative);
app.all('/api/ai/aggressive', aiAggressive);
app.all('/api/ai/analyze', aiAnalyze);
app.all('/api/ai/recommend', aiRecommend);
app.all('/api/ai/portfolio', aiPortfolio);
app.all('/api/ai/chat', aiChat);

// KIS 추가
app.all('/api/kis/sectors', kisSectors);

// Stocks API
app.all('/api/stocks/search', stocksSearch);

// News API
app.all('/api/news', news);

// Macro API
app.all('/api/macro/collect', macroCollect);
app.all('/api/macro/context', macroContext);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'StockAI Server Running' });
});

// 전체 종목 DB 초기 로딩
stocksDB.init();

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`StockAI Server running at http://0.0.0.0:${PORT}`);

  const fakeReq = { method: 'GET', headers: {} };

  // 서버 시작 시 즉시 수집
  macroCollect(fakeReq, null).catch(() => {});
  cronNews(fakeReq, null).catch(() => {});
  cronSupply(fakeReq, null).catch(() => {});
  cronScreen(fakeReq, null).catch(() => {});

  // 거시경제: 15분마다
  setInterval(() => macroCollect(fakeReq, null).catch(() => {}), 15 * 60 * 1000);
  // 뉴스: 1시간마다
  setInterval(() => cronNews(fakeReq, null).catch(() => {}), 60 * 60 * 1000);
  // 수급: 30분마다
  setInterval(() => cronSupply(fakeReq, null).catch(() => {}), 30 * 60 * 1000);
  // 스크리닝: 24시간마다
  setInterval(() => cronScreen(fakeReq, null).catch(() => {}), 24 * 60 * 60 * 1000);
  console.log(`Mobile access: http://192.168.219.117:${PORT}`);
  console.log('');
  console.log('API Keys loaded:', {
    KIS: process.env.KIS_APP_KEY ? 'OK' : 'MISSING',
    GROQ: process.env.GROQ_API_KEY ? 'OK' : 'MISSING',
    NAVER_ID: process.env.NAVER_CLIENT_ID ? 'OK' : 'MISSING',
    NAVER_SECRET: process.env.NAVER_CLIENT_SECRET ? 'OK' : 'MISSING',
  });
});
