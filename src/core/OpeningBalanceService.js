import { StorageService } from './StorageService.js';
import { DataScope } from './DataScope.js';
import { Auth } from './Auth.js';
import { AuditService } from './AuditService.js';
import {
  validateJournal, journalSourceKey
} from './AccountingCore.mjs';
import { previewOpeningBalances } from './OpeningBalanceDryRun.mjs';

// Only a balanced opening ledger for VERIFIED EXISTING master data is posted.
// This does not import legacy contacts, cash transactions or inventory movements.
// Those must be separately reconciled before any public migration claim.
const STORES = [
  'fiscal_periods', 'account_chart', 'journal_entries', 'journal_lines',
  'contacts', 'products', 'warehouses', 'treasury', 'inventory_balances',
  'invoices', 'stock_movements', 'settlements', 'cheques', 'expenses',
  'stocktakes', 'settings', 'audit_events'
];

const typeByRole = {
  receivable: 'asset',
  payable: 'liability',
  inventory: 'asset',
  cash: 'asset',
  equity: 'equity'
};
const assertAdmin = () => {
  if (!Auth.isAdmin()) throw Error('پیش‌ثبت افتتاحیه فقط برای مدیر مجاز است');
};
const markerId = (companyId, periodId) =>
  'opening_ledger_v1:' + JSON.stringify([companyId, periodId]);
const owns = (item, companyId, name) => {
  if (!item || item.companyId !== companyId) {
    throw Error(name + ' در شرکت فعال یافت نشد');
  }
  return item;
};

async function examine(tx, companyId, input) {
  const period = owns(await tx.get('fiscal_periods', input.periodId),
    companyId, 'دوره افتتاحیه');
  const journalRows = await tx.getAllByIndex('journal_entries', 'companyId', companyId);
  const posted = journalRows.filter(j => j.status === 'posted');
  const marker = await tx.get('settings', markerId(companyId, period.id));
  const report = previewOpeningBalances({
    ...input, companyId, period,
    priorPostedJournals: posted.length + (marker ? 1 : 0)
  });
  const problems = [...report.issues];
  if (input.openingDate !== period.startDate) problems.push('NOT_PERIOD_START');

  // Opening must not be silently layered over commercial history or stocktake.
  for (const store of ['invoices','stock_movements','settlements','cheques','expenses','stocktakes']) {
    const activities = (await tx.getAll(store)).filter(row => row.companyId === companyId);
    if (activities.length) problems.push('EXISTING_' + store.toUpperCase());
  }
  const cashMovements = (await tx.getAll('treasury')).filter(row =>
    row.companyId === companyId && row.recordType === 'transaction');
  if (cashMovements.length) problems.push('EXISTING_TREASURY_TRANSACTIONS');
  for (const row of input.contacts || []) {
    owns(await tx.get('contacts', row.contactId), companyId, 'شخص افتتاحیه');
  }
  for (const row of input.stock || []) {
    owns(await tx.get('warehouses', row.warehouseId), companyId, 'انبار افتتاحیه');
    owns(await tx.get('products', row.productId), companyId, 'کالای افتتاحیه');
    const id = JSON.stringify([companyId, row.warehouseId, row.productId]);
    const current = owns(await tx.get('inventory_balances', id), companyId,
      'مانده موجودی');
    if (current.quantityUnits !== row.quantityUnits || current.value !== row.value) {
      problems.push('LIVE_INVENTORY_MISMATCH');
    }
  }
  for (const row of input.cash || []) {
    const account = owns(await tx.get('treasury', row.accountId),
      companyId, 'حساب بانکی یا صندوق');
    if (account.recordType !== 'account') {
      throw Error('مرجع افتتاحیه بانک/صندوق یک حساب خزانه نیست');
    }
    if (!Number.isSafeInteger(account.initialBalance) ||
        account.initialBalance !== row.balance) {
      problems.push('LIVE_CASH_MISMATCH');
    }
  }
  const accounts = await tx.getAllByIndex('account_chart', 'companyId', companyId);
  const actualById = new Map(accounts.map(row => [row.id, row]));
  for (const line of input.lines || []) {
    const acct = actualById.get(line.accountId);
    if (!acct) throw Error('کدینگ افتتاحیه متعلق به شرکت فعال نیست');
    if (line.role in typeByRole && acct.type !== typeByRole[line.role]) {
      throw Error('ماهیت حساب با نقش افتتاحیه هماهنگ نیست');
    }
  }
  // All chart rules are enforced even for readonly preview. This rejects
  // inactive accounts, group parents, out-of-period dates and overflow.
  const validated = validateJournal({
    companyId, date: input.openingDate, lines: (input.lines || []).map(row => ({
      accountId: row.accountId, debit: row.debit, credit: row.credit
    }))
  }, accounts, period);
  if (validated.debit !== report.journal.debit ||
      validated.credit !== report.journal.credit) {
    throw Error('گزارش افتتاحیه با سطرهای سند مطابقت ندارد');
  }
  return { period, report, problems: [...new Set(problems)], validated };
}

