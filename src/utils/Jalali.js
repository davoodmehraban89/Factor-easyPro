// ============================================================
// Jalali Date Utilities — توکار بدون پکیج خارجی
// ============================================================

const MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const WEEKDAYS = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
const WEEKDAYS_SHORT = ['ش','ی','د','س','چ','پ','ج'];

function div(a, b) { return Math.floor(a / b); }

function g2j(gy, gm, gd) {
  const g_d_m = [0,31,59,90,120,151,181,212,243,273,304,334];
  let jy = (gy <= 1600) ? 0 : 979;
  gy -= (gy <= 1600) ? 621 : 1600;
  const gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = (365 * gy) + div((gy2 + 3), 4) - div((gy2 + 99), 100) + div((gy2 + 399), 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) { jy += div((days - 1), 365); days = (days - 1) % 365; }
  const jm = (days < 186) ? 1 + div(days, 31) : 7 + div((days - 186), 30);
  const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
  return [jy, jm, jd];
}

function j2g(jy, jm, jd) {
  let gy = (jy <= 979) ? 621 : 1600;
  jy -= (jy <= 979) ? 0 : 979;
  let days = (365 * jy) + (div(jy, 33) * 8) + div(((jy % 33) + 3), 4) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  gy += 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) { gy += div((days - 1), 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const sal_a = [0,31,((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return [gy, gm, gd];
}

export const Jalali = {
  now() {
    const d = new Date();
    const [jy, jm, jd] = g2j(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return { year: jy, month: jm, day: jd, weekday: (d.getDay() + 1) % 7 };
  },
  fromDate(date = new Date()) {
    if (!(date instanceof Date)) date = new Date(date);
    const [jy, jm, jd] = g2j(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return { year: jy, month: jm, day: jd, weekday: (date.getDay() + 1) % 7 };
  },
  toDate(jy, jm, jd) {
    const [gy, gm, gd] = j2g(jy, jm, jd);
    return new Date(gy, gm - 1, gd, 12, 0, 0);
  },
  parse(str) {
    if (!str) return new Date();
    str = String(str).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    const parts = str.split(/[\/\-\.]/).map(Number);
    if (parts.length !== 3) return new Date();
    return this.toDate(parts[0], parts[1], parts[2]);
  },
  format(date = new Date(), sep = '/') {
    const { year, month, day } = this.fromDate(date);
    return `${year}${sep}${String(month).padStart(2,'0')}${sep}${String(day).padStart(2,'0')}`;
  },
  formatLong(date = new Date()) {
    const { year, month, day, weekday } = this.fromDate(date);
    return `${WEEKDAYS[weekday]}، ${day} ${MONTHS[month - 1]} ${year}`;
  },
  monthName(m) { return MONTHS[m - 1] || ''; },
  monthNames() { return [...MONTHS]; },
  weekdayNames() { return [...WEEKDAYS]; },
  weekdayShort() { return [...WEEKDAYS_SHORT]; },
  addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  },
  diffDays(from, to) {
    return Math.floor((to - from) / (1000 * 60 * 60 * 24));
  },
  today() { return this.format(new Date()); },
  todayLong() { return this.formatLong(new Date()); }
};