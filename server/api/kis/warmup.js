const { getAccessToken } = require('../../lib/kisAuth');

// 앱 시작 시 토큰을 먼저 발급/확인하는 엔드포인트
// 이걸 먼저 호출하면 이후 모든 API가 Redis 토큰을 재사용
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    await getAccessToken();
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: '토큰 준비 실패' });
  }
};
