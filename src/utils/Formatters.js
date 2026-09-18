// ============================================================
// توابع فرمت‌دهی
// ============================================================

export const Formatters = {
  toPersianDigits(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  },
  toLatinDigits(str) {
    if (!str) return '';
    return String(str).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  },
  number(num, usePersian = true) {
    if (num === null || num === undefined || isNaN(num)) return '۰';
    const s = Number(num).toLocaleString('en-US');
    return usePersian ? this.toPersianDigits(s) : s;
  },
  money(num, currency = 'ریال', usePersian = true) {
    return `${this.number(num, usePersian)} ${currency}`;
  },
  percent(num) {
    return this.toPersianDigits(num.toFixed(2)) + '٪';
  },
  date(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '—';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return this.toPersianDigits(`${y}/${m}/${day}`);
  },
  phone(num) {
    if (!num) return '—';
    const clean = String(num).replace(/\D/g, '');
    if (clean.length === 11) return this.toPersianDigits(`${clean.slice(0,4)} ${clean.slice(4,7)} ${clean.slice(7)}`);
    return this.toPersianDigits(clean);
  },
  truncate(str, len = 40) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
  }
};