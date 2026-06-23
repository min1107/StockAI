const axios = require('axios');
const Groq = require('groq-sdk');
const { Redis } = require('@upstash/redis');
const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');
const { getMacroForAI, getNewsForAI, getSupplyForAI } = require('../macro/context');
const { getScreenCandidates } = require('../../lib/screenCache');
const { getUniverseDistribution, percentileOf } = require('../../lib/universeCache');
const { scoreValuation, scoreQuality, detectGuards, toRecommendation } = require('../../lib/scoreEngine');
const { getBusinessSummary } = require('../dart/business');

let redis = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (_) {}

const CACHE_KEY = 'ai_recommend_v3';
const CACHE_TTL = 60 * 60; // 1시간

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── 70개 다양성 종목 풀 ──────────────────────────────────────────────
const STOCK_POOL = [
  // 반도체 대형
  { code: '005930', name: '삼성전자',        market: 'KS', sector: '반도체' },
  { code: '000660', name: 'SK하이닉스',      market: 'KS', sector: '반도체' },

  // 반도체 소부장 (덜 알려진 강소기업)
  { code: '042700', name: '한미반도체',      market: 'KS', sector: '반도체장비' },
  { code: '058470', name: '리노공업',        market: 'KS', sector: '반도체소재' },
  { code: '357780', name: '솔브레인',        market: 'KS', sector: '반도체소재' },
  { code: '064760', name: '티씨케이',        market: 'KQ', sector: '반도체소재' },
  { code: '005290', name: '동진쎄미켐',      market: 'KQ', sector: '반도체소재' },
  { code: '178920', name: 'PI첨단소재',      market: 'KQ', sector: '반도체소재' },
  { code: '240810', name: '원익IPS',         market: 'KQ', sector: '반도체장비' },
  { code: '319660', name: '피에스케이',      market: 'KQ', sector: '반도체장비' },
  { code: '140860', name: '파크시스템스',    market: 'KQ', sector: '정밀장비' },
  { code: '121600', name: '나노신소재',      market: 'KQ', sector: '나노소재' },
  { code: '098460', name: '고영',            market: 'KQ', sector: '정밀검사장비' },

  // 자동차
  { code: '005380', name: '현대차',          market: 'KS', sector: '자동차' },
  { code: '000270', name: '기아',            market: 'KS', sector: '자동차' },

  // 2차전지/소재
  { code: '006400', name: '삼성SDI',         market: 'KS', sector: '2차전지' },
  { code: '051910', name: 'LG화학',          market: 'KS', sector: '화학' },
  { code: '003670', name: '포스코퓨처엠',    market: 'KS', sector: '2차전지소재' },
  { code: '247540', name: '에코프로비엠',    market: 'KQ', sector: '2차전지소재' },
  { code: '086520', name: '에코프로',        market: 'KQ', sector: '2차전지' },
  { code: '336370', name: '솔루스첨단소재',  market: 'KQ', sector: '동박' },

  // 방산
  { code: '012450', name: '한화에어로스페이스', market: 'KS', sector: '방산' },
  { code: '047810', name: '한국항공우주',    market: 'KS', sector: '방산' },
  { code: '064350', name: '현대로템',        market: 'KS', sector: '방산' },
  { code: '079550', name: 'LIG넥스원',       market: 'KS', sector: '방산' },

  // 조선
  { code: '329180', name: 'HD현대중공업',    market: 'KS', sector: '조선' },
  { code: '010140', name: '삼성중공업',      market: 'KS', sector: '조선' },
  { code: '042660', name: '한화오션',        market: 'KS', sector: '조선' },

  // 철강/소재
  { code: '005490', name: 'POSCO홀딩스',     market: 'KS', sector: '철강' },
  { code: '010130', name: '고려아연',        market: 'KS', sector: '비철금속' },
  { code: '011780', name: '금호석유화학',    market: 'KS', sector: '합성고무' },
  { code: '298050', name: '효성첨단소재',    market: 'KS', sector: '탄소섬유' },

  // 바이오/제약
  { code: '196170', name: '알테오젠',        market: 'KQ', sector: '바이오' },
  { code: '068270', name: '셀트리온',        market: 'KS', sector: '바이오' },
  { code: '128940', name: '한미약품',        market: 'KS', sector: '제약' },
  { code: '145020', name: '휴젤',            market: 'KQ', sector: '의료미용' },

  // 의료기기 (비교적 덜 알려진)
  { code: '214150', name: '클래시스',        market: 'KQ', sector: '의료기기' },
  { code: '041830', name: '인바디',          market: 'KQ', sector: '의료기기' },

  // 화장품/K뷰티 (성장 섹터)
  { code: '192820', name: '코스맥스',        market: 'KS', sector: '화장품ODM' },
  { code: '161890', name: '한국콜마',        market: 'KS', sector: '화장품ODM' },
  { code: '257720', name: '실리콘투',        market: 'KQ', sector: 'K뷰티유통' },

  // 가전/전자부품
  { code: '066570', name: 'LG전자',          market: 'KS', sector: '가전' },
  { code: '090460', name: '비에이치',        market: 'KQ', sector: 'FPCB' },

  // IT플랫폼/소프트웨어
  { code: '035420', name: 'NAVER',           market: 'KS', sector: 'IT플랫폼' },
  { code: '035720', name: '카카오',          market: 'KS', sector: 'IT플랫폼' },
  { code: '012510', name: '더존비즈온',      market: 'KS', sector: 'ERP소프트웨어' },

  // 게임
  { code: '259960', name: '크래프톤',        market: 'KS', sector: '게임' },
  { code: '263750', name: '펄어비스',        market: 'KQ', sector: '게임' },
  { code: '293490', name: '카카오게임즈',    market: 'KQ', sector: '게임' },

  // 엔터
  { code: '352820', name: '하이브',          market: 'KS', sector: '엔터' },
  { code: '041510', name: 'SM엔터테인먼트',  market: 'KQ', sector: '엔터' },
  { code: '035900', name: 'JYP엔터',         market: 'KQ', sector: '엔터' },

  // 금융/보험
  { code: '105560', name: 'KB금융',          market: 'KS', sector: '금융' },
  { code: '055550', name: '신한지주',        market: 'KS', sector: '금융' },
  { code: '138040', name: '메리츠금융지주',  market: 'KS', sector: '금융' },
  { code: '005830', name: 'DB손해보험',      market: 'KS', sector: '보험' },

  // 통신
  { code: '017670', name: 'SK텔레콤',        market: 'KS', sector: '통신' },
  { code: '030200', name: 'KT',              market: 'KS', sector: '통신' },

  // 식품/소비재 (방어주 성격)
  { code: '271560', name: '오리온',          market: 'KS', sector: '식품' },
  { code: '004370', name: '농심',            market: 'KS', sector: '식품' },
  { code: '000080', name: '하이트진로',      market: 'KS', sector: '주류' },
  { code: '097950', name: 'CJ제일제당',      market: 'KS', sector: '식품' },

  // 건설
  { code: '375500', name: 'DL이앤씨',        market: 'KS', sector: '건설' },
  { code: '006360', name: 'GS건설',          market: 'KS', sector: '건설' },

  // 로봇 (신흥 테마)
  { code: '277810', name: '레인보우로보틱스', market: 'KQ', sector: '로봇' },

  // 에너지/태양광
  { code: '009830', name: '한화솔루션',      market: 'KS', sector: '태양광' },
];