class OpeningBalanceServiceImpl {
  async preview(input) {
    assertAdmin();
    const companyId = await DataScope.companyId();
    return StorageService.transaction(STORES, async tx => {
      const result = await examine(tx, companyId, input);
      return {
        ...result.report, issues: result.problems,
        readiness: result.problems.length ? 'blocked' : 'ready-for-review',
        writePerformed: false
      };
    }, 'readonly');
  }

  async commit(input, { confirmation } = {}) {
    assertAdmin();
    if (confirmation !== 'CONFIRM_OPENING_LEDGER') {
      throw Error('تأیید صریح ثبت قطعی افتتاحیه لازم است');
    }
    const companyId = await DataScope.companyId();
    return StorageService.transaction(STORES, async tx => {
      // Re-evaluate inside the SAME write transaction. Never trust a stale
      // previous preview if the fiscal period or master data has changed.
      const { period, report, problems, validated } =
        await examine(tx, companyId, input);
      if (problems.length) {
        throw Error('افتتاحیه به دلیل مغایرت متوقف شد: ' + problems.join(', '));
      }
      const id = StorageService.uid('jn_open_');
      const sourceKey = journalSourceKey(companyId, 'opening_balance', period.id);
      const existing = await tx.getAllByIndex('journal_entries', 'sourceKey', sourceKey);
      if (existing.length) throw Error('سند افتتاحیه قبلاً ثبت شده است');

      const now = new Date().toISOString();
      const userId = Auth.current().id;
      const journal = {
        id, companyId, periodId: period.id, date: input.openingDate,
        status: 'posted', description: 'سند افتتاحیه کنترل‌شده',
        sourceKey, sourceType: 'opening_balance', sourceId: period.id,
        revision: 1, ...validated, createdBy: userId,
        postedBy: userId, postedAt: now
      };
      await tx.add('journal_entries', journal);
      for (const [position, line] of input.lines.entries()) {
        await tx.add('journal_lines', {
          id: StorageService.uid('jl_open_'), companyId, journalId: id,
          position, accountId: line.accountId,
          debit: line.debit, credit: line.credit,
          description: ''
        });
      }
      await tx.add('settings', {
        id: markerId(companyId, period.id), companyId,
        schemaVersion: 1, mode: 'existing-master-opening-ledger',
        journalId: id, periodId: period.id, createdAt: now, createdBy: userId,
        counts: report.sourceCounts, totals: report.journal,
        // Deliberately do not store customer names, amounts by contact or
        // a second editable copy of sensitive source spreadsheet contents.
        reconciled: report.issues.length === 0
      });
      await AuditService.append(tx, {
        companyId, eventType: 'opening_posted', sourceType: 'journal',
        sourceId: id, commandKey: 'opening-ledger:' + period.id,
        businessDate: input.openingDate, lineCount: input.lines.length
      });
      return { journalId: id, periodId: period.id, companyId,
        totals: report.journal, status: 'posted' };
    });
  }
}
export const OpeningBalanceService = new OpeningBalanceServiceImpl();
