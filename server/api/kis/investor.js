const { KIS_BASE_URL, getAuthHeaders } = require('../../lib/kisAuth');
const kisRequest = require('../../lib/kisRequest');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: '종목코드(code) 필요' });

    // 투자자별 매매동향 (다수 거래일 데이터 반환)
    const headers = await getAuthHeaders('FHKST01010900');
    const response = await kisRequest('get',
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-investor`,
      {
        headers,
        params: {
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_INPUT_ISCD: code,
        },
      }
    );

    const output = response.data.output || response.data.output1;
    const allItems = Array.isArray(output) ? output : output ? [output] : [];

    // 유효 데이터만 필터링 (빈 문자열 / undefined 제외)
    const validItems = allItems.filter(
      item => item.orgn_ntby_tr_pbmn !== '' && item.orgn_ntby_tr_pbmn !== undefined
    );

    const availableDays = validItems.length;

    if (availableDays === 0) {
      return res.status(200).json(emptyResponse());
    }

    // 파싱 헬퍼 (백만원 → 억원)
    const toEok = (v) => parseFloat(v || 0) / 100;

    // ── 당일 (가장 최근) ──────────────────────────────────
    const d0 = validItems[0];
    const dailyInst    = toEok(d0.orgn_ntby_tr_pbmn);
    const dailyForeign = toEok(d0.frgn_ntby_tr_pbmn);
    const dailyPersonal = toEok(d0.prsn_ntby_tr_pbmn);

    // ── 기간별 누적 (실데이터만, 부족하면 null) ───────────
    const sum = (items, field) => items.reduce((s, i) => s + toEok(i[field]), 0);

    // 주간: 2일 이상 있을 때
    let weeklyInst = null, weeklyForeign = null, weeklyActualDays = 0;
    if (availableDays >= 2) {
      const w = validItems.slice(0, Math.min(5, availableDays));
      weeklyActualDays = w.length;
      weeklyInst    = sum(w, 'orgn_ntby_tr_pbmn');
      weeklyForeign = sum(w, 'frgn_ntby_tr_pbmn');
    }

    // 월간: 5일 이상 있을 때
    let monthlyInst = null, monthlyForeign = null, monthlyActualDays = 0;
    if (availableDays >= 5) {
      const m = validItems.slice(0, Math.min(20, availableDays));
      monthlyActualDays = m.length;
      monthlyInst    = sum(m, 'orgn_ntby_tr_pbmn');
      monthlyForeign = sum(m, 'frgn_ntby_tr_pbmn');
    }

    // 3개월: 20일 이상 있을 때
    let quarterlyInst = null, quarterlyForeign = null, quarterlyActualDays = 0;
    if (availableDays >= 20) {
      const q = validItems.slice(0, Math.min(60, availableDays));
      quarterlyActualDays = q.length;
      quarterlyInst    = sum(q, 'orgn_ntby_tr_pbmn');
      quarterlyForeign = sum(q, 'frgn_ntby_tr_pbmn');
    }

    // ── 미니차트용 최근 N일 배열 ─────────────────────────
    const recentDays = validItems.slice(0, Math.min(5, availableDays)).map(item => ({
      date:     item.stck_bsop_date || '',
      inst:     toEok(item.orgn_ntby_tr_pbmn),
      foreign:  toEok(item.frgn_ntby_tr_pbmn),
      personal: toEok(item.prsn_ntby_tr_pbmn),
    }));

    // ── 주간 일평균 (실데이터 기반) ──────────────────────
    const weeklyAvgInstitution = weeklyInst !== null ? weeklyInst / weeklyActualDays : null;
    const weeklyAvgForeign     = weeklyForeign !== null ? weeklyForeign / weeklyActualDays : null;

    res.status(200).json({
      availableDays,
      // 당일
      daily: dailyPersonal,
      dailyInstitution: dailyInst,
      dailyForeign: dailyForeign,
      // 주간
      weeklyInstitution: weeklyInst,
      weeklyForeign: weeklyForeign,
      weeklyActualDays,
      // 월간
      monthlyInstitution: monthlyInst,
      monthlyForeign: monthlyForeign,
      monthlyActualDays,
      // 3개월
      quarterlyInstitution: quarterlyInst,
      quarterlyForeign: quarterlyForeign,
      quarterlyActualDays,
      // 미니차트 & 평균
      recentDays,
      weeklyAvgInstitution,
      weeklyAvgForeign,
    });

  } catch (error) {
    console.error('KIS investor error:', error.message);
    res.status(200).json(emptyResponse());
  }
};

function emptyResponse() {
  return {
    availableDays: 0,
    daily: 0,
    dailyInstitution: 0,
    dailyForeign: 0,
    weeklyInstitution: null,
    weeklyForeign: null,
    weeklyActualDays: 0,
    monthlyInstitution: null,
    monthlyForeign: null,
    monthlyActualDays: 0,
    quarterlyInstitution: null,
    quarterlyForeign: null,
    quarterlyActualDays: 0,
    recentDays: [],
    weeklyAvgInstitution: null,
    weeklyAvgForeign: null,
  };
}
