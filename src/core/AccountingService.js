// Factor-easyPro V2 / Phase 1: company-scoped, atomic double-entry ledger.
// No automatic posting from legacy invoices until Phase 2's unified transaction.
import { StorageService } from './StorageService.js';
import { DataScope } from './DataScope.js';
import { Auth } from './Auth.js';
import { buildLedgerReports } from './LedgerReports.mjs';
import {
  DEFAULT_CHART, assertJalaliDate, validateAccount, validateFiscalPeriod,
  validateJournal, validateJournalLines, journalSourceKey, reversingLines
} from './AccountingCore.mjs';

const requireAccountingAdmin = () => { if(!Auth.isAdmin()) throw new Error('ثبت یا ویرایش ساختار حسابداری فقط برای مدیر مجاز است'); };
const RESERVED_SOURCES = new Set(['invoice','treasury','expense','cheque','cheque_status','stocktake']);
const ensureManualSource = type => {
  if (RESERVED_SOURCES.has(type)) throw new Error('منشأ عملیاتی رزروشده فقط توسط موتور حسابداری یکپارچه ثبت می‌شود');
};
const uid = prefix => StorageService.uid(prefix);
const actor = () => Auth.current()?.id || null;
const entriesFor = (tx, companyId) => tx.getAllByIndex('journal_entries', 'companyId', companyId);
const periodFor = async (tx, companyId, periodId) => {
  const period = await tx.get('fiscal_periods', periodId);
  if (!period || period.companyId !== companyId) throw new Error('دوره مالی این شرکت پیدا نشد');
  return period;
};
const ensurePeriodOpen = period => {
  if (period.closed || period.status === 'closed') throw new Error('دوره مالی بسته است');
};
const cleanLines = lines => (lines || []).map(line => ({
  accountId: line.accountId,
  debit: line.debit,
  credit: line.credit,
  description: String(line.description || '').trim()
}));

class AccountingServiceImpl {
  async financialReports(filter = {}) {
    const companyId = await DataScope.companyId();
    return StorageService.transaction(['account_chart', 'journal_entries', 'journal_lines'], async tx => {
      const accounts = await tx.getAllByIndex('account_chart', 'companyId', companyId);
      const journals = await tx.getAllByIndex('journal_entries', 'companyId', companyId);
      const lines = await tx.getAllByIndex('journal_lines', 'companyId', companyId);
      return buildLedgerReports(accounts, journals, lines, filter);
    }, 'readonly');
  }
  async listAccounts() {
    const companyId = await DataScope.companyId();
    return StorageService.getAllByIndex('account_chart', 'companyId', companyId);
  }

  async addAccount(data) {
    requireAccountingAdmin();
    const companyId = await DataScope.companyId();
    const account = {
      id: uid('acc_'), code: String(data.code || '').trim(),
      name: String(data.name || '').trim(), level: data.level, type: data.type,
      parentCode: data.parentCode || null, active: data.active !== false,
      postable: data.postable !== false, companyId, createdBy: actor()
    };
    return StorageService.transaction(['account_chart', 'journal_lines'], async tx => {
      const existing = await tx.getAllByIndex('account_chart', 'companyId', companyId);
      validateAccount(account, existing);
      // A posting account may not become a parent after journal lines exist.
      // Otherwise future postings would be rejected while historical balances remain ambiguous.
      if (account.parentCode) {
        const parent = existing.find(a => a.code === account.parentCode);
        const movements = await tx.getAllByIndex('journal_lines', 'companyId', companyId);
        if (movements.some(line => line.accountId === parent.id)) {
          throw new Error('حساب والد گردش مالی دارد؛ افزودن زیرحساب به آن مجاز نیست');
        }
      }
      await tx.put('account_chart', account);
      return account;
    });
  }

  async seedDefaultChart() {
    requireAccountingAdmin();
    const companyId = await DataScope.companyId();
    return StorageService.transaction('account_chart', async tx => {
      const existing = await tx.getAllByIndex('account_chart', 'companyId', companyId);
      let added = 0;
      for (const template of DEFAULT_CHART) {
        if (existing.some(a => a.code === template.code)) continue;
        const account = { ...template, companyId, id: uid('acc_'), active: true, createdBy: actor() };
        validateAccount(account, existing);
        await tx.put('account_chart', account);
        existing.push(account);
        added++;
      }
      return { added, total: existing.length };
    });
  }

