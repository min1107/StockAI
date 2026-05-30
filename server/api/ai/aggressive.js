const analyze = require('./analyze');

module.exports = (req, res) => {
  req.query.type = 'aggressive';
  return analyze(req, res);
};
