// Factor-easyPro V2 / Phase 1: pure accounting domain rules.
// Holoo is a functional benchmark, not a source for proprietary account codes.
import { Jalali } from '../utils/Jalali.js';
export const ACCOUNT_LEVELS = Object.freeze(['group', 'general', 'subsidiary', 'detail']);
export const ACCOUNT_TYPES = Object.freeze(['asset', 'liability', 'equity', 'revenue', 'expense']);
export const JOURNAL_STATUSES = Object.freeze(['draft', 'posted']);
export const PERIOD_STATUSES = Object.freeze(['open', 'closed']);

export const DEFAULT_CHART = Object.freeze([
  { code: '1', name: 'دارایی‌ها', type: 'asset', level: 'group' },
  { code: '2', name: 'بدهی‌ها', type: 'liability', level: 'group' },
  { code: '3', name: 'حقوق مالکانه', type: 'equity', level: 'group' },
  { code: '4', name: 'درآمدها', type: 'revenue', level: 'group' },
  { code: '5', name: 'هزینه‌ها', type: 'expense', level: 'group' },
  { code: '101', name: 'موجودی نقد و بانک', type: 'asset', level: 'general', parentCode: '1' },
  { code: '102', name: 'حساب‌های دریافتنی', type: 'asset', level: 'general', parentCode: '1' },
  { code: '103', name: 'موجودی کالا', type: 'asset', level: 'general', parentCode: '1' },
  { code: '201', name: 'حساب‌های پرداختنی', type: 'liability', level: 'general', parentCode: '2' },
  { code: '301', name: 'سرمایه', type: 'equity', level: 'general', parentCode: '3' },
  { code: '401', name: 'فروش کالا', type: 'revenue', level: 'general', parentCode: '4' },
  { code: '501', name: 'بهای تمام‌شده کالای فروش‌رفته', type: 'expense', level: 'general', parentCode: '5' },
  { code: '502', name: 'هزینه‌های عمومی', type: 'expense', level: 'general', parentCode: '5' },
  { code: '503', name: 'اختلاف قیمت و تعدیل انبار', type: 'expense', level: 'general', parentCode: '5' },
  { code: '104', name: 'مالیات خرید و اعتبار مالیاتی', type: 'asset', level: 'general', parentCode: '1' },
  { code: '105', name: 'اسناد دریافتنی', type: 'asset', level: 'general', parentCode: '1' },
  { code: '202', name: 'مالیات و عوارض فروش', type: 'liability', level: 'general', parentCode: '2' },
  { code: '203', name: 'اسناد پرداختنی', type: 'liability', level: 'general', parentCode: '2' },
  { code: '402', name: 'سایر درآمدهای عملیاتی', type: 'revenue', level: 'general', parentCode: '4' }
]);

export function assertJalaliDate(value) {
  if (typeof value !== 'string' || !/^1[34-5]\d{2}\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(value)) {
    throw new Error('تاریخ شمسی باید به صورت 1405/01/01 باشد');
  }
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if ((month >= 7 && month <= 11 && day > 30) || (month === 12 && day > 30)) {
    throw new Error('روز ماه شمسی نامعتبر است');
  }
  const year = Number(value.slice(0, 4));
  const valid = Jalali.fromDate(Jalali.toDate(year, month, day));
  if (valid.year !== year || valid.month !== month || valid.day !== day) {
    throw new Error('تاریخ شمسی یا کبیسه معتبر نیست');
  }
  return value;
}

export function validateFiscalPeriod(period, existing = []) {
  if (!period || typeof period.companyId !== 'string' || !period.companyId) throw new Error('شرکت دوره مالی مشخص نیست');
  assertJalaliDate(period.startDate);
  assertJalaliDate(period.endDate);
  if (period.startDate > period.endDate) throw new Error('پایان دوره قبل از آغاز دوره است');
  if (!PERIOD_STATUSES.includes(period.status || (period.closed ? 'closed' : 'open'))) throw new Error('وضعیت دوره مالی نامعتبر است');
  if (existing.some(p => p.companyId === period.companyId && p.id !== period.id && period.startDate <= p.endDate && period.endDate >= p.startDate)) {
    throw new Error('دوره مالی با دوره دیگری هم‌پوشانی دارد');
  }
  return true;
}

