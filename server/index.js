const express = require('express');

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json());

const router = express.Router();

router.all('/kis/price',       require('./api/kis/price'));
router.all('/kis/chart',       require('./api/kis/chart'));
router.all('/kis/investor',    require('./api/kis/investor'));
router.all('/kis/search',      require('./api/kis/search'));
router.all('/kis/intraday',    require('./api/kis/intraday'));
router.all('/kis/etf',         require('./api/kis/etf'));
router.all('/kis/prices',      require('./api/kis/prices'));
router.all('/kis/warmup',      require('./api/kis/warmup'));
router.all('/kis/index',       require('./api/kis/index'));
router.all('/kis/sectors',     require('./api/kis/sectors'));
router.all('/ai/conservative', require('./api/ai/conservative'));
router.all('/ai/aggressive',   require('./api/ai/aggressive'));
router.all('/ai/analyze',      require('./api/ai/analyze'));
router.all('/ai/recommend',    require('./api/ai/recommend'));
router.all('/ai/portfolio',    require('./api/ai/portfolio'));
router.all('/ai/chat',         require('./api/ai/chat'));
router.all('/ai/ocr-portfolio', require('./api/ai/ocr-portfolio'));
router.all('/market/opportunity', require('./api/market/opportunity'));
router.all('/stocks/search',   require('./api/stocks/search'));
router.all('/news',            require('./api/news'));
router.all('/macro/collect',   require('./api/macro/collect'));
router.all('/macro/context',   require('./api/macro/context'));
router.all('/cron/news',       require('./api/cron/news'));
router.all('/cron/supply',     require('./api/cron/supply'));
router.all('/cron/screen',     require('./api/cron/screen'));
router.all('/debug/cache',     require('./api/debug/cache'));

app.use('/api', router);
app.use('/', router);

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'StockAI Server Running' });
});

try { require('./lib/stocksDB').init(); } catch (e) {}

module.exports = app;
