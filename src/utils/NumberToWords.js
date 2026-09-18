// ============================================================
// تبدیل عدد به حروف فارسی
// ============================================================

const YEGAN = ['','یک','دو','سه','چهار','پنج','شش','هفت','هشت','نه'];
const DAHGAN = ['','','بیست','سی','چهل','پنجاه','شصت','هفتاد','هشتاد','نود'];
const DAH_TA_BIST = ['ده','یازده','دوازده','سیزده','چهارده','پانزده','شانزده','هفده','هجده','نوزده'];
const SADGAN = ['','صد','دویست','سیصد','چهارصد','پانصد','ششصد','هفتصد','هشتصد','نهصد'];
const PART_NAMES = ['','هزار','میلیون','میلیارد','تریلیون','کوادریلیون'];

function threeDigitToWords(n) {
  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const y = n % 10;
  const parts = [];
  if (c > 0) parts.push(SADGAN[c]);
  if (d === 1) parts.push(DAH_TA_BIST[y]);
  else {
    if (d > 1) parts.push(DAHGAN[d]);
    if (y > 0) parts.push(YEGAN[y]);
  }
  return parts.join(' و ');
}

export function numberToWords(num, currency = 'ریال') {
  if (num === null || num === undefined || isNaN(num)) return 'صفر ' + currency;
  num = Math.round(Number(num));
  if (num === 0) return 'صفر ' + currency;
  const isNegative = num < 0;
  num = Math.abs(num);
  const parts = [];
  let idx = 0;
  let temp = num;
  while (temp > 0) {
    const chunk = temp % 1000;
    if (chunk > 0) {
      let w = threeDigitToWords(chunk);
      if (PART_NAMES[idx]) w += ' ' + PART_NAMES[idx];
      parts.unshift(w);
    }
    temp = Math.floor(temp / 1000);
    idx++;
  }
  const result = parts.join(' و ') + ' ' + currency;
  return isNegative ? 'منفی ' + result : result;
}

export function numberToWordsShort(num) {
  return numberToWords(num, '');
}