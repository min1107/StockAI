/**
 * 🕵️ DART 내부자(임원·주요주주) 거래 (docs/AI_ENGINE.md §9 — 정보우위)
 *
 * 임원·주요주주 특정증권등 소유상황보고(elestock)에서 최근 소유 증감을 집계.
 * "개미가 일일이 DART 뒤지기 귀찮은" 내부자 순매수/순매도 동향을 신호화한다.
 *   - 내부자 순매수 = 경영진이 자기 회사 주식을 사들임(긍정 신호)
 *   - 순매도 = 주의 신호
 * 정성평가(경영진·자본배분/지속성)의 근거로 score에 주입. 국내주식만.
 */

const axios = require('axios');
const { Redis } = require('@upstash/redis');
const { getCorpCode } = require('../../lib/dartCorpCode');

const DART = 'https://opendart.fss.or.kr/api';
const WINDOW_DAYS = 365;
const TTL_SEC = 3 * 24 * 60 * 60; // 3일

let redis = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
  }
} catch (_) {}
const withTimeout = (p, ms, fb) => Promise.race([p, new Promise(r => setTimeout(() => r(fb), ms))]);

const toInt = (v) => {
  if (v === undefined || v === null) return 0;
  const n = parseInt(String(v).replace(/[,\s]/g, ''), 10);
  return isFinite(n) ? n : 0;
};
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: '종목코드(code) 필요' });
    const stock = String(code).split('.')[0];
    if (!/^\d{6}$/.test(stock)) return res.status(400).json({ error: 'DART는 국내주식(6자리)만' });
    if (!process.env.DART_API_KEY) return res.status(503).json({ error: 'DART 미설정' });

    const corpCode = await getCorpCode(stock);
    if (!corpCode) return res.status(404).json({ error: 'corp_code 매핑 실패' });

    const cacheKey = `dart_insider_${corpCode}`;
    if (redis) {
      const cached = await withTimeout(redis.get(cacheKey), 4000, null);
      if (cached) return res.status(200).json(typeof cached === 'string' ? JSON.parse(cached) : cached);
    }

    // elestock는 날짜 파라미터가 없어 전체 이력을 받는다. 초대형주는 응답이 거대 →
    // 하드 타임아웃으로 함수 행 방지(미제공으로 우아하게 degrade).
    const data = await withTimeout(
      axios.get(`${DART}/elestock.json`, {
        params: { crtfc_key: process.env.DART_API_KEY, corp_code: corpCode },
        timeout: 12000, maxContentLength: 12 * 1024 * 1024,
      }).then(r => r.data).catch(() => null),
      13000, null,
    );

    if (!data || data.status !== '000' || !Array.isArray(data.list)) {
      const miss = { code: stock, corpCode, available: false, note: '내부자 거래 데이터 미제공(보고 없음 또는 응답 과대)' };
      if (redis && data === null) { try { await withTimeout(redis.set(cacheKey, miss, { ex: 6 * 60 * 60 }), 3000, null); } catch (_) {} }
      return res.status(200).json(miss);
    }

    const cutoff = ymd(new Date(Date.now() - WINDOW_DAYS * 86400000));
    const recent = data.list.filter(it => (it.rcept_dt || '').replace(/-/g, '') >= cutoff);

    let netChange = 0, buyers = 0, sellers = 0;
    const reports = [];
    for (const it of recent) {
      const chg = toInt(it.sp_stock_lmp_irds_cnt); // 소유 증감 수량
      if (chg > 0) buyers++; else if (chg < 0) sellers++;
      netChange += chg;
      if (reports.length < 5 && chg !== 0) {
        reports.push({
          who: (it.repror || '').trim(),
          role: (it.isu_exctv_ofcps || '').trim(),
          change: chg,
          date: it.rcept_dt || null,
        });
      }
    }

    const signal = recent.length === 0 ? '최근 보고 없음'
      : netChange > 0 ? '내부자 순매수'
      : netChange < 0 ? '내부자 순매도'
      : '변동 없음';

    const result = {
      code: stock,
      corpCode,
      available: recent.length > 0,
      windowDays: WINDOW_DAYS,
      reportCount: recent.length,
      buyers,
      sellers,
      netChange,
      signal,
      reports,
    };
    if (redis) { try { await withTimeout(redis.set(cacheKey, result, { ex: TTL_SEC }), 3000, null); } catch (_) {} }
    res.status(200).json(result);
  } catch (error) {
    console.error(`DART insider error [${req.query.code}]:`, error.message);
    res.status(500).json({ error: 'DART 내부자 거래 조회 실패' });
  }
};
