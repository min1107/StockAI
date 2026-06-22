/**
 * 📊 유니버스 백분위 랭킹 (docs/AI_ENGINE.md §9 — 정보우위)
 *
 * "한 종목만 봐서는 상대를 모른다." 전종목 분포에서 이 종목의 위치를 계산해
 * 개미가 못 보는 상대 가치/규모를 드러낸다. (PER·PBR·시총 차원, 분포는 universeCache)
 *
 * 순수 함수. 분포 없거나 값 없으면 해당 항목 null.
 */

// 오름차순 구간점(bp)에서 value의 백분위(0~100, value보다 작은 표본 비율 근사)
function percentileOf(bp, value) {
  if (!Array.isArray(bp) || bp.length < 2 || typeof value !== 'number' || !isFinite(value)) return null;
  if (value <= bp[0]) return 0;
  if (value >= bp[bp.length - 1]) return 100;
  // bp[k]는 k번째 백분위 값 → value 이하인 가장 큰 k가 백분위
  let lo = 0, hi = bp.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bp[mid] <= value) lo = mid; else hi = mid - 1;
  }
  return lo; // 0~100
}

/**
 * @param {{per?:number,pbr?:number,marketCap?:number}} stock
 * @param {object} dist - universeCache의 분포
 * @returns {object|null} 백분위 + 사람이 읽을 라벨
 */
function rankStock(stock = {}, dist) {
  if (!dist) return null;
  const out = { universeSize: dist.count || null, items: [] };
  const clamp1 = (x) => Math.max(1, x);

  // 밸류: 값이 낮을수록 저렴. pct=값보다 싼 종목 비율 → 작으면 저렴.
  const valueLabel = (name, pct) =>
    pct <= 50 ? `${name} 시장 하위 ${clamp1(pct)}% (저렴한 편)`
              : `${name} 시장 상위 ${clamp1(100 - pct)}% (비싼 편)`;

  if (dist.per && typeof stock.per === 'number' && stock.per > 0) {
    const pct = percentileOf(dist.per.bp, stock.per);
    if (pct !== null) { out.perPercentile = pct; out.items.push({ metric: 'PER', percentile: pct, label: valueLabel('PER', pct) }); }
  }
  // 품질: ROE 클수록 우수. pct=값보다 ROE 낮은 종목 비율 → 크면 상위 수익성.
  //   (전종목 스캔엔 PBR이 없어 PBR 분포는 비어있음 → ROE 백분위로 품질 축 제공)
  if (dist.roe && typeof stock.roe === 'number' && stock.roe > 0) {
    const pct = percentileOf(dist.roe.bp, stock.roe);
    if (pct !== null) {
      out.roePercentile = pct;
      const top = 100 - pct;
      out.items.push({
        metric: 'ROE',
        percentile: pct,
        label: top <= 50 ? `ROE 시장 상위 ${clamp1(top)}% (수익성 우수)` : `ROE 시장 하위 ${clamp1(pct)}% (수익성 낮음)`,
      });
    }
  }
  // 규모: 시총 클수록 대형. top = 상위 몇 %.
  if (dist.marketCap && typeof stock.marketCap === 'number' && stock.marketCap > 0) {
    const pct = percentileOf(dist.marketCap.bp, stock.marketCap);
    if (pct !== null) {
      const top = 100 - pct;
      out.sizePercentile = top;
      const tag = top <= 20 ? '대형주' : top >= 80 ? '소형주' : '중형주';
      const disp = top <= 50 ? `상위 ${clamp1(top)}%` : `하위 ${clamp1(100 - top)}%`;
      out.items.push({ metric: '시총', percentile: top, label: `시총 ${disp} (${tag})` });
    }
  }

  // 밸류 종합 한 줄 (PER·PBR 백분위 평균이 낮을수록 시장 대비 저평가)
  const valPcts = [out.perPercentile, out.pbrPercentile].filter(v => typeof v === 'number');
  if (valPcts.length) {
    const avg = Math.round(valPcts.reduce((a, b) => a + b, 0) / valPcts.length);
    out.valuePercentile = avg;
    out.valueSummary = avg <= 30 ? `밸류 기준 시장 저평가 상위 ${avg}%권`
                      : avg >= 70 ? `밸류 기준 시장 고평가권(상위 ${100 - avg}%)`
                      : '밸류 시장 중간권';
  }

  return out.items.length ? out : null;
}

module.exports = { rankStock, percentileOf };
