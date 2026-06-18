const axios = require('axios');
const Groq = require('groq-sdk');
const { Redis } = require('@upstash/redis');
const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');
const { getMacroForAI, getNewsForAI, getSupplyForAI } = require('../macro/context');
const { getScreenCandidates } = require('../../lib/screenCache');

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
    pbr: parseFloat(o.pbr) || null,
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

    // 스크리닝 캐시 확인 (cron/screen.js가 매일 오전 8시 갱신)
    let candidates;
    const screenCache = await getScreenCandidates();
    if (screenCache && screenCache.candidates && screenCache.candidates.length >= 5) {
      // KRX 전체 스크리닝 결과 사용
      candidates = screenCache.candidates.slice(0, 20);
      console.log(`📋 스크리닝 캐시 사용: ${candidates.length}개 후보 (전체 ${screenCache.universeSize}개 중 ${screenCache.totalScanned}개 스캔)`);
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
      filtered.sort((a, b) => a.pbr - b.pbr);
      candidates = filtered.slice(0, 20);
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
        `/ PBR ${s.pbr}`,
        `/ PER ${s.per}`,
      ];
      if (s.fiftyTwoWeekHigh > 0) {
        parts.push(`/ 52주고점대비 ${((s.currentPrice / s.fiftyTwoWeekHigh) * 100).toFixed(0)}%`);
      }
      if (s.marketCap > 0) {
        parts.push(`/ 시총 ${s.marketCap.toLocaleString()}억`);
      }
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
3. 각 종목의 저평가 근거를 PBR/PER 수치로 수치화하라. 52주 데이터 없으면 PBR/PER만으로 충분히 설명하라.
4. "잘 알려진 기업이라서", "안정적이라서" 같은 막연한 이유는 금지. 발굴 가치와 재평가 시나리오를 제시하라.
5. 출력 텍스트 말투: 증권사 리포트 스타일의 정중한 존댓말(~입니다, ~습니다, ~됩니다). 반말·명령형·축약형 절대 금지.
6. 반드시 한글만. JSON 외 텍스트 금지.`,
        },
        {
          role: 'user',
          content: `저평가 조건을 충족한 후보 종목들입니다.${macroSection}

[후보 종목]
${candidateText}

위 후보 중에서 정확히 5개를 선별하라.
기준: 저평가 정도가 가장 깊고, 시장이 아직 발굴하지 못한 종목 우선. 현재 거시경제 환경에서 수혜 가능성도 고려하라.

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
        .map(c => ({
          ...c,
          reason: `PBR ${c.pbr} / PER ${c.per}로 동종업종 대비 저평가. 52주 고점 대비 ${((1 - c.currentPrice / c.fiftyTwoWeekHigh) * 100).toFixed(0)}% 하락 구간으로 반등 여력 존재. 섹터 성장성과 수급 개선 시 재평가 가능.`,
          riskLevel: '보통',
          targetPeriod: '중기(3-6개월)',
        }));
      recommendations = [...recommendations, ...extras];
    }

    // 추천 확정 종목만 실시간 시세로 현재가·등락률 갱신.
    // (스크리닝 캐시 후보엔 changeRate가 없어 카드 등락률이 0%로 떴음 → 최종 5개만 재조회)
    try {
      const fresh = await fetchAllPrices(recommendations);
      const freshMap = new Map(fresh.map(f => [f.code, f]));
      recommendations = recommendations.map(r => {
        const f = freshMap.get(r.code);
        return f ? { ...r, currentPrice: f.currentPrice ?? r.currentPrice, changeRate: f.changeRate } : r;
      });
    } catch (e) {
      console.warn('실시간 시세 갱신 생략:', e.message);
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