async function fetchPrice(stock) {
  const headers = await getAuthHeaders('FHKST01010100');
  const response = await axios.get(
    `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`,
    {
      headers,
      params: { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: stock.code },
      timeout: 8000,
    }
  );
  const o = response.data.output;
  return {
    ...stock,
    currentPrice:    parseInt(o.stck_prpr),
    changeRate:      parseFloat(o.prdy_ctrt),
    volume:          parseInt(o.acml_vol),
    marketCap:       parseInt(o.hts_avls),
    fiftyTwoWeekHigh: parseInt(o.w52_hgpr) || 0,
    fiftyTwoWeekLow:  parseInt(o.w52_lwpr) || 0,
    per: parseFloat(o.per) || null,
    pbr: parseFloat(o.pbr) || null,           // KIS 실측 PBR (네이버엔 없음)
    dividendYield: parseFloat(o.dvyd) || 0,   // KIS 배당수익률 — 같은 호출에 포함
  };
}

async function fetchAllPrices(stocks) {
  const results = [];
  const batchSize = 10;
  for (let i = 0; i < stocks.length; i += batchSize) {
    const batch = stocks.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fetchPrice));
    results.push(...settled.filter(r => r.status === 'fulfilled').map(r => r.value));
    if (i + batchSize < stocks.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return results;
}

