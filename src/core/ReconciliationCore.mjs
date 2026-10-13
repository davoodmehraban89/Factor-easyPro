// Factor-easyPro V2 — read-only control totals and discrepancy diagnostics.
// Pure function: never repairs or mutates financial, settlement or stock records.
import { qtyUnits } from './RetailFinanceCore.mjs';

const safeMoney = value => Number.isSafeInteger(value) && value >= 0;
const keyOf = (w,p) => JSON.stringify([w,p]);
const safeAdd = (a,b) => {
  const value = a+b;
  if (!Number.isSafeInteger(value)) throw Error('سرریز محاسبات مغایرت‌گیری');
  return value;
};

export function reconcileFinancialData({
  accounts = [], journals = [], journalLines = [], invoices = [],
  settlements = [], transactions = [], inventoryBalances = [],
  stockMovements = [], integrated = false
} = {}) {
  const issues = [];
  const report = (code, message, reference = '', severity = 'error', expected = null, actual = null) => {
    issues.push({ code, severity, reference: String(reference || ''), message, expected, actual });
  };
  const chart = new Map(accounts.map(a => [a.id, a]));
  const posted = journals.filter(j => j.status === 'posted');
  const byJournal = new Map(journals.map(j => [j.id, j]));
  const journalLinesById = new Map();
  for (const line of journalLines) {
    const journal = byJournal.get(line.journalId);
    if (!journal) {
      report('ORPHAN_JOURNAL_LINE', 'سطر سند بدون سند اصلی', line.id);
      continue;
    }
    if (!journalLinesById.has(line.journalId)) journalLinesById.set(line.journalId, []);
    journalLinesById.get(line.journalId).push(line);
    if (!chart.has(line.accountId)) report('UNKNOWN_ACCOUNT', 'سطر سند به حساب ناموجود اشاره دارد', line.journalId);
  }
  for (const journal of posted) {
    const lines = journalLinesById.get(journal.id) || [];
    if (!lines.length) {
      report('EMPTY_JOURNAL', 'سند قطعی بدون سطر حسابداری', journal.id);
      continue;
    }
    let debit = 0, credit = 0, valid = true;
    for (const line of lines) {
      if (!safeMoney(line.debit) || !safeMoney(line.credit) || (line.debit && line.credit)) {
        report('INVALID_JOURNAL_LINE', 'بدهکار یا بستانکار سطر سند نامعتبر است', journal.id);
        valid = false; break;
      }
      debit = safeAdd(debit, line.debit);
      credit = safeAdd(credit, line.credit);
    }
    if (!valid) continue;
    if (debit !== credit) report('JOURNAL_UNBALANCED', 'مجموع بدهکار و بستانکار سند برابر نیست', journal.id, 'error', debit, credit);
    if (journal.debit !== debit || journal.credit !== credit) {
      report('JOURNAL_TOTAL_MISMATCH', 'جمع ثبت‌شده روی سند با ردیف‌های آن یکسان نیست',
        journal.id, 'error', debit, journal.debit);
    }
  }

  const allTransactions = new Map(transactions.filter(t => t.recordType === 'transaction').map(t => [t.id,t]));
  const invoiceById = new Map(invoices.map(i => [i.id,i]));
  const settlementsByInvoice = new Map();
  for (const row of settlements) {
    if (!invoiceById.has(row.invoiceId)) report('ORPHAN_SETTLEMENT', 'تسویه به فاکتور ناموجود متصل است', row.id);
    if (!allTransactions.has(row.transactionId)) report('MISSING_SETTLEMENT_TRANSACTION', 'تراکنش مربوط به تسویه یافت نشد', row.id);
    if (!safeMoney(row.amount) || row.amount === 0) report('INVALID_SETTLEMENT_AMOUNT', 'مبلغ تسویه نامعتبر است', row.id);
    if (!settlementsByInvoice.has(row.invoiceId)) settlementsByInvoice.set(row.invoiceId, []);
    settlementsByInvoice.get(row.invoiceId).push(row);
  }
  let checkedInvoices = 0;
  for (const inv of invoices) {
    if (inv.isPreInvoice || !inv.financePosted) continue;
    checkedInvoices++;
    const source = byJournal.get(inv.journalId);
    if (!source || source.status !== 'posted' || source.sourceType !== 'invoice' || source.sourceId !== inv.id) {
      report('INVOICE_JOURNAL_MISSING', 'فاکتور قطعی سند مالی معتبر ندارد', inv.number || inv.id);
    }
    if (!safeMoney(inv.grandTotal) || !safeMoney(inv.paidAmount) || !safeMoney(inv.remaining)) {
      report('INVALID_INVOICE_TOTAL', 'مبلغ یا مانده فاکتور نامعتبر است', inv.number || inv.id);
      continue;
    }
    const applied = (settlementsByInvoice.get(inv.id) || []).reduce((s,x) =>
      safeMoney(x.amount) ? safeAdd(s,x.amount) : s, 0);
    if (inv.paidAmount !== applied) {
      report('INVOICE_SETTLEMENT_MISMATCH', 'جمع تسویه‌ها با پرداخت‌شده فاکتور برابر نیست',
        inv.number || inv.id, 'error', inv.paidAmount, applied);
    }
    if (safeAdd(inv.paidAmount,inv.remaining) !== inv.grandTotal) {
      report('INVOICE_BALANCE_MISMATCH', 'مبلغ پرداخت‌شده و مانده با مبلغ کل فاکتور تطبیق ندارد',
        inv.number || inv.id, 'error', inv.grandTotal, inv.paidAmount + inv.remaining);
    }
  }

  let inventoryBook = 0, inventoryLedger = 0;
  let stockUnits = 0;
  if (integrated) {
    const inventoryAccountIds = new Set(accounts.filter(a => a.code === '103').map(a => a.id));
    if (!inventoryAccountIds.size) report('INVENTORY_ACCOUNT_MISSING', 'حساب موجودی کالا (۱۰۳) در کدینگ وجود ندارد');
    for (const line of journalLines) {
      if (!inventoryAccountIds.has(line.accountId)) continue;
      if (byJournal.get(line.journalId)?.status !== 'posted') continue;
      if (safeMoney(line.debit) && safeMoney(line.credit)) {
        inventoryLedger = safeAdd(inventoryLedger,line.debit-line.credit);
      }
    }
    const byMovement = new Map();
    for (const move of stockMovements) {
      if (!['in','out'].includes(move.type)) {
        report('INVALID_STOCK_MOVEMENT', 'نوع گردش موجودی نامعتبر است', move.id);
        continue;
      }
      let units;
      try { units = qtyUnits(move.qty); }
      catch { report('INVALID_STOCK_QUANTITY', 'مقدار گردش انبار نامعتبر است', move.id); continue; }
      const key = keyOf(move.warehouseId,move.productId);
      const sign = move.type === 'in' ? 1 : -1;
      byMovement.set(key,safeAdd(byMovement.get(key) || 0,sign*units));
    }
    const byBalance = new Map();
    for (const b of inventoryBalances) {
      const key=keyOf(b.warehouseId,b.productId);
      if (byBalance.has(key)) report('DUPLICATE_STOCK_BALANCE', 'مانده تکراری برای کالا و انبار', b.id);
      byBalance.set(key,b);
      if (!safeMoney(b.quantityUnits) || !safeMoney(b.value)) {
        report('INVALID_STOCK_BALANCE', 'مانده مقدار یا ارزش انبار نامعتبر است', b.id);
        continue;
      }
      stockUnits = safeAdd(stockUnits,b.quantityUnits);
      inventoryBook = safeAdd(inventoryBook,b.value);
      if (b.quantityUnits !== (byMovement.get(key) || 0)) {
        report('STOCK_QUANTITY_MISMATCH', 'مقدار مانده انبار با جمع گردش کالا یکسان نیست',
          b.id, 'error', b.quantityUnits, byMovement.get(key) || 0);
      }
    }
    for (const [key,units] of byMovement) {
      if (units !== 0 && !byBalance.has(key)) {
        report('MISSING_STOCK_BALANCE', 'گردش کالا بدون رکورد مانده انبار', key);
      }
    }
    if (inventoryLedger !== inventoryBook) {
      report('INVENTORY_LEDGER_MISMATCH', 'ارزش انبار با مانده حساب کل موجودی کالا برابر نیست',
        '103', 'error', inventoryBook, inventoryLedger);
    }
  }
  return {
    integrated, checkedAt: new Date().toISOString(),
    counts: { journals: posted.length, invoices: checkedInvoices, settlements: settlements.length,
      inventoryBalances: inventoryBalances.length, issues: issues.length },
    totals: { inventoryBook, inventoryLedger, stockUnits },
    issues
  };
}
