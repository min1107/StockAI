const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// API 핸들러
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
const cronNews = require('./cron/news');
const cronSupply = require('./cron/supply');
const cronScreen = require('./cron/screen');
const stocksDB = require('../lib/stocksDB');

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
app.all('/api/kis/sectors', kisSectors);

// AI API
app.all('/api/ai/conservative', aiConservative);
app.all('/api/ai/aggressive', aiAggressive);
app.all('/api/ai/analyze', aiAnalyze);
app.all('/api/ai/recommend', aiRecommend);
app.all('/api/ai/portfolio', aiPortfolio);
app.all('/api/ai/chat', aiChat);

// 기타 API
app.all('/api/stocks/search', stocksSearch);
app.all('/api/news', news);
app.all('/api/macro/collect', macroCollect);
app.all('/api/macro/context', macroContext);
app.all('/api/cron/news', cronNews);
app.all('/api/cron/supply', cronSupply);
app.all('/api/cron/screen', cronScreen);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'StockAI Server Running' });
});

// 종목 DB 초기 로딩
stocksDB.init();

module.exports = app;