  async listPeriods() {
    return StorageService.getAllByIndex('fiscal_periods', 'companyId', await DataScope.companyId());
  }

  async createPeriod(data) {
    requireAccountingAdmin();
    const companyId = await DataScope.companyId();
    const period = {
      id: uid('fp_'), companyId, name: String(data.name || '').trim(),
      startDate: data.startDate, endDate: data.endDate,
      status: 'open', closed: false, createdBy: actor()
    };
    if (!period.name) throw new Error('نام دوره مالی الزامی است');
    return StorageService.transaction('fiscal_periods', async tx => {
      validateFiscalPeriod(period, await tx.getAllByIndex('fiscal_periods', 'companyId', companyId));
      await tx.put('fiscal_periods', period);
      return period;
    });
  }

  async closePeriod(periodId) {
    if (!Auth.isAdmin()) throw new Error('بستن دوره مالی فقط برای مدیر مجاز است');
    const companyId = await DataScope.companyId();
    return StorageService.transaction(['fiscal_periods', 'journal_entries'], async tx => {
      const period = await periodFor(tx, companyId, periodId);
      ensurePeriodOpen(period);
      const journals = await entriesFor(tx, companyId);
      if (journals.some(j => j.periodId === periodId && j.status !== 'posted')) {
        throw new Error('دوره دارای اسناد پیش‌نویس است؛ ابتدا تعیین تکلیف شوند');
      }
      const closed = { ...period, status: 'closed', closed: true, closedBy: actor(), closedAt: new Date().toISOString() };
      await tx.put('fiscal_periods', closed);
      return closed;
    });
  }

  async listJournals({ periodId, status } = {}) {
    const companyId = await DataScope.companyId();
    const rows = await StorageService.getAllByIndex('journal_entries', 'companyId', companyId);
    return rows.filter(j => (!periodId || j.periodId === periodId) && (!status || j.status === status))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  }

  async getJournal(id) {
    const companyId = await DataScope.companyId();
    return StorageService.transaction(['journal_entries', 'journal_lines'], async tx => {
      const journal = await tx.get('journal_entries', id);
      if (!journal || journal.companyId !== companyId) throw new Error('سند در این شرکت یافت نشد');
      const lines = (await tx.getAllByIndex('journal_lines', 'journalId', id))
        .filter(l => l.companyId === companyId)
        .sort((a, b) => a.position - b.position);
      return { ...journal, lines };
    }, 'readonly');
  }

  // Drafts can be unbalanced, but must use valid accounts, dates and integer rial amounts.
  async saveDraftJournal(data) {
    requireAccountingAdmin();
    ensureManualSource(data.sourceType);
    const companyId = await DataScope.companyId();
    const id = uid('jn_');
    const lines = cleanLines(data.lines);
    const sourceKey = data.sourceType && data.sourceId
      ? journalSourceKey(companyId, data.sourceType, data.sourceId, data.revision || 1) : undefined;
    return StorageService.transaction(['account_chart', 'fiscal_periods', 'journal_entries', 'journal_lines'], async tx => {
      const period = await periodFor(tx, companyId, data.periodId);
      ensurePeriodOpen(period);
      assertJalaliDate(data.date);
      if (data.date < period.startDate || data.date > period.endDate) throw new Error('تاریخ سند خارج از دوره است');
      const accounts = await tx.getAllByIndex('account_chart', 'companyId', companyId);
      const totals = validateJournalLines({ ...data, lines, companyId }, accounts, { requireBalance: false });
      if (sourceKey) {
        const existing = await tx.getAllByIndex('journal_entries', 'sourceKey', sourceKey);
        if (existing.length) throw new Error('برای این منشأ قبلاً سند ثبت شده است');
      }
      const journal = { id, companyId, periodId: data.periodId, date: data.date,
        description: String(data.description || '').trim(), status: 'draft',
        sourceKey, sourceType: data.sourceType || null, sourceId: data.sourceId || null,
        revision: data.revision || 1, ...totals, createdBy: actor() };
      await tx.put('journal_entries', journal);
      for (const [position, line] of lines.entries()) {
        await tx.put('journal_lines', { ...line, id: uid('jl_'), companyId, journalId: id, position });
      }
      return journal;
    });
  }

