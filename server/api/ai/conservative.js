const analyze = require('./analyze');

module.exports = (req, res) => {
  req.query.type = 'conservative';
  return analyze(req, res);
};
