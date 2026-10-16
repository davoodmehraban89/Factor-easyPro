// Factor-easyPro V2 / Phase 1: company-scoped atomic restore.
// Data must never be silently cross-linked to an account or journal in another company.
import { StorageService } from './StorageService.js';
import { Auth } from './Auth.js';
import { AuditService } from './AuditService.js';
import { assertJalaliDate, validateAccount, validateFiscalPeriod, validateJournalLines, journalSourceKey } from './AccountingCore.mjs';

export const COMPANY_BACKUP_STORES = Object.freeze([
  'contacts', 'products', 'units', 'categories', 'treasury',
  'invoices', 'invoice_items', 'stock_movements', 'transactions',
  'cheques', 'expenses', 'account_chart', 'fiscal_periods',
  'journal_entries', 'journal_lines', 'warehouses', 'inventory_balances',
  'stocktakes', 'stocktake_lines', 'settlements', 'account_mappings',
  'audit_events', 'document_corrections'
]);
const V2_STORES = new Set(['account_chart', 'fiscal_periods', 'journal_entries', 'journal_lines']);
const HISTORICAL_ACTOR_STORES = new Set([
  'journal_entries', 'journal_lines', 'invoices', 'invoice_items',
  'stock_movements', 'settlements', 'treasury', 'transactions',
  'cheques', 'expenses'
]);
const isId = id => typeof id === 'string' && id.trim().length > 0;

// Backups serialize object fields in arbitrary insertion order. Immutable
// financial history equality must compare values, never field order.
const stableRecord = value => {
  if (Array.isArray(value)) return value.map(stableRecord);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort()
      .map(key => [key, stableRecord(value[key])]));
  }
  return value;
};
const sameImmutableRecord = (a, b) =>
  JSON.stringify(stableRecord(a)) === JSON.stringify(stableRecord(b));

