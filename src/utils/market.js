/**
 * 종목 시장/통화 유틸
 * - 종목코드 6자리 숫자 = 한국, 그 외(알파벳 티커) = 미국
 */

export const isKoreanCode = (code) =>
  /^\d{6}$/.test(String(code || '').split('.')[0]);

// 가격 조회용 심볼: 한국은 .KS 부착, 미국은 티커 대문자 그대로
export const toSymbol = (code) => {
  const c = String(code || '').trim();
  if (!c) return c;
  if (c.includes('.')) return c;
  return isKoreanCode(c) ? c + '.KS' : c.toUpperCase();
};

export const currencyOf = (code) => (isKoreanCode(code) ? 'KRW' : 'USD');

export const DEFAULT_FX = 1380; // 환율 조회 실패 시 폴백

// 통화 기호 포함 포맷 (미국은 소수 2자리)
export const fmtMoney = (code, amount) => {
  if (amount == null || isNaN(amount)) return '—';
  if (currencyOf(code) === 'USD') {
    return '$' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return '₩' + Math.round(Number(amount)).toLocaleString('ko-KR');
};

// 원화 환산 (미국주식이면 환율 곱)
export const toKRW = (code, amount, fxRate) =>
  currencyOf(code) === 'USD' ? Number(amount) * (fxRate || DEFAULT_FX) : Number(amount);