  async updateDraftJournal(id, data, { post = false } = {}) {
    requireAccountingAdmin();
    const companyId = await DataScope.companyId();
    const lines = cleanLines(data.lines);
    return StorageService.transaction(['account_chart', 'fiscal_periods', 'journal_entries', 'journal_lines'], async tx => {
      const old = await tx.get('journal_entries', id);
      if (!old || old.companyId !== companyId || old.status !== 'draft') throw new Error('فقط پیش‌نویس این شرکت قابل ویرایش است');
      const period = await periodFor(tx, companyId, data.periodId);
      ensurePeriodOpen(period);
      assertJalaliDate(data.date);
      if (data.date < period.startDate || data.date > period.endDate) throw new Error('تاریخ سند خارج از دوره است');
      const accounts = await tx.getAllByIndex('account_chart', 'companyId', companyId);
      const totals = post
        ? validateJournal({ companyId, date: data.date, lines }, accounts, period)
        : validateJournalLines({ companyId, lines }, accounts, { requireBalance: false });
      const journal = {
        ...old, periodId: data.periodId, date: data.date,
        description: String(data.description || '').trim(), ...totals,
        status: post ? 'posted' : 'draft',
        ...(post ? { postedBy: actor(), postedAt: new Date().toISOString() } : {}),
        updatedBy: actor(), updatedAt: new Date().toISOString()
      };
      const prior = await tx.getAllByIndex('journal_lines', 'journalId', id);
      for (const line of prior) await tx.delete('journal_lines', line.id);
      await tx.put('journal_entries', journal);
      for (const [position, line] of lines.entries()) {
        await tx.put('journal_lines', { ...line, id: uid('jl_'), companyId, journalId: id, position });
      }
      return journal;
    });
  }

  async postJournal(data) {
    requireAccountingAdmin();
    ensureManualSource(data.sourceType);
    const companyId = await DataScope.companyId();
    const id = uid('jn_');
    const lines = cleanLines(data.lines);
    const sourceKey = data.sourceType && data.sourceId
      ? journalSourceKey(companyId, data.sourceType, data.sourceId, data.revision || 1) : undefined;
    return StorageService.transaction(['account_chart', 'fiscal_periods', 'journal_entries', 'journal_lines'], async tx => {
      const period = await periodFor(tx, companyId, data.periodId);
      const accounts = await tx.getAllByIndex('account_chart', 'companyId', companyId);
      const totals = validateJournal({ companyId, date: data.date, lines }, accounts, period);
      if (sourceKey) {
        const existing = await tx.getAllByIndex('journal_entries', 'sourceKey', sourceKey);
        if (existing.length) throw new Error('ثبت دوباره برای این منشأ مجاز نیست');
      }
      const journal = { id, companyId, periodId: data.periodId, date: data.date,
        description: String(data.description || '').trim(), status: 'posted',
        sourceKey, sourceType: data.sourceType || null, sourceId: data.sourceId || null,
        revision: data.revision || 1, ...totals, createdBy: actor(), postedBy: actor(),
        postedAt: new Date().toISOString() };
      await tx.put('journal_entries', journal);
      for (const [position, line] of lines.entries()) {
        await tx.put('journal_lines', { ...line, id: uid('jl_'), companyId, journalId: id, position });
      }
      return journal;
    });
  }

  async discardDraftJournal(id) {
    requireAccountingAdmin();
    const companyId = await DataScope.companyId();
    return StorageService.transaction(['journal_entries', 'journal_lines'], async tx => {
      const old = await tx.get('journal_entries', id);
      if (!old || old.companyId !== companyId || old.status !== 'draft') throw new Error('فقط پیش‌نویس این شرکت قابل حذف است');
      const lines = await tx.getAllByIndex('journal_lines', 'journalId', id);
      for (const line of lines) await tx.delete('journal_lines', line.id);
      await tx.delete('journal_entries', id);
      return true;
    });
  }

  async postDraftJournal(id) {
    requireAccountingAdmin();
    const companyId = await DataScope.companyId();
    return StorageService.transaction(['account_chart', 'fiscal_periods', 'journal_entries', 'journal_lines'], async tx => {
      const old = await tx.get('journal_entries', id);
      if (!old || old.companyId !== companyId || old.status !== 'draft') throw new Error('پیش‌نویس قابل ثبت پیدا نشد');
      const period = await periodFor(tx, companyId, old.periodId);
      const lines = (await tx.getAllByIndex('journal_lines', 'journalId', id)).filter(l => l.companyId === companyId);
      const accounts = await tx.getAllByIndex('account_chart', 'companyId', companyId);
      const totals = validateJournal({ companyId, date: old.date, lines }, accounts, period);
      const journal = { ...old, ...totals, status: 'posted', postedBy: actor(), postedAt: new Date().toISOString() };
      await tx.put('journal_entries', journal);
      return journal;
    });
  }

