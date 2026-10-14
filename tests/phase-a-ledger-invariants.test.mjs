import test from 'node:test';
import assert from 'node:assert/strict';
import { journalSourceKey, validateJournalLines, reversingLines } from '../src/core/AccountingCore.mjs';

// Phase A regression gate: pure domain checks, no customer data or DB migrations.
const accounts = [
  { id: 'cash-c1', companyId: 'c1', code: '101', level: 'general', type: 'asset' },
  { id: 'sales-c1', companyId: 'c1', code: '401', level: 'general', type: 'revenue' },
  { id: 'cash-c2', companyId: 'c2', code: '101', level: 'general', type: 'asset' }
];
const lines = (amount) => [
  { accountId: 'cash-c1', debit: amount, credit: 0 },
  { accountId: 'sales-c1', debit: 0, credit: amount }
];

test('A/P0: source identity isolates company, type, source and revision', () => {
  const baseline = journalSourceKey('c1', 'invoice', '42');
  for (const other of [
    journalSourceKey('c2', 'invoice', '42'),
    journalSourceKey('c1', 'purchase', '42'),
    journalSourceKey('c1', 'invoice', '43'),
    journalSourceKey('c1', 'invoice', '42', 2)
  ]) assert.notEqual(baseline, other);
  assert.equal(baseline, journalSourceKey('c1', 'invoice', '42', 1));
  for (const revision of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => journalSourceKey('c1', 'invoice', '42', revision));
  }
  assert.throws(() => journalSourceKey('c1', 'invoice', ' '));
});

test('A/P0: ledger rejects cross-company posting even with identical account codes', () => {
  const foreign = { companyId: 'c1', lines: [
    { accountId: 'cash-c2', debit: 100, credit: 0 },
    { accountId: 'sales-c1', debit: 0, credit: 100 }
  ] };
  assert.throws(() => validateJournalLines(foreign, accounts), /شرکت دیگر|غیرمجاز/);
});

test('A/P0: ledger rejects unsafe amounts, zero lines, double-sided lines and overflow', () => {
  const invalid = [
    [{ accountId: 'cash-c1', debit: 100, credit: 100 }, lines(100)[1]],
    [{ accountId: 'cash-c1', debit: 0, credit: 0 }, lines(100)[1]],
    [{ accountId: 'cash-c1', debit: -100, credit: 0 }, lines(100)[1]],
    [{ accountId: 'cash-c1', debit: 0.5, credit: 0 }, lines(100)[1]],
    [{ accountId: 'cash-c1', debit: Number.MAX_SAFE_INTEGER + 1, credit: 0 }, lines(100)[1]],
    [
      { accountId: 'cash-c1', debit: Number.MAX_SAFE_INTEGER, credit: 0 },
      { accountId: 'cash-c1', debit: 1, credit: 0 },
      { accountId: 'sales-c1', debit: 0, credit: Number.MAX_SAFE_INTEGER }
    ]
  ];
  for (const entryLines of invalid) {
    assert.throws(() => validateJournalLines({ companyId: 'c1', lines: entryLines }, accounts));
  }
  assert.deepEqual(validateJournalLines({ companyId: 'c1', lines: lines(100) }, accounts), { debit: 100, credit: 100 });
});

test('A/P0: reversing lines preserves originals and balances exactly', () => {
  const original = lines(735);
  const snapshot = structuredClone(original);
  const reversed = reversingLines(original);
  assert.deepEqual(original, snapshot, 'posted source lines must remain immutable');
  assert.deepEqual(validateJournalLines({ companyId: 'c1', lines: reversed }, accounts), { debit: 735, credit: 735 });
  assert.deepEqual(reversingLines(reversed), original.map(line => ({ ...line, description: '' })));
});