export function validateAccount(account, existing = []) {
  if (!account?.companyId || !/^\d{1,12}$/.test(String(account.code || ''))) throw new Error('کد حساب یا شرکت نامعتبر است');
  if (!ACCOUNT_LEVELS.includes(account.level) || !ACCOUNT_TYPES.includes(account.type)) throw new Error('سطح یا ماهیت حساب نامعتبر است');
  if (!String(account.name || '').trim()) throw new Error('نام حساب الزامی است');
  if (existing.some(a => a.companyId === account.companyId && a.code === account.code && a.id !== account.id)) {
    throw new Error('کد حساب در این شرکت تکراری است');
  }
  if (account.level === 'group') {
    if (account.parentCode) throw new Error('گروه حساب نمی‌تواند والد داشته باشد');
  } else {
    const parent = existing.find(a => a.companyId === account.companyId && a.code === account.parentCode);
    if (!parent || parent.active === false) throw new Error('حساب والد فعال در این شرکت یافت نشد');
    if (ACCOUNT_LEVELS.indexOf(parent.level) !== ACCOUNT_LEVELS.indexOf(account.level) - 1) throw new Error('رابطه سطوح حساب نامعتبر است');
    if (parent.type !== account.type) throw new Error('ماهیت حساب با والد سازگار نیست');
  }
  return true;
}

export function validateJournalLines(journal, accounts = [], { requireBalance = true, allowInactive = false, allowParent = false } = {}) {
  if (!journal?.companyId || !Array.isArray(journal.lines) || journal.lines.length < (requireBalance ? 2 : 1)) {
    throw new Error('سطرهای سند حسابداری نامعتبر است');
  }
  const totals = { debit: 0, credit: 0 };
  for (const line of journal.lines) {
    const account = accounts.find(a => a.id === line.accountId && a.companyId === journal.companyId);
    if (!account || (!allowInactive && account.active === false) || (!allowInactive && account.postable === false) || account.level === 'group') {
      throw new Error('حساب سند غیرمجاز، غیرفعال یا متعلق به شرکت دیگر است');
    }
    if (!allowParent && accounts.some(a => a.companyId === journal.companyId && a.parentCode === account.code)) {
      throw new Error('ثبت سند فقط روی حساب بدون زیرمجموعه مجاز است');
    }
    if (!Number.isSafeInteger(line.debit) || !Number.isSafeInteger(line.credit) ||
        line.debit < 0 || line.credit < 0 || (line.debit > 0) === (line.credit > 0)) {
      throw new Error('هر سطر فقط باید بدهکار یا بستانکار معتبر داشته باشد');
    }
    totals.debit += line.debit;
    totals.credit += line.credit;
    if (!Number.isSafeInteger(totals.debit) || !Number.isSafeInteger(totals.credit)) throw new Error('سرریز مبلغ سند');
  }
  if (requireBalance && (totals.debit === 0 || totals.debit !== totals.credit)) throw new Error('سند حسابداری تراز نیست');
  return totals;
}

export function validateJournal(journal, accounts = [], period = null, options = {}) {
  if (!period || period.companyId !== journal?.companyId) throw new Error('دوره مالی این شرکت معتبر نیست');
  if (period.closed === true || period.status === 'closed') throw new Error('دوره مالی بسته است');
  assertJalaliDate(journal.date);
  if (journal.date < period.startDate || journal.date > period.endDate) throw new Error('تاریخ سند خارج از دوره مالی است');
  return validateJournalLines(journal, accounts, options);
}

export function journalSourceKey(companyId, sourceType, sourceId, revision = 1) {
  if (![companyId, sourceType, sourceId].every(x => typeof x === 'string' && x.trim()) ||
      !Number.isSafeInteger(revision) || revision < 1) throw new Error('منشأ سند نامعتبر است');
  return JSON.stringify([companyId, sourceType, sourceId, revision]);
}

export function reversingLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) throw new Error('سطرهای سند اصلی موجود نیست');
  return lines.map(line => ({
    accountId: line.accountId, debit: line.credit, credit: line.debit,
    description: line.description || ''
  }));
}