  async reverseJournal(originalId, { periodId, date, description = '' }) {
    requireAccountingAdmin();
    const companyId = await DataScope.companyId();
    return StorageService.transaction(['account_chart', 'fiscal_periods', 'journal_entries', 'journal_lines'], async tx => {
      const original = await tx.get('journal_entries', originalId);
      if (!original || original.companyId !== companyId || original.status !== 'posted' ||
          original.reversedById || original.reversalOfId) throw new Error('این سند قابل برگشت نیست');
      // Reversing commercial GL alone would leave invoice, cash and stock inconsistent.
      if (['invoice','treasury','expense','cheque','cheque_status','stocktake'].includes(original.sourceType))
        throw new Error('سند تجاری را نمی‌توان جداگانه معکوس کرد؛ اصلاح باید از سند عملیاتی منشأ انجام شود');
      const period = await periodFor(tx, companyId, periodId);
      const oldLines = (await tx.getAllByIndex('journal_lines', 'journalId', originalId))
        .filter(l => l.companyId === companyId)
        .sort((a, b) => a.position - b.position);
      const lines = reversingLines(oldLines);
      const accounts = await tx.getAllByIndex('account_chart', 'companyId', companyId);
      // Historical reversals remain valid even when source accounts were later deactivated or given children.
      const totals = validateJournal({ companyId, date, lines }, accounts, period, { allowInactive: true, allowParent: true });
      const key = journalSourceKey(companyId, 'journal_reversal', originalId);
      if ((await tx.getAllByIndex('journal_entries', 'sourceKey', key)).length) throw new Error('برگشت سند تکراری است');
      const id = uid('jn_');
      const journal = { id, companyId, periodId, date, description: String(description).trim() || `برگشت سند ${originalId}`,
        status: 'posted', sourceKey: key, sourceType: 'journal_reversal', sourceId: originalId,
        revision: 1, reversalOfId: originalId, ...totals, createdBy: actor(),
        postedBy: actor(), postedAt: new Date().toISOString() };
      await tx.put('journal_entries', journal);
      for (const [position, line] of lines.entries()) {
        await tx.put('journal_lines', { ...line, id: uid('jl_'), companyId, journalId: id, position });
      }
      await tx.put('journal_entries', { ...original, reversedById: id, reversedAt: journal.postedAt });
      return journal;
    });
  }

  async trialBalance({ periodId } = {}) {
    const companyId = await DataScope.companyId();
    return StorageService.transaction(['account_chart', 'journal_entries', 'journal_lines'], async tx => {
      const accounts = await tx.getAllByIndex('account_chart', 'companyId', companyId);
      const journals = (await entriesFor(tx, companyId))
        .filter(j => j.status === 'posted' && (!periodId || j.periodId === periodId));
      const valid = new Set(journals.map(j => j.id));
      const entries = new Map(accounts.map(a => [a.id, {
        accountId: a.id, code: a.code, name: a.name, debit: 0, credit: 0, balance: 0
      }]));
      const lines = await tx.getAllByIndex('journal_lines', 'companyId', companyId);
      for (const line of lines) {
        if (!valid.has(line.journalId)) continue;
        const row = entries.get(line.accountId);
        if (!row) throw new Error('سطر سند به حساب حذف‌شده اشاره دارد');
        row.debit += line.debit;
        row.credit += line.credit;
        if (!Number.isSafeInteger(row.debit) || !Number.isSafeInteger(row.credit)) throw new Error('سرریز مانده حساب');
        row.balance = row.debit - row.credit;
      }
      const rows = [...entries.values()].filter(r => r.debit || r.credit)
        .sort((a, b) => a.code.localeCompare(b.code, 'fa'));
      const totals = rows.reduce((sum, r) => ({ debit: sum.debit + r.debit, credit: sum.credit + r.credit }), { debit: 0, credit: 0 });
      if (!Number.isSafeInteger(totals.debit) || !Number.isSafeInteger(totals.credit) ||
          totals.debit !== totals.credit) throw new Error('گردش حساب‌ها تراز نیست');
      return { companyId, periodId: periodId || null, rows, totals };
    }, 'readonly');
  }
}

export const AccountingService = new AccountingServiceImpl();