// 복합 점수 랭킹 — PER(가치)·PBR(가치)·ROE(수익성)·배당수익률(환원) 멀티팩터.
// 정규화 0~1, 값 없으면 중립 0.5.
//  - PER·ROE: 유니버스(전종목 ~2,600) 분포 기준 백분위 → "시장 전체에서의 위치" 반영(A-2)
//  - PBR·배당: 전종목 수집엔 없고 숏리스트 KIS 보강분만 존재 → 후보군 내부 백분위
//  - dist(유니버스 분포)가 없으면 PER·ROE도 후보군 내부로 자동 폴백
function rankByComposite(list, dist) {
  // 후보군 내부 백분위 함수 생성(폴백 및 PBR·배당용)
  const poolPct = (key, higherIsBetter) => {
    const vals = list.map(s => s[key]).filter(v => typeof v === 'number' && isFinite(v));
    if (vals.length === 0) return () => 0.5;
    const sorted = [...vals].sort((a, b) => a - b);
    return (v) => {
      if (typeof v !== 'number' || !isFinite(v)) return 0.5;
      const rank = sorted.filter(x => x <= v).length / sorted.length;
      return higherIsBetter ? rank : 1 - rank;
    };
  };

  const pbrPct = poolPct('pbr', false);          // 낮을수록 좋음
  const divPct = poolPct('dividendYield', true); // 높을수록 좋음

  // PER·ROE: 유니버스 분포 우선, 없으면 후보군 내부
  const perPoolPct = poolPct('per', false);
  const roePoolPct = poolPct('roe', true);
  const perPct = (v) => {
    const p = dist ? percentileOf(dist.per, v) : null; // 0~1, 클수록 PER 큼(=비쌈)
    return p == null ? perPoolPct(v) : 1 - p;          // 낮을수록 좋음 → 반전
  };
  const roePct = (v) => {
    const p = dist ? percentileOf(dist.roe, v) : null;  // 클수록 ROE 큼(=좋음)
    return p == null ? roePoolPct(v) : p;
  };

  return list
    .map(s => ({
      ...s,
      _score: 0.30 * perPct(s.per) + 0.20 * pbrPct(s.pbr)
            + 0.35 * roePct(s.roe) + 0.15 * divPct(s.dividendYield),
    }))
    .sort((a, b) => b._score - a._score);
}

