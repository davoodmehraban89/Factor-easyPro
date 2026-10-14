import { assertJalaliDate } from './AccountingCore.mjs';

/**
 * Deterministic preflight for a historical-company opening balance import.
 * IMPORTANT: No database access or writes, journal posting or activation here.
 * The application must never infer opening balances from incomplete legacy
 * invoices or silently change cash and inventory during import.
 */
const id = value => typeof value === 'string' && value.trim() !== '';
const rial = (value, label, { signed = false } = {}) => {
  if (!Number.isSafeInteger(value) || (!signed && value < 0)) {
    throw new RangeError(label + ' باید ریال صحیح و معتبر باشد');
  }
  return value;
};
const plus = (a, b, label) => {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new RangeError('سرریز ' + label);
  return result;
};
function unique(rows, key, label) {
  const seen = new Set();
  for (const row of rows) {
    const value = key(row);
    if (!id(value) || seen.has(value)) throw Error('شناسه ناقص یا تکراری ' + label);
    seen.add(value);
  }
}
function rows(input, name) {
  if (!Array.isArray(input)) throw TypeError('فهرست ' + name + ' نامعتبر است');
  return input;
}

export function previewOpeningBalances({
  companyId, openingDate, period,
  lines = [], contacts = [], stock = [], cash = [],
  priorPostedJournals = 0
} = {}) {
  if (!id(companyId) || !period || period.companyId !== companyId ||
      period.closed || period.status === 'closed' ||
      typeof openingDate !== 'string' ||
      !/^1[34-5]\d{2}\/\d{2}\/\d{2}$/.test(openingDate) ||
      openingDate < period.startDate || openingDate > period.endDate) {
    throw Error('شرکت، دوره یا تاریخ افتتاحیه نامعتبر است');
  }
  assertJalaliDate(openingDate);
  assertJalaliDate(period.startDate);
  assertJalaliDate(period.endDate);
  for (const group of [lines, contacts, stock, cash]) rows(group, 'افتتاحیه');
  unique(lines, r => r.accountId, 'حساب افتتاحیه');
  unique(contacts, r => r.contactId, 'شخص');
  unique(stock, r => JSON.stringify([r.warehouseId, r.productId]), 'موجودی انبار');
  unique(cash, r => r.accountId, 'بانک یا صندوق');

  const allowedRoles = new Set(['receivable', 'payable', 'inventory', 'cash', 'equity', 'other']);
  const financial = { debit: 0, credit: 0 };
  const roleNet = { receivable: 0, payable: 0, inventory: 0, cash: 0 };
  for (const row of lines) {
    if (!allowedRoles.has(row.role)) throw Error('نقش حساب افتتاحیه نامعتبر است');
    const debit = rial(row.debit, 'بدهکار');
    const credit = rial(row.credit, 'بستانکار');
    if (debit && credit) throw Error('حساب همزمان بدهکار و بستانکار نمی‌شود');
    financial.debit = plus(financial.debit, debit, 'جمع بدهکار');
    financial.credit = plus(financial.credit, credit, 'جمع بستانکار');
    if (row.role in roleNet) {
      const normal = row.role === 'payable' ? credit - debit : debit - credit;
      roleNet[row.role] = plus(roleNet[row.role], normal, 'مانده نقش');
    }
  }

  const sources = { receivable: 0, payable: 0, inventory: 0, cash: 0 };
  for (const row of contacts) {
    sources.receivable = plus(sources.receivable, rial(row.receivable, 'طلب اشخاص'), 'طلب اشخاص');
    sources.payable = plus(sources.payable, rial(row.payable, 'بدهی اشخاص'), 'بدهی اشخاص');
  }
  for (const row of stock) {
    if (!id(row.warehouseId) || !id(row.productId) ||
        !Number.isSafeInteger(row.quantityUnits) || row.quantityUnits < 0) {
      throw Error('موجودی افتتاحیه کالا نامعتبر است');
    }
    sources.inventory = plus(sources.inventory, rial(row.value, 'ارزش موجودی'), 'ارزش موجودی');
  }
  for (const row of cash) {
    sources.cash = plus(sources.cash, rial(row.balance, 'مانده صندوق', { signed: true }), 'مانده نقد');
  }
  if (!Number.isSafeInteger(priorPostedJournals) || priorPostedJournals < 0) {
    throw Error('تعداد اسناد پیشین نامعتبر است');
  }
  const issues = [];
  if (priorPostedJournals > 0) issues.push('EXISTING_POSTED_JOURNALS');
  if (!lines.length) issues.push('MISSING_OPENING_JOURNAL_LINES');
  if (financial.debit !== financial.credit) issues.push('UNBALANCED_OPENING_JOURNAL');
  const differences = {};
  for (const role of Object.keys(sources)) {
    differences[role] = sources[role] - roleNet[role];
    if (!Number.isSafeInteger(differences[role])) throw new RangeError('سرریز اختلاف افتتاحیه');
    if (differences[role] !== 0) issues.push('OPENING_' + role.toUpperCase() + '_MISMATCH');
  }
  return Object.freeze({
    companyId, openingDate, readiness: issues.length === 0 ? 'ready-for-review' : 'blocked',
    issues: Object.freeze(issues), journal: Object.freeze(financial),
    sources: Object.freeze(sources), differences: Object.freeze(differences),
    sourceCounts: Object.freeze({ contacts: contacts.length, stock: stock.length,
      cash: cash.length, lines: lines.length }),
    writePerformed: false
  });
}
