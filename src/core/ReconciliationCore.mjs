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
  settlements = [], transactions = [], cheques = [], inventoryBalances = [],
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
  const settlementTransactionUse = new Map();
  const settlementsByInvoice = new Map();
  for (const row of settlements) {
    if (!invoiceById.has(row.invoiceId)) report('ORPHAN_SETTLEMENT', 'تسویه به فاکتور ناموجود متصل است', row.id);
    const cash = allTransactions.get(row.transactionId);
    if (!cash) {
      report('MISSING_SETTLEMENT_TRANSACTION', 'تراکنش مربوط به تسویه یافت نشد', row.id);
    } else {
      if (cash.refInvoiceId !== undefined && cash.refInvoiceId !== null &&
          cash.refInvoiceId !== row.invoiceId) {
        report('SETTLEMENT_REFERENCE_MISMATCH', 'ارجاع تسویه و تراکنش خزانه به فاکتور متفاوت است', row.id);
      }
      if (safeMoney(cash.amount) && cash.amount !== row.amount) {
        report('SETTLEMENT_CASH_MISMATCH', 'مبلغ تسویه با تراکنش خزانه متناظر برابر نیست', row.id,
          'error', row.amount, cash.amount);
      }
      if (settlementTransactionUse.has(row.transactionId)) {
        report('DUPLICATE_SETTLEMENT_TRANSACTION', 'یک تراکنش خزانه در چند تسویه استفاده شده است', row.id);
      }
      settlementTransactionUse.set(row.transactionId, row.id);
    }
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


  // A05: read-only cheque lifecycle and its bank/cash evidence.
  // Legacy unposted cheques are not asserted to have journal references.
  // Only posted integrated cheques can be reconciled against double-entry GL.
  if (integrated) {
    const chequeById = new Map(cheques.map(row => [row.id, row]));
    // One account index for the entire report. A linear treasury.find for
    // every cleared cheque was O(cheques × treasury rows) and scaled poorly
    // when real stores have thousands of cheques and bank/cash records.
    const cashAccountById = new Map(transactions
      .filter(row => row.recordType === 'account')
      .map(row => [row.id, row]));
    const moneyByCheque = new Map();
    for (const transaction of transactions.filter(row =>
      row.recordType === 'transaction' && row.refChequeId)) {
      if (!moneyByCheque.has(transaction.refChequeId)) moneyByCheque.set(transaction.refChequeId, []);
      moneyByCheque.get(transaction.refChequeId).push(transaction);
      if (!chequeById.has(transaction.refChequeId)) {
        report('ORPHAN_CHEQUE_CASH', 'دریافت یا پرداخت چک به چک ناموجود متصل است', transaction.id);
      }
    }
    for (const cheque of cheques.filter(row => row.financePosted)) {
      const origin = byJournal.get(cheque.journalId);
      if (!origin || origin.status !== 'posted' || origin.sourceType !== 'cheque' ||
          origin.sourceId !== cheque.id) {
        report('CHEQUE_SOURCE_JOURNAL_MISSING', 'چک قطعی سند اولیه معتبر ندارد', cheque.id);
      }
      const money = moneyByCheque.get(cheque.id) || [];
      if (cheque.status === 'pending') {
        if (cheque.statusJournalId || money.length) {
          report('PENDING_CHEQUE_HAS_SETTLEMENT', 'چک در جریان دارای سند یا تراکنش تعیین‌تکلیف است', cheque.id);
        }
        continue;
      }
      const final = byJournal.get(cheque.statusJournalId);
      if (!final || final.status !== 'posted' || final.sourceType !== 'cheque_status' ||
          final.sourceId !== cheque.id) {
        report('CHEQUE_STATUS_JOURNAL_MISSING', 'وضعیت قطعی چک سند تعیین‌تکلیف معتبر ندارد', cheque.id);
      }
      if (cheque.status === 'cleared') {
        if (money.length !== 1) {
          report('CHEQUE_CLEARING_CASH_COUNT', 'چک وصول‌شده باید دقیقاً یک دریافت یا پرداخت خزانه داشته باشد',
            cheque.id, 'error', 1, money.length);
        }
        for (const transaction of money) {
          const direction = cheque.direction === 'inbound' ? 'receipt' : 'payment';
          if (transaction.type !== direction || transaction.amount !== cheque.amount ||
              transaction.journalId !== cheque.statusJournalId || !transaction.financePosted) {
            report('CHEQUE_CLEARING_CASH_MISMATCH', 'وصول چک با جهت یا مبلغ یا سند خزانه مغایرت دارد', cheque.id);
          }
        }
        // New finance-posted cheques retain the explicitly approved bank ID.
        // Older cleared cheques may lack this field; do not invent historical
        // evidence or silently fabricate a clearing account for those rows.
        if (cheque.clearingAccountId) {
          const selected = cashAccountById.get(cheque.clearingAccountId);
          if (!selected) {
            report('CHEQUE_CLEARING_ACCOUNT_MISSING',
              'حساب انتخاب‌شده وصول چک در خزانه یافت نشد', cheque.id);
          }
          const expectedField = cheque.direction === 'inbound' ? 'toAccountId' : 'fromAccountId';
          if (money.some(t => t[expectedField] !== cheque.clearingAccountId)) {
            report('CHEQUE_CLEARING_ACCOUNT_MISMATCH',
              'حساب مقصد یا مبدأ تراکنش چک با حساب تأییدشده متفاوت است', cheque.id);
          }
          const statusLines = journalLinesById.get(cheque.statusJournalId) || [];
          const expectedCashLine = statusLines.some(line =>
            line.accountId === selected?.ledgerAccountId &&
            line.debit === (cheque.direction === 'inbound' ? cheque.amount : 0) &&
            line.credit === (cheque.direction === 'outbound' ? cheque.amount : 0));
          if (!selected?.ledgerAccountId || !expectedCashLine) {
            report('CHEQUE_CLEARING_LEDGER_MISMATCH',
              'سطر بانک سند وصول با حساب انتخاب‌شده و مبلغ چک تطبیق ندارد', cheque.id);
          }
        }
      } else if (money.length) {
        report('NONCLEARED_CHEQUE_HAS_CASH', 'چک وصول‌نشده دارای دریافت یا پرداخت خزانه است', cheque.id);
      }
      if (cheque.status === 'spent') {
        if (!cheque.endorseeContactId || cheque.endorseeContactId === cheque.contactId ||
            cheque.direction !== 'inbound') {
          report('CHEQUE_ENDORSEE_INVALID',
            'واگذاری چک دریافتی فاقد شخص ثالث معتبر است', cheque.id);
        } else {
          const lines = journalLinesById.get(cheque.statusJournalId) || [];
          const matchesPayable=lines.some(l => chart.get(l.accountId)?.code === '201' &&
            l.contactId === cheque.endorseeContactId && l.debit === cheque.amount && l.credit === 0);
          const matchesCheque=lines.some(l => chart.get(l.accountId)?.code === '105' &&
            l.contactId === cheque.contactId && l.credit === cheque.amount && l.debit === 0);
          if (!matchesPayable || !matchesCheque) {
            report('CHEQUE_ENDORSEMENT_GL_MISMATCH',
              'سند واگذاری چک باید بدهکار شخص ثالث و بستانکار اسناد دریافتی صادرکننده باشد', cheque.id);
          }
        }
      }
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
      cheques: cheques.filter(row => row.financePosted).length,
      inventoryBalances: inventoryBalances.length, issues: issues.length },
    totals: { inventoryBook, inventoryLedger, stockUnits },
    issues
  };
}
