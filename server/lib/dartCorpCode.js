/**
 * 🔑 DART corp_code 매핑 (P3-b 선행 요소)
 *
 * DART 모든 API는 8자리 corp_code를 요구하지만 앱은 6자리 종목코드만 안다.
 * 매핑 방법은 DART가 제공하는 bulk corpCode.xml(zip) 뿐 → 1회 받아 파싱해서
 * { 종목코드: corp_code } 맵을 만들고 Redis+메모리에 캐시한다(분기 단위로 거의 불변).
 */

const axios = require('axios');
const AdmZip = require('adm-zip');
const { Redis } = require('@upstash/redis');

const MAP_KEY = 'dart_corp_map_v2'; // v2: 중복 종목코드는 modify_date 최신(=현재 상장사) 채택
const MAP_TTL = 7 * 24 * 60 * 60; // 7일

let redis = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (_) { /* Redis 없으면 메모리 캐시만 */ }

let memMap = null;        // { '005930': '00126380', ... }
let memMapAt = 0;
const MEM_TTL = 6 * 60 * 60 * 1000; // 같은 인스턴스 6시간

// Redis 작업이 막혀도 함수가 행하지 않도록 타임아웃으로 감싼다
const withTimeout = (p, ms, fallback) => Promise.race([
  p,
  new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
]);

// corpCode.xml(zip) 다운로드 → 상장 종목(stock_code 6자리)만 추출
async function downloadCorpMap() {
  const key = process.env.DART_API_KEY;
  if (!key) throw new Error('DART_API_KEY 미설정');

  const resp = await axios.get('https://opendart.fss.or.kr/api/corpCode.xml', {
    params: { crtfc_key: key },
    responseType: 'arraybuffer',
    timeout: 30000,
  });

  const zip = new AdmZip(Buffer.from(resp.data));
  const entry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('.xml'));
  if (!entry) throw new Error('corpCode.xml 엔트리 없음');
  const xml = entry.getData().toString('utf8');

  // <list> 블록 단위로 쪼갠 뒤 블록 안에서만 추출 (전체 백트래킹 방지).
  // 비상장 항목은 stock_code가 비어 있으므로 6자리 매칭만 채택한다.
  // 같은 종목코드가 중복되면(상폐 후 재사용) modify_date가 최신인 항목 = 현재 상장사.
  const map = {};      // stock_code → corp_code
  const seenDate = {}; // stock_code → 채택된 항목의 modify_date
  const blocks = xml.split('</list>');
  for (const b of blocks) {
    const sc = b.match(/<stock_code>\s*(\d{6})\s*<\/stock_code>/);
    if (!sc) continue;
    const cc = b.match(/<corp_code>\s*(\d{8})\s*<\/corp_code>/);
    if (!cc) continue;
    const md = (b.match(/<modify_date>\s*(\d{8})\s*<\/modify_date>/) || [])[1] || '0';
    const stock = sc[1];
    if (!(stock in map) || md > (seenDate[stock] || '0')) {
      map[stock] = cc[1];
      seenDate[stock] = md;
    }
  }
  return map;
}

async function getCorpMap() {
  // ① 메모리
  if (memMap && Date.now() - memMapAt < MEM_TTL) return memMap;

  // ② Redis (5초 타임아웃 — 막히면 다운로드로)
  if (redis) {
    try {
      const cached = await withTimeout(redis.get(MAP_KEY), 5000, null);
      if (cached && typeof cached === 'object' && Object.keys(cached).length > 100) {
        memMap = cached; memMapAt = Date.now();
        return memMap;
      }
    } catch (_) { /* 무시하고 재다운로드 */ }
  }

  // ③ 다운로드 + 캐시 (메모리캐시는 즉시, Redis 저장은 5초 타임아웃 — 막혀도 응답 진행)
  const map = await downloadCorpMap();
  memMap = map; memMapAt = Date.now();
  if (redis) {
    try { await withTimeout(redis.set(MAP_KEY, map, { ex: MAP_TTL }), 5000, null); } catch (_) {}
  }
  return map;
}

/** 6자리 종목코드 → 8자리 corp_code (없으면 null) */
async function getCorpCode(stockCode) {
  const code = String(stockCode || '').split('.')[0];
  if (!/^\d{6}$/.test(code)) return null;
  const map = await getCorpMap();
  return map[code] || null;
}

module.exports = { getCorpCode, getCorpMap };
