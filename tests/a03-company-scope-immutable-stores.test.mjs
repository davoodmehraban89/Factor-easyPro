import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { AuditService } from '../src/core/AuditService.js';

// Seed historical fixtures atomically; standalone history writes are forbidden.
const seedHistory = (store, row) => StorageService.transaction(store, tx =>
  store === 'audit_events' ? AuditService.restoreHistorical(tx, row) : tx.put(store, row));
import { DataScope } from '../src/core/DataScope.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';

test('A03: common scoped reads do not leak another company audit history or corrections', async () => {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'staff-one', username: 'one', role: 'user', companyIds: ['c1'] };
  await StorageService.put('companies', { id: 'c1', name: 'Company One' });
  await StorageService.put('companies', { id: 'c2', name: 'Company Two' });
  CompanyService.activeCompanyId = 'c1';

  await seedHistory('audit_events', {
    id: 'event-c1', companyId: 'c1', commandKey: 'c1:test', eventType: 'journal_posted'
  });
  await seedHistory('audit_events', {
    id: 'event-c2', companyId: 'c2', commandKey: 'c2:test', eventType: 'journal_posted'
  });
  await seedHistory('document_corrections', {
    id: 'cor-c1', companyId: 'c1', idempotencyKey: 'c1:cor'
  });
  await seedHistory('document_corrections', {
    id: 'cor-c2', companyId: 'c2', idempotencyKey: 'c2:cor'
  });
  assert.deepEqual((await DataScope.list('audit_events')).map(row => row.id), ['event-c1']);
  assert.deepEqual((await DataScope.list('document_corrections')).map(row => row.id), ['cor-c1']);
  assert.equal((await DataScope.stamp('audit_events', { eventType: 'journal_posted' })).companyId, 'c1');
  assert.equal((await DataScope.stamp('document_corrections', { sourceId: 'x' })).companyId, 'c1');

  CompanyService.activeCompanyId = 'c2';
  // Even if a tampered UI points at another company, allowedFor returns only c1.
  assert.deepEqual((await DataScope.list('audit_events')).map(row => row.id), ['event-c1']);
  assert.deepEqual((await DataScope.list('document_corrections')).map(row => row.id), ['cor-c1']);
});
