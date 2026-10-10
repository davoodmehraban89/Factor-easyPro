import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAccount, validateJournal, journalSourceKey, DEFAULT_CHART } from '../src/core/AccountingCore.mjs';
const companyId = 'c1';
const accounts = [
  { id: 'a', code: '101', companyId, level: 'general', type: 'asset', name: 'Cash' },
  { id: 'b', code: '401', companyId, level: 'general', type: 'revenue', name: 'Sales' }
];
const journal = { companyId, date: '1405/07/16', lines: [{ accountId: 'a', debit: 100, credit: 0 }, { accountId: 'b', debit: 0, credit: 100 }] };
const period = { companyId, startDate: '1405/01/01', endDate: '1405/12/29', closed: false };
test('default chart has base groups', () => assert.equal(DEFAULT_CHART.filter(a => a.level === 'group').length, 5));
test('balanced journal', () => assert.deepEqual(validateJournal(journal, accounts, period), { debit: 100, credit: 100 }));
test('reject unbalanced', () => assert.throws(() => validateJournal({ ...journal, lines: [{ accountId: 'a', debit: 101, credit: 0 }, journal.lines[1]] }, accounts, period)));
test('reject cross-company', () => assert.throws(() => validateJournal({ ...journal, companyId: 'c2' }, accounts, period)));
test('reject closed period', () => assert.throws(() => validateJournal(journal, accounts, { ...period, closed: true })));
test('reject duplicate account', () => assert.throws(() => validateAccount({ ...accounts[0] }, accounts)));
test('reject invalid account parent', () => assert.throws(() => validateAccount({ ...accounts[0], id: 'x', code: '10101', level: 'subsidiary', parentCode: '999' }, accounts)));
test('source key scoped', () => assert.notEqual(journalSourceKey('c1', 'invoice', '1'), journalSourceKey('c2', 'invoice', '1')));