export async function restoreCompanyBackup(data, { companyId, userId, mode = 'merge' }) {
  if (!Auth.isAdmin())throw Error('بازنشانی یا بازیابی اطلاعات حسابداری فقط با مدیر مجاز است');
  if (!companyId || !userId || !['merge', 'replace'].includes(mode)) throw new Error('گزینه‌های بازیابی نامعتبر است');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('داده فایل پشتیبان نامعتبر است');

  for (const store of COMPANY_BACKUP_STORES) {
    const items = data[store];
    if (items === undefined) continue;
    if (!Array.isArray(items)) throw new Error(`جدول ${store} در فایل پشتیبان نامعتبر است`);
    const seenIds = new Set();
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || !isId(item.id)) {
        throw new Error(`رکورد بدون شناسه معتبر در بخش ${store}`);
      }
      if (seenIds.has(item.id)) throw new Error(`شناسه تکراری در بخش ${store}`);
      seenIds.add(item.id);
    }
  }

  const counts = { added: 0, updated: 0, skipped: 0 };
  // Reads, ownership validation, foreign-key validation and writes share one IndexedDB transaction.
  return StorageService.transaction([...COMPANY_BACKUP_STORES, 'settings'], async tx => {
    for (const store of COMPANY_BACKUP_STORES) {
      for (const incoming of data[store] || []) {
        const immutable = store === 'audit_events' || store === 'document_corrections';
        // Historical audit/correction events cannot be reassigned to a new company.
        if (immutable && incoming.companyId !== companyId) {
          throw new Error('رویداد ممیزی یا اصلاح سند متعلق به شرکت دیگری است');
        }
        const row = { ...incoming, companyId };
        // Never rewrite the original actor of an accounting/treasury event.
        // The administrator performing recovery is recorded in backup_restored.
        if (row.ownerUserId && !immutable && !HISTORICAL_ACTOR_STORES.has(store)) {
          row.ownerUserId = userId;
        }
        if (store === 'journal_entries' && row.sourceType && row.sourceId) {
          row.sourceKey = journalSourceKey(companyId, row.sourceType, row.sourceId, row.revision || 1);
        }
        const existing = await tx.get(store, row.id);
        if (existing && existing.companyId !== companyId) {
          throw new Error(`شناسه رکورد ${store}/${row.id} متعلق به شرکت دیگر است؛ بازیابی متوقف شد`);
        }
        if (existing && immutable) {
          if (!sameImmutableRecord(existing, row)) {
            throw new Error('بازنویسی سابقه ممیزی یا اصلاح سند مجاز نیست');
          }
          counts.skipped++;
          continue;
        }
        // Replace mode is NOT permission to rewrite posted commercial or
        // accounting facts. A recovery of older data must be append-only for
        // finalized documents; superseding them requires a new correction.
        let protectedPosted = false;
        if (existing) {
          protectedPosted =
            (store === 'journal_entries' && (existing.status === 'posted' || row.status === 'posted')) ||
            (store === 'invoices' && (existing.financePosted || row.financePosted)) ||
            (store === 'cheques' && (existing.financePosted || row.financePosted)) ||
            (store === 'expenses' && (existing.financePosted || row.financePosted)) ||
            (store === 'treasury' && (existing.recordType === 'transaction' || row.recordType === 'transaction')) ||
            ['stock_movements', 'settlements', 'transactions'].includes(store);
          if (store === 'journal_lines' || store === 'invoice_items') {
            const refStore = store === 'journal_lines' ? 'journal_entries' : 'invoices';
            const refId = store === 'journal_lines' ? row.journalId : row.invoiceId;
            const existingParentId = store === 'journal_lines' ? existing.journalId : existing.invoiceId;
            const parent = await tx.get(refStore, refId);
            const previousParent = refId === existingParentId ? parent :
              await tx.get(refStore, existingParentId);
            protectedPosted = store === 'journal_lines'
              ? parent?.status === 'posted' || previousParent?.status === 'posted'
              : Boolean(parent?.financePosted || previousParent?.financePosted);
          }
        }
        if (existing && protectedPosted) {
          if (!sameImmutableRecord(existing, row)) {
            throw new Error('بازنویسی سند مالی قطعی از فایل پشتیبان مجاز نیست');
          }
          counts.skipped++;
          continue;
        }
        if (existing && mode === 'merge') {
          counts.skipped++;
          continue;
        }
        if (existing) counts.updated++;
        else counts.added++;
        await tx.putRaw(store, row);
      }
    }

    if (COMPANY_BACKUP_STORES.filter(s => V2_STORES.has(s)).some(s => (data[s] || []).length)) {
      const accounts = await tx.getAllByIndex('account_chart', 'companyId', companyId);
      const periods = await tx.getAllByIndex('fiscal_periods', 'companyId', companyId);
      const journals = await tx.getAllByIndex('journal_entries', 'companyId', companyId);
      const lines = await tx.getAllByIndex('journal_lines', 'companyId', companyId);
      for (const account of accounts) validateAccount(account, accounts);
      for (const period of periods) validateFiscalPeriod(period, periods);
      const byJournal = new Map();
      for (const line of lines) {
        if (!byJournal.has(line.journalId)) byJournal.set(line.journalId, []);
        byJournal.get(line.journalId).push(line);
      }
      const toCheck = new Set((data.journal_entries || []).map(x => x.id));
      for (const line of data.journal_lines || []) toCheck.add(line.journalId);

      // Recovered records must never reference missing or foreign-company accounts or periods.
      for (const id of toCheck) {
        const journal = journals.find(j => j.id === id);
        if (!journal) throw new Error(`سند حسابداری ${id} در بازیابی وجود ندارد`);
        const period = periods.find(p => p.id === journal.periodId);
        if (!period) throw new Error(`دوره مالی سند ${id} وجود ندارد`);
        assertJalaliDate(journal.date);
        if (journal.date < period.startDate || journal.date > period.endDate) {
          throw new Error(`تاریخ سند ${id} خارج از دوره است`);
        }
        validateJournalLines({
          companyId, lines: byJournal.get(id) || []
        }, accounts, {
          requireBalance: journal.status === 'posted',
          allowInactive: true,
          allowParent: true
        });
      }
      for (const line of data.journal_lines || []) {
        if (!accounts.some(a => a.id === line.accountId)) {
          throw new Error('سطر بازیابی‌شده به حساب ناموجود یا شرکت دیگر اشاره دارد');
        }
      }
    }
    if ((data.inventory_balances||[]).length || (data.stocktakes||[]).length ||
        (data.stocktake_lines||[]).length || (data.settlements||[]).length) {
      const warehouses=await tx.getAllByIndex('warehouses','companyId',companyId);
      const products=(await tx.getAll('products')).filter(x=>x.companyId===companyId);
      const inventory=await tx.getAllByIndex('inventory_balances','companyId',companyId);
      for(const balance of inventory){
        if(!warehouses.some(w=>w.id===balance.warehouseId)||
           !products.some(p=>p.id===balance.productId)||
           !Number.isSafeInteger(balance.quantityUnits)||balance.quantityUnits<0||
           !Number.isSafeInteger(balance.value)||balance.value<0)
          throw Error('موجودی انبار بازیابی‌شده نامعتبر است');
      }
      const stocktakes=await tx.getAllByIndex('stocktakes','companyId',companyId);
      const takeLines=await tx.getAllByIndex('stocktake_lines','companyId',companyId);
      for(const session of stocktakes)if(!warehouses.some(w=>w.id===session.warehouseId))
        throw Error('جلسه شمارش انبار نامعتبر است');
      for(const line of takeLines)if(!stocktakes.some(s=>s.id===line.stocktakeId)||
        !products.some(p=>p.id===line.productId))
        throw Error('برگه شمارش به جلسه یا کالای ناموجود اشاره دارد');
      const invoices=(await tx.getAll('invoices')).filter(x=>x.companyId===companyId);
      const transactions=(await tx.getAll('treasury')).filter(x=>x.companyId===companyId);
      const settlements=await tx.getAllByIndex('settlements','companyId',companyId);
      for(const row of settlements)if(!invoices.some(i=>i.id===row.invoiceId)||
        !transactions.some(t=>t.id===row.transactionId&&t.recordType==='transaction')||
        !Number.isSafeInteger(row.amount)||row.amount<=0)
        throw Error('تسویه بازیابی‌شده به فاکتور یا تراکنش نامعتبر اشاره دارد');
    }
    // Restore only this company's finance activation marker, never global preferences
    // or another company's settings.
    if(data.settings!==undefined && !Array.isArray(data.settings))
      throw Error('تنظیمات فایل پشتیبان نامعتبر است');
    const key='finance_v2_enabled_'+companyId;
    const marker=(data.settings||[]).find(x=>x&&x.id===key);
    if(marker?.enabled){
      const existing=await tx.get('settings',key);
      if(!existing?.enabled){
        const chart=await tx.getAllByIndex('account_chart','companyId',companyId);
        const periods=await tx.getAllByIndex('fiscal_periods','companyId',companyId);
        if(chart.length<19||!periods.length)
          throw Error('فعال‌سازی مالی بدون کدینگ و دوره مالی کامل بازیابی نمی‌شود');
        await tx.putRaw('settings',{id:key,companyId,enabled:true,
          restoredAt:new Date().toISOString(),restoredBy:userId});
      }
    }
    // The restore and its audit receipt are a single all-or-nothing commit.
    // Failed/corrupt restores never generate a misleading success event.
    const restoreId = StorageService.uid('restore_');
    await AuditService.append(tx, { companyId, eventType: 'backup_restored',
      sourceType: 'company_backup', sourceId: restoreId,
      commandKey: 'company-restore:' + restoreId,
      lineCount: counts.added + counts.updated });
    return counts;
  });
}
