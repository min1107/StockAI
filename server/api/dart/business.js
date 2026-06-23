/**
 * 📑 DART 사업보고서 "사업의 개요" 추출 (P3-c — 정성평가 1차 근거의 최상위)
 *
 * 흐름:
 *   1. corp_code → list.json 으로 최신 정기보고서(사업보고서 우선) rcept_no
 *   2. document.xml(zip) 다운 → 본문 XML(UTF-8) → "사업의 개요" 섹션 추출
 *   3. 태그 제거·정제 후 요약 텍스트 반환 (해자·산업 판단의 근거 원문)
 *
 * 비용: 본문이 수 MB라 무겁다 → 추출 결과를 rcept_no 기준 Redis 캐시(분기 단위 갱신).
 * 8MB 문자열엔 절대 복잡한 정규식을 돌리지 않고 indexOf+slice 로 좁힌 뒤 정제한다.
 */

const axios = require('axios');
const AdmZip = require('adm-zip');
const { Redis } = require('@upstash/redis');
const { getCorpCode } = require('../../lib/dartCorpCode');

const DART = 'https://opendart.fss.or.kr/api';
const BIZ_TTL = 30 * 24 * 60 * 60; // 30일 (보고서는 분기 단위 갱신)
const MAX_LEN = 2500;              // AI 프롬프트용 발췌 상한

let redis = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
  }
} catch (_) {}

const withTimeout = (p, ms, fb) => Promise.race([p, new Promise(r => setTimeout(() => r(fb), ms))]);

// YYYYMMDD (n년 전)
function yearsAgo(n) {
  const d = new Date(); d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// 최신 정기보고서 찾기 (사업보고서 우선, 없으면 반기/분기)
async function findLatestReport(corpCode) {
  const data = await axios.get(`${DART}/list.json`, {
    params: { crtfc_key: process.env.DART_API_KEY, corp_code: corpCode, bgn_de: yearsAgo(2), pblntf_ty: 'A', page_count: 30, sort: 'date', sort_mth: 'desc' },
    timeout: 12000,
  }).then(r => r.data).catch(() => null);

  const list = (data && data.status === '000' && Array.isArray(data.list)) ? data.list : [];
  if (!list.length) return null;
  // 정정신고('[기재정정]') 포함 명칭에서도 '사업보고서' 우선
  return list.find(it => /사업보고서/.test(it.report_nm))
      || list.find(it => /반기보고서/.test(it.report_nm))
      || list.find(it => /분기보고서/.test(it.report_nm))
      || list[0];
}

// 슬라이스를 태그 제거·정제
function clean(slice) {
  return slice
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z]+;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 본문 XML에서 "사업의 개요" 섹션 추출 → 정제 텍스트
function extractBusinessOverview(doc) {
  // "사업의 개요"는 목차(대시·다음섹션 나열)에도 나오므로, 산문 본문 occurrence를 골라야 한다.
  const kw = doc.indexOf('사업의 개요') !== -1 ? '사업의 개요' : '사업의 내용';
  const candidates = [];
  let i = 0;
  while ((i = doc.indexOf(kw, i)) !== -1 && candidates.length < 8) {
    candidates.push(i); i += kw.length;
  }
  if (!candidates.length) return null;

  // 각 후보의 다음 텍스트를 정제해, 목차(대시 나열/'주요 제품 및 서비스'로 바로 이어짐)는 제외하고
  // 한글 산문이 가장 풍부한 것을 채택.
  let best = null, bestScore = -1;
  for (const start of candidates) {
    const text = clean(doc.slice(start, start + 6000));
    const after = text.slice(0, 400);
    const isToc = /-{4,}/.test(after) || /개요\s*[\d.]*\s*주요\s*제품/.test(after.replace(/\s/g, ' '));
    if (isToc) continue;
    const koreanProse = (after.match(/[가-힣]/g) || []).length; // 한글 밀도
    const hasNarr = /당사|회사는|영위|구성된|생산|판매|제공/.test(after) ? 200 : 0;
    const score = koreanProse + hasNarr;
    if (score > bestScore) { bestScore = score; best = text; }
  }
  if (!best) return null; // 전부 목차로 판단되면 추출 실패
  return best.length > MAX_LEN ? best.slice(0, MAX_LEN) + '…' : best;
}

/**
 * 사업의 개요 요약을 반환하는 재사용 함수 (HTTP 핸들러 + recommend.js 발굴소개 공용).
 * @returns {Promise<{ok:true,...}|{ok:false,error:string,status:number}>}
 */
async function getBusinessSummary(code) {
  const stock = String(code || '').split('.')[0];
  if (!/^\d{6}$/.test(stock)) return { ok: false, error: 'DART는 국내주식(6자리)만 제공', status: 400 };
  if (!process.env.DART_API_KEY) return { ok: false, error: 'DART 미설정', status: 503 };

  const corpCode = await getCorpCode(stock);
  if (!corpCode) return { ok: false, error: 'corp_code 매핑 실패', status: 404 };

  const report = await findLatestReport(corpCode);
  if (!report) return { ok: false, error: '정기보고서 없음', status: 404 };
  const rceptNo = report.rcept_no;

  // 추출 결과 캐시 (rcept_no 기준)
  const cacheKey = `dart_biz2_${rceptNo}`;
  if (redis) {
    const cached = await withTimeout(redis.get(cacheKey), 4000, null);
    if (cached && cached.businessSummary) return { ok: true, ...cached };
  }

  // 문서 다운로드 → 본문 추출
  const resp = await axios.get(`${DART}/document.xml`, {
    params: { crtfc_key: process.env.DART_API_KEY, rcept_no: rceptNo },
    responseType: 'arraybuffer', timeout: 30000,
  });
  const zip = new AdmZip(Buffer.from(resp.data));
  const entries = zip.getEntries();
  if (!entries.length) return { ok: false, error: '문서 비어있음', status: 502 };
  // 본문은 보통 첨부(_NNNNN.xml 재무제표)보다 가장 큰 메인 파일
  const main = entries.reduce((a, b) => (b.header.size > a.header.size ? b : a), entries[0]);
  const doc = main.getData().toString('utf8');

  const businessSummary = extractBusinessOverview(doc);
  if (!businessSummary) return { ok: false, error: '사업의 개요 섹션을 찾지 못함', status: 502, rceptNo };

  const result = {
    code: stock,
    rceptNo,
    reportName: (report.report_nm || '').trim(),
    asOf: report.rcept_dt || null,
    businessSummary,
  };

  if (redis) {
    try { await withTimeout(redis.set(cacheKey, result, { ex: BIZ_TTL }), 4000, null); } catch (_) {}
  }
  return { ok: true, ...result };
}

const handler = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: '종목코드(code) 필요' });
    const r = await getBusinessSummary(code);
    if (!r.ok) return res.status(r.status || 500).json({ error: r.error, rceptNo: r.rceptNo });
    const { ok, status, ...payload } = r;
    res.status(200).json(payload);
  } catch (error) {
    console.error(`DART business error [${req.query.code}]:`, error.message);
    res.status(500).json({ error: 'DART 사업보고서 조회 실패' });
  }
};

module.exports = handler;
module.exports.getBusinessSummary = getBusinessSummary;
