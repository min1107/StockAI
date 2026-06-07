const express = require('express');

const app = express();

// CORS - 모든 응답에 헤더 추가 (미들웨어 가장 먼저)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json());

// 핸들러 로드
const kisPrice = require('./kis/price');
const kisChart = require('./kis/chart');
const kisInvestor = require('./kis/investor');
const kisSearch = require('./kis/search');
const kisIntraday = require('./kis/intraday');
const kisEtf = require('./kis/etf');
const kisPrices = require('./kis/prices');
const kisWarmup = require('./kis/warmup');
const kisIndex = require('./kis/index');
const kisSectors = require('./kis/sectors');
const aiConservative = require('./ai/conservative');
const aiAggressive = require('./ai/aggressive');
const aiAnalyze = require('./ai/analyze');
const aiRecommend = require('./ai/recommend');
const aiPortfolio = require('./ai/portfolio');
const aiChat = require('./ai/chat');
const stocksSearch = require('./stocks/search');
const news = require('./news');
const macroCollect = require('./macro/collect');
const macroContext = require('./macro/context');
const marketOpportunity = require('./market/opportunity');
const cronNews = require('./cron/news');
const cronSupply = require('./cron/supply');
const cronScreen = require('./cron/screen');
const stocksDB = require('../lib/stocksDB');

// Vercel이 /api prefix를 붙이거나 제거할 수 있어서 둘 다 등록
const router = express.Router();

router.all('/kis/price', kisPrice);
router.all('/kis/chart', kisChart);
router.all('/kis/investor', kisInvestor);
router.all('/kis/search', kisSearch);
router.all('/kis/intraday', kisIntraday);
router.all('/kis/etf', kisEtf);
router.all('/kis/prices', kisPrices);
router.all('/kis/warmup', kisWarmup);
router.all('/kis/index', kisIndex);
router.all('/kis/sectors', kisSectors);
router.all('/ai/conservative', aiConservative);
router.all('/ai/aggressive', aiAggressive);
router.all('/ai/analyze', aiAnalyze);
router.all('/ai/recommend', aiRecommend);
router.all('/ai/portfolio', aiPortfolio);
router.all('/ai/chat', aiChat);
router.all('/stocks/search', stocksSearch);
router.all('/news', news);
router.all('/macro/collect', macroCollect);
router.all('/macro/context', macroContext);
router.all('/market/opportunity', marketOpportunity);
router.all('/cron/news', cronNews);
router.all('/cron/supply', cronSupply);
router.all('/cron/screen', cronScreen);

// /api prefix 있는 경우와 없는 경우 모두 처리
app.use('/api', router);
app.use('/', router);

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'StockAI Server Running' });
});

stocksDB.init();

module.exports = app;
