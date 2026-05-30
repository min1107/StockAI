/**
 * 현재 거시경제 맥락 조회 엔드포인트
 * AI 프롬프트에 주입할 텍스트 형태로 반환
 */

const { getMacro } = require('../../lib/macroCache');
const { getNews } = require('../../lib/newsCache');
const { getSupply } = require('../../lib/supplyCache');

// 캐시 없을 때 수집 트리거
const collect = require('./collect');

function fmt(val, digits = 0) {
  if (val == null) return 'N/A';
  return Number(val).toLocaleString('ko-KR', { maximumFractionDigits: digits });
}

function sign(val) {
  if (val == null) return '';
  return val >= 0 ? '+' : '';
}

/**
 * AI 프롬프트에 바로 넣을 수 있는 텍스트 생성
 */
function buildMacroText(macro) {
  if (!macro) return null;

  const lines = ['[글로벌 매크로 환경]'];

  const usdKrwPrice = typeof macro.usdKrw === 'number' ? macro.usdKrw : macro.usdKrw?.price;
  if (usdKrwPrice) {
    lines.push(`환율: ${fmt(usdKrwPrice, 0)}원/달러`);
  }
  if (macro.wti) {
    lines.push(`WTI 유가: $${fmt(macro.wti.price, 1)} (${sign(macro.wti.changePct)}${macro.wti.changePct}%)`);
  }
  if (macro.gold) {
    lines.push(`국제 금: $${fmt(macro.gold.price, 0)} (${sign(macro.gold.changePct)}${macro.gold.changePct}%)`);
  }
  if (macro.spFutures) {
    lines.push(`S&P500 선물: ${fmt(macro.spFutures.price, 0)} (${sign(macro.spFutures.changePct)}${macro.spFutures.changePct}%)`);
  }
  if (macro.nqFutures) {
    lines.push(`NASDAQ 선물: ${fmt(macro.nqFutures.price, 0)} (${sign(macro.nqFutures.changePct)}${macro.nqFutures.changePct}%)`);
  }

  lines.push(`수집 시각: ${macro.collectedAt || 'N/A'}`);
  return lines.join('\n');
}

/**
 * 매크로 신호 해석 (AI에게 힌트 제공)
 */
function buildMacroSignals(macro) {
  if (!macro) return [];
  const signals = [];

  // 환율 강달러 → 외국인 이탈 신호
  const _usdKrw = typeof macro.usdKrw === 'number' ? macro.usdKrw : macro.usdKrw?.price;
  if (_usdKrw > 1380) {
    signals.push(`달러 강세(${fmt(_usdKrw, 0)}원) — 외국인 자금 이탈 압력 증가`);
  } else if (_usdKrw && _usdKrw < 1310) {
    signals.push(`달러 약세(${fmt(_usdKrw, 0)}원) — 외국인 자금 유입 환경`);
  }

  // 유가 급등 → 에너지·운송 비용 압력
  if (macro.wti?.changePct > 2) {
    signals.push(`WTI 유가 급등(+${macro.wti.changePct}%) — 에너지 비용 상승, 제조업 마진 압박`);
  } else if (macro.wti?.changePct < -2) {
    signals.push(`WTI 유가 급락(${macro.wti.changePct}%) — 에너지주 하락 압력, 소비재·항공 수혜`);
  }

  // 금 급등 → 안전자산 선호 = 위험회피
  if (macro.gold?.changePct > 1.5) {
    signals.push(`금 가격 급등(+${macro.gold.changePct}%) — 글로벌 안전자산 선호, 위험자산 회피 심리`);
  }

  // 미국 선물 하락 → 다음날 KOSPI 하락 선행
  if (macro.spFutures?.changePct < -1) {
    signals.push(`S&P500 선물 하락(${macro.spFutures.changePct}%) — 다음날 KOSPI 하락 압력 예상`);
  } else if (macro.spFutures?.changePct > 1) {
    signals.push(`S&P500 선물 상승(+${macro.spFutures.changePct}%) — 다음날 KOSPI 상승 모멘텀 기대`);
  }

  return signals;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let macro = await getMacro();

    // 캐시 없으면 즉시 수집
    if (!macro) {
      console.log('📡 매크로 캐시 없음 → 즉시 수집');
      await collect({ method: 'GET', headers: {} }, null);
      macro = await getMacro();
    }

    const text = buildMacroText(macro);
    const signals = buildMacroSignals(macro);

    res.status(200).json({ macro, text, signals });
  } catch (error) {
    console.error('❌ 매크로 컨텍스트 조회 실패:', error.message);
    res.status(200).json({ macro: null, text: null, signals: [] });
  }
};

// AI 프롬프트 빌드용 직접 호출 함수 (다른 모듈에서 import)
module.exports.getMacroForAI = async () => {
  try {
    let macro = await getMacro();
    if (!macro) {
      await collect({ method: 'GET', headers: {} }, null);
      macro = await getMacro();
    }
    return {
      text: buildMacroText(macro),
      signals: buildMacroSignals(macro),
    };
  } catch (_) {
    return { text: null, signals: [] };
  }
};

// 시장 뉴스 AI 주입용 함수
module.exports.getNewsForAI = async () => {
  try {
    const data = await getNews();
    if (!data || !data.items || data.items.length === 0) return null;
    const lines = [`[최신 시장 뉴스 — ${data.collectedAt ? new Date(data.collectedAt).toLocaleString('ko-KR') : ''}]`];
    data.items.slice(0, 8).forEach((item, i) => {
      lines.push(`${i + 1}. ${item.title}${item.summary ? ' — ' + item.summary.slice(0, 60) : ''}`);
    });
    return lines.join('\n');
  } catch (_) {
    return null;
  }
};

// 시장 수급 AI 주입용 함수
module.exports.getSupplyForAI = async () => {
  try {
    const data = await getSupply();
    if (!data) return null;
    const lines = ['[오늘 시장 수급 동향]'];
    const sign = v => (v >= 0 ? '+' : '') + v.toFixed(0);
    if (data.topInstBuy && data.topInstBuy.length > 0) {
      lines.push(`기관 순매수 상위: ${data.topInstBuy.map(r => `${r.name}(${sign(r.dailyInst)}억)`).join(', ')}`);
    }
    if (data.topForeignBuy && data.topForeignBuy.length > 0) {
      lines.push(`외국인 순매수 상위: ${data.topForeignBuy.map(r => `${r.name}(${sign(r.dailyForeign)}억)`).join(', ')}`);
    }
    if (data.topInstSell && data.topInstSell.length > 0) {
      lines.push(`기관 순매도 상위: ${data.topInstSell.map(r => `${r.name}(${sign(r.dailyInst)}억)`).join(', ')}`);
    }
    if (data.topForeignSell && data.topForeignSell.length > 0) {
      lines.push(`외국인 순매도 상위: ${data.topForeignSell.map(r => `${r.name}(${sign(r.dailyForeign)}억)`).join(', ')}`);
    }
    lines.push(`수집 시각: ${data.collectedAt ? new Date(data.collectedAt).toLocaleString('ko-KR') : 'N/A'}`);
    return lines.join('\n');
  } catch (_) {
    return null;
  }
};
