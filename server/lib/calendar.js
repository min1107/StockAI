/**
 * 🗓️ 이벤트 캘린더 (docs/AI_ENGINE.md §10 — "시야를 미리")
 *
 * 한국은 미래 실적발표일을 주는 무료 소스가 마땅치 않으므로, DART 결산월로
 * 법정 공시기한을 결정론적으로 추정한다(정직하게 '추정' 표기):
 *   - 정기보고서(실적): 분기말+45일 / 반기말+45일 / 사업연도말+90일
 *   - 배당락: 12월 결산 + 배당 종목 → 연말 배당락 추정 (분기 이내일 때만)
 *
 * 순수 함수. 입력 부족하면 빈 배열.
 */

const lastDayOfMonth = (y, m1to12) => new Date(y, m1to12, 0).getDate();
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ddayOf = (today, target) => Math.round((target - today) / 86400000);

/**
 * @param {object} p
 * @param {number|string} p.settleMonth - 결산월(1~12). 없으면 12 가정.
 * @param {boolean} p.hasDividend - 배당 지급 여부
 * @param {Date} [p.today]
 * @returns {Array<{event,date,dday,note}>} 가까운 순 정렬
 */
function buildCalendar({ settleMonth, hasDividend, today = new Date() } = {}) {
  const events = [];
  const sM = (parseInt(settleMonth, 10) >= 1 && parseInt(settleMonth, 10) <= 12) ? parseInt(settleMonth, 10) : 12;

  // 4개 분기말 월 (결산월 기준): sM, sM-3, sM-6, sM-9
  const qMonths = [0, 3, 6, 9].map(off => ((sM - off - 1 + 12) % 12) + 1);

  // 올해 전후로 후보 마감일 생성 → 다가오는 가장 가까운 정기보고서
  const cands = [];
  for (let y = today.getFullYear() - 1; y <= today.getFullYear() + 1; y++) {
    for (const qm of qMonths) {
      const periodEnd = new Date(y, qm - 1, lastDayOfMonth(y, qm));
      const isAnnual = qm === sM;
      const deadline = addDays(periodEnd, isAnnual ? 90 : 45);
      cands.push({ isAnnual, periodEnd, deadline });
    }
  }
  const nextReport = cands
    .filter(c => ddayOf(today, c.deadline) >= 0)
    .sort((a, b) => a.deadline - b.deadline)[0];
  if (nextReport) {
    events.push({
      event: nextReport.isAnnual ? '사업보고서(연간 실적) 공시' : '분기/반기 실적 공시',
      date: fmt(nextReport.deadline),
      dday: ddayOf(today, nextReport.deadline),
      note: `${fmt(nextReport.periodEnd)} 결산 · 법정기한 기준 추정(실제 발표일과 다를 수 있음)`,
    });
  }

  // 배당락 (12월 결산 + 배당) — 연말 배당기준일 직전 거래일 ≈ 12/27경(추정). 분기 이내일 때만 노출.
  if (hasDividend && sM === 12) {
    // 올해/내년 중 다가오는 연말. 배당락 추정일 = 12/27 (휴장·주말 보정 없이 보수적 근사)
    let y = today.getFullYear();
    let exDate = new Date(y, 11, 27);
    if (ddayOf(today, exDate) < 0) { y += 1; exDate = new Date(y, 11, 27); }
    const dd = ddayOf(today, exDate);
    if (dd <= 90) {
      events.push({
        event: '연말 배당락(예상)',
        date: fmt(exDate),
        dday: dd,
        note: '12월 결산 배당 기준일 직전 거래일 추정',
      });
    }
  }

  return events.sort((a, b) => a.dday - b.dday);
}

module.exports = { buildCalendar };