// B안: 랭킹은 백분위(_score) 유지하되, 표현·추천척도·가드를 종목상세(scoreEngine)와 통일.
//  - factors: 상세와 동일한 밸류·품질 팩터 함수 재사용 → 같은 라벨/어휘
//  - guards : 밸류트랩(싼데 품질 낮음)·떨어지는칼날을 발굴에도 적용
//  - score  : _score(0~1) → -100~+100 (상세와 같은 척도) + 가드 패널티(1건당 ~8점)
//  - recommendation: 상세와 동일한 toRecommendation 라벨(매수/관심/관망)
function unifyPresentation(list) {
  return list.map(s => {
    const valueF = scoreValuation({ per: s.per, pbr: s.pbr, dividendYield: s.dividendYield, sectorPer: null });
    const qualityF = scoreQuality({ roe: s.roe });
    const drawdown = (s.fiftyTwoWeekHigh > 0 && s.currentPrice > 0)
      ? ((s.fiftyTwoWeekHigh - s.currentPrice) / s.fiftyTwoWeekHigh) * 100 : null;
    const guards = detectGuards({
      factors: [valueF, qualityF],
      marginOfSafety: drawdown,
      supplyScore: null, qualityScore: qualityF.score, technicalScore: null,
    });
    const guardPenalty = guards.filter(g => g.triggered).reduce((a, g) => a + (g.penalty || 0), 0);
    let score = Math.round((s._score - 0.5) * 200 + guardPenalty * 8);
    score = Math.max(-100, Math.min(100, score));
    return {
      ...s,
      factors: [valueF, qualityF],
      guards,
      score,                                  // -100~+100 (상세와 동일 척도)
      recommendation: toRecommendation(score, false),
      valueTrap: guards.some(g => g.key === 'value_trap' && g.triggered),
    };
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 캐시 확인
    if (redis) {
      try {
        const cached = await redis.get(CACHE_KEY);
        if (cached) {
          console.log('♻️ AI 추천 캐시 반환');
          return res.status(200).json(typeof cached === 'string' ? JSON.parse(cached) : cached);
        }
      } catch (_) {}
    }

    // 스크리닝 캐시 + 유니버스 분포(A-2: PER·ROE 시장 전체 백분위용) 동시 조회
    let candidates;
    const [screenCache, universeDist] = await Promise.all([
      getScreenCandidates(),
      getUniverseDistribution().catch(() => null),
    ]);
    if (screenCache && screenCache.candidates && screenCache.candidates.length >= 5) {
      // KRX 스크리닝 프리리스트(저PER·고ROE, 최대 60개) → KIS로 PBR·배당·실시간 시세 보강
      const prelist = screenCache.candidates.slice(0, 60);
      console.log(`📋 스크리닝 프리리스트 ${prelist.length}개 KIS 보강 중... (전체 ${screenCache.universeSize}개 중 ${screenCache.totalScanned}개 스캔)`);
      const enriched = await fetchAllPrices(prelist);
      // KIS 보강 실패 시 네이버 원본으로라도 진행
      const base = enriched.length >= 5 ? enriched : prelist;
      // 멀티팩터 복합점수 상위 20개만 AI에 투입 (PBR·배당이 선별에 실제 반영됨)
      candidates = unifyPresentation(rankByComposite(base, universeDist).slice(0, 20));
      console.log(`🧮 복합점수 선별: ${base.length}개 → 상위 ${candidates.length}개 (유니버스분포 ${universeDist ? '적용' : '없음→후보군내부'})`);
    } else {
      // 캐시 없으면 기존 70개 풀 폴백
      console.log('⚠️ 스크리닝 캐시 없음 → 기존 풀 폴백');
      const allData = await fetchAllPrices(STOCK_POOL);

      const applyFilter = (pbrMax, perMax, ratioMax) =>
        allData.filter(s => {
          if (!s.pbr || s.pbr <= 0 || s.pbr > pbrMax) return false;
          if (!s.per || s.per <= 0 || s.per > perMax) return false;
          if (!s.fiftyTwoWeekHigh || s.fiftyTwoWeekHigh <= 0) return false;
          return (s.currentPrice / s.fiftyTwoWeekHigh) < ratioMax;
        });

      let filtered = applyFilter(2.0, 35, 0.82);
      if (filtered.length < 8) filtered = applyFilter(2.5, 40, 0.88);
      if (filtered.length < 8) filtered = applyFilter(3.5, 55, 0.95);
      // 폴백도 동일한 복합점수로 랭킹 (ROE는 없을 수 있어 중립 처리됨)
      candidates = unifyPresentation(rankByComposite(filtered, universeDist).slice(0, 20));
    }

    if (candidates.length < 3) {
      return res.status(200).json({
        recommendations: [],
        message: '현재 저평가 조건을 충족하는 종목이 부족합니다',
        updatedAt: new Date().toISOString(),
      });
    }

    // 거시경제 + 뉴스 + 수급 맥락
    const [{ text: macroText, signals: macroSignals }, newsText, marketSupplyText] = await Promise.all([
      getMacroForAI(),
      getNewsForAI(),
      getSupplyForAI(),
    ]);
    const macroSection = [
      macroText ? `\n[현재 거시경제]\n${macroText}${macroSignals.length > 0 ? '\n신호: ' + macroSignals.slice(0, 3).join(' / ') : ''}` : '',
      newsText ? `\n\n${newsText}` : '',
      marketSupplyText ? `\n\n${marketSupplyText}` : '',
    ].join('');

    const candidateText = candidates.map(s => {
      const parts = [
        `- ${s.name}(${s.code})`,
        s.sector ? `[${s.sector}]` : `[${s.market || 'KR'}]`,
        `: 현재가 ${s.currentPrice?.toLocaleString()}원`,
        `/ PER ${s.per}`,
      ];
      if (s.roe != null && s.roe !== 0) parts.push(`/ ROE ${s.roe}%`);
      if (s.pbr != null) parts.push(`/ PBR ${s.pbr}`);
      if (s.dividendYield > 0) parts.push(`/ 배당 ${s.dividendYield}%`);
      if (s.fiftyTwoWeekHigh > 0) {
        parts.push(`/ 52주고점대비 ${((s.currentPrice / s.fiftyTwoWeekHigh) * 100).toFixed(0)}%`);
      }
      if (s.marketCap > 0) {
        parts.push(`/ 시총 ${s.marketCap.toLocaleString()}억`);
      }
      // 통일 어휘(B안): 종목상세와 같은 발굴점수·밸류/품질 라벨·밸류트랩 경고
      if (typeof s.score === 'number') parts.push(`/ 발굴점수 ${s.score >= 0 ? '+' : ''}${s.score}(${s.recommendation})`);
      const valueF = s.factors?.find(f => f.key === 'value');
      const qualityF = s.factors?.find(f => f.key === 'quality');
      if (valueF?.available) parts.push(`/ 밸류 ${valueF.label}`);
      if (qualityF?.available) parts.push(`/ 품질 ${qualityF.label}`);
      if (s.valueTrap) parts.push(`/ ⚠밸류트랩의심(싼데 품질 약함)`);
      return parts.join(' ');
    }).join('\n');

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.45,
      messages: [
        {
          role: 'system',
          content: `당신은 한국 주식 가치투자 전문 분석가다.
규칙:
1. 시장이 아직 주목하지 않은 중소형 강소기업을 우선 발굴하라. 대형주는 저평가 근거가 압도적으로 명확할 때만 선정하라.
2. 현재 거시경제(환율, 유가, 미국 선물)가 어떤 종목에 유리하게 작용하는지 구체적으로 연결하라.
3. 각 종목을 "저평가(PER/PBR) + 수익성(ROE) + 주주환원(배당수익률)"의 3축으로 교차 분석하라. 싸기만 한 게 아니라 ROE로 수익성이 뒷받침되는지, 배당으로 환원이 되는지 함께 근거에 녹여라. 수치를 반드시 인용하라.
4. "잘 알려진 기업이라서", "안정적이라서" 같은 막연한 이유는 금지. 발굴 가치와 재평가 시나리오를 제시하라. 고배당이 주가 급락에 따른 착시(배당함정)는 아닌지도 짚어라.
5. 출력 텍스트 말투: 증권사 리포트 스타일의 정중한 존댓말(~입니다, ~습니다, ~됩니다). 반말·명령형·축약형 절대 금지.
6. 반드시 한글만. JSON 외 텍스트 금지.`,
        },
        {
          role: 'user',
          content: `저평가 조건을 충족한 후보 종목들입니다.${macroSection}

[후보 종목]
${candidateText}

위 후보 중에서 정확히 5개를 선별하라.
기준: '발굴점수'(종목상세 분석과 동일한 -100~+100 척도)가 높고, 밸류·품질 라벨이 함께 양호한 종목 우선. 시장이 아직 발굴하지 못한 종목을 선호하되, '⚠밸류트랩의심'으로 표시된 종목은 싸 보여도 품질이 약하니 매우 신중히 다루고 선정 시 그 위험을 reason에 반드시 명시하라. 현재 거시경제 환경에서 수혜 가능성도 고려하라.

JSON:
{"recommendations":[
  {"code":"종목코드","name":"종목명","sector":"섹터","reason":"저평가 근거 + 발굴 포인트 + 거시연결 (3문장)","riskLevel":"낮음|보통|높음","targetPeriod":"단기(1-3개월)|중기(3-6개월)|장기(6개월+)"},
  {...},{...},{...},{...}
]}`,
        },
      ],
      max_tokens: 1400,
    });

    const content = completion.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 응답 파싱 실패');

    const aiResult = JSON.parse(jsonMatch[0]);
    let recommendations = aiResult.recommendations.slice(0, 5).map(rec => {
      const stockData = candidates.find(s => s.code === rec.code) || {};
      return { ...stockData, ...rec };
    });

    // 5개 미만 시 보충
    if (recommendations.length < 5) {
      const usedCodes = new Set(recommendations.map(r => r.code));
      const extras = candidates
        .filter(c => !usedCodes.has(c.code))
        .slice(0, 5 - recommendations.length)
        .map(c => {
          const valParts = [];
          if (c.per) valParts.push(`PER ${c.per}`);
          if (c.pbr) valParts.push(`PBR ${c.pbr}`);
          if (c.roe) valParts.push(`ROE ${c.roe}%`);
          if (c.dividendYield > 0) valParts.push(`배당 ${c.dividendYield}%`);
          const valText = valParts.length ? valParts.join(' / ') : '저평가 지표';
          const dropText = (c.fiftyTwoWeekHigh > 0)
            ? ` 52주 고점 대비 ${((1 - c.currentPrice / c.fiftyTwoWeekHigh) * 100).toFixed(0)}% 하락 구간으로 반등 여력이 있습니다.`
            : '';
          return {
            ...c,
            reason: `${valText} 기준 동종업종 대비 저평가 구간으로 판단됩니다.${dropText} 수익성(ROE)과 수급 개선 시 재평가가 기대됩니다.`,
            riskLevel: '보통',
            targetPeriod: '중기(3-6개월)',
          };
        });
      recommendations = [...recommendations, ...extras];
    }

    // B-3: 최종 확정 5개를 KIS 실측으로 교차검증·표시값 권위화.
    //  - 카드에 보이는 현재가·등락률·PER·PBR·배당·시총·52주를 KIS(상세화면과 동일 출처) 값으로 확정
    //  - ROE는 KIS 미제공 → 네이버 스크리닝 값 유지
    //  - 값이 바뀌었으니 발굴점수·밸류/품질·가드를 그 값으로 재계산(카드 숫자=점수 근거 일치)
    try {
      const fresh = await fetchAllPrices(recommendations);
      const freshMap = new Map(fresh.map(f => [f.code, f]));
      recommendations = recommendations.map(r => {
        const f = freshMap.get(r.code);
        if (!f) return { ...r, verified: false };
        // 네이버 대비 KIS PER 괴리 모니터링(로그만) — 컬럼밀림·데이터오염 조기탐지
        if (typeof r.per === 'number' && typeof f.per === 'number' && r.per > 0 && f.per > 0) {
          const gap = Math.abs(f.per - r.per) / r.per;
          if (gap > 0.5) console.warn(`⚠️ PER 괴리 ${r.name}: 스크리닝 ${r.per} vs KIS ${f.per} (${(gap * 100).toFixed(0)}%)`);
        }
        return {
          ...r,
          currentPrice:     f.currentPrice ?? r.currentPrice,
          changeRate:       f.changeRate ?? r.changeRate,
          per:              f.per ?? r.per,
          pbr:              f.pbr ?? r.pbr,
          dividendYield:    (f.dividendYield != null ? f.dividendYield : r.dividendYield),
          marketCap:        f.marketCap || r.marketCap,
          fiftyTwoWeekHigh: f.fiftyTwoWeekHigh || r.fiftyTwoWeekHigh,
          fiftyTwoWeekLow:  f.fiftyTwoWeekLow || r.fiftyTwoWeekLow,
          verified: true, // 표시값 KIS 권위화 완료
        };
      });
      // 권위화된 값 기준으로 발굴점수·밸류/품질·가드 재계산 (카드 숫자와 점수 근거 일치)
      recommendations = unifyPresentation(recommendations);
    } catch (e) {
      console.warn('KIS 표시값 권위화 생략:', e.message);
    }

    // 최종 5개에 DART '사업의 개요' 기반 회사 소개(about) 생성 — 카드 3줄용.
    //  - 사업/제품·강점·기대포인트를 실제 공시에 근거해 서술(무명 소형주 할루시네이션 방지)
    //  - 종목별 about는 Redis 30일 캐시 → 한 번 생성한 회사는 즉시 재사용(콜드 DART 최소화)
    //  - DART 콜드 다운로드는 ~35초라 타임아웃 38초. best-effort: 실패하면 기존 reason 폴백.
    try {
      const ABOUT_TTL = 30 * 24 * 60 * 60;
      const aboutKey = (code) => `ai_about_${code}`;

      // 1) 캐시된 about 먼저 채움
      const aboutByCode = {};
      if (redis) {
        const cached = await Promise.allSettled(recommendations.map(r => redis.get(aboutKey(r.code))));
        cached.forEach((c, i) => {
          const v = c.status === 'fulfilled' ? c.value : null;
          if (v && typeof v === 'string') aboutByCode[recommendations[i].code] = v;
        });
      }

      // 2) 캐시 없는 종목만 DART 수집 → 생성
      const missing = recommendations.filter(r => !aboutByCode[r.code]);
      if (missing.length > 0) {
        const raceTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
        const bizSettled = await Promise.allSettled(
          missing.map(r => raceTimeout(getBusinessSummary(r.code).catch(() => null), 38000))
        );
        const bizMap = new Map();
        bizSettled.forEach((res, i) => {
          const v = res.status === 'fulfilled' ? res.value : null;
          if (v && v.ok && v.businessSummary) bizMap.set(missing[i].code, v.businessSummary);
        });

        if (bizMap.size > 0) {
          const bizText = missing.map(r => {
            const sum = bizMap.get(r.code);
            return `- ${r.name}(${r.code})${r.sector ? `[${r.sector}]` : ''}: ${sum ? sum.slice(0, 1200) : '(사업보고서 미확보 — 업종 기반 일반 서술, 모르면 솔직히)'}`;
          }).join('\n\n');

          const aboutCompletion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            temperature: 0.3,
            max_tokens: 1000,
            messages: [
              {
                role: 'system',
                content: `너는 증권 애널리스트다. 각 기업의 'DART 사업의 개요' 발췌를 읽고, 카드에 들어갈 사업 소개를 쓴다.
규칙:
1. 길이: 2~3문장, 90~120자로 카드를 적절히 채울 것. 너무 짧은 한 줄(예: "○○사입니다.")은 금지 — 알맹이를 채워라. 단, 군더더기·일반론·반복은 빼라.
2. ⚠️ 회사명으로 시작하지 말 것(카드에 종목명이 이미 크게 표시됨). 사업 내용부터 바로 시작.
   좋은 예: "자동차 시트·차체 부품을 현대·기아에 공급하는 부품업체로, 1,000여종 양산 능력과 미·중 생산기지를 보유하고 있습니다. 전동화 부품으로 확장 중입니다."
3. 반드시 담을 것: ①사업 정체성(무슨 업체인지) ②구체적 디테일 최소 1개(주력 제품·주요 고객·핵심 기술·사업 규모 중) ③있으면 사업상 강점이나 방향성.
4. 반드시 제공된 사업의 개요에 근거. 발췌에 없는 수치(점유율 등)·고객사·계약을 지어내지 말 것. 발췌가 빈약하면 개요에 실제 있는 내용(제품군·사업부문·규모 등)을 최대한 끌어와 채워라.
5. 밸류에이션(PER/PBR/저평가)·주가·목표가 언급 금지. 오직 '사업 소개'만.
6. 정중한 존댓말 어미(~합니다/~보유하고 있습니다). 한글만. JSON 외 텍스트 금지.`,
              },
              {
                role: 'user',
                content: `회사별 DART 사업의 개요 발췌:
${bizText}

JSON으로만 답하라(키는 종목코드, 값은 회사명 없이 2~3문장 90~120자 소개):
{"about":{"${missing[0]?.code || '코드'}":"○○를 ○○에 공급하는 ○○업체로, ○○ 능력을 보유하고 있습니다. ○○ 방향으로 확장 중입니다.", ...}}`,
              },
            ],
          });
          const t = aboutCompletion.choices[0]?.message?.content || '';
          const m = t.match(/\{[\s\S]*\}/);
          if (m) {
            const gen = (JSON.parse(m[0]).about) || {};
            for (const r of missing) {
              const text = gen[r.code] || gen[String(r.code)];
              if (text) {
                aboutByCode[r.code] = text;
                // DART 사업개요가 실제로 확보된 종목만 캐시(빈약한 폴백 문구는 다음에 재시도)
                if (redis && bizMap.has(r.code)) { try { await redis.set(aboutKey(r.code), text, { ex: ABOUT_TTL }); } catch (_) {} }
              }
            }
          }
        }
      }

      recommendations = recommendations.map(r => ({ ...r, about: aboutByCode[r.code] || r.about || null }));
      console.log(`📝 회사소개(about): ${recommendations.filter(r => r.about).length}/${recommendations.length}개 (신규생성 ${missing.length}개 시도)`);
    } catch (e) {
      console.warn('발굴 회사소개(about) 생성 생략:', e.message);
    }

    const result = {
      recommendations,
      candidateCount: candidates.length,
      poolSize: screenCache ? screenCache.universeSize : STOCK_POOL.length,
      screenedAt: screenCache ? screenCache.screenedAt : null,
      updatedAt: new Date().toISOString(),
    };

    if (redis) {
      try {
        await redis.set(CACHE_KEY, JSON.stringify(result), { ex: CACHE_TTL });
        console.log('✅ AI 추천 결과 캐싱 완료 (1시간)');
      } catch (_) {}
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('AI Recommend error:', error.message);
    res.status(500).json({ error: '추천 분석 실패', detail: error.message });
  }
};
