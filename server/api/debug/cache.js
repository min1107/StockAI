const { getNewsForAI, getSupplyForAI } = require('../macro/context');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const [newsText, supplyText] = await Promise.all([getNewsForAI(), getSupplyForAI()]);
  res.status(200).json({ newsText, supplyText });
};
