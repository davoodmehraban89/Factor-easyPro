import test from 'node:test';
import assert from 'node:assert/strict';
import { previewOpeningBalances } from '../src/core/OpeningBalanceDryRun.mjs';

const period = { companyId: 'c1', startDate: '1405/01/01', endDate: '1405/12/29',
  status: 'open', closed: false };
const fixture = () => ({
  companyId: 'c1', openingDate: '1405/01/01', period,
  lines: [
    { accountId: 'a-rec', role: 'receivable', debit: 300, credit: 0 },
    { accountId: 'a-pay', role: 'payable', debit: 0, credit: 200 },
    { accountId: 'a-stock', role: 'inventory', debit: 500, credit: 0 },
    { accountId: 'a-cash', role: 'cash', debit: 100, credit: 0 },
    { accountId: 'a-equity', role: 'equity', debit: 0, credit: 700 }
  ],
  contacts: [{ contactId: 'customer', receivable: 300, payable: 200 }],
  stock: [{ warehouseId: 'warehouse', productId: 'sku', quantityUnits: 1000, value: 500 }],
  cash: [{ accountId: 'cash-1', balance: 100 }],
  priorPostedJournals: 0
});

test('A02: balanced opening dataset is ready for explicit review without changing anything', () => {
  const input = fixture();
  const old = structuredClone(input);
  const result = previewOpeningBalances(input);
  assert.equal(result.readiness, 'ready-for-review');
  assert.deepEqual(result.issues, []);
  assert.equal(result.journal.debit, 900);
  assert.equal(result.journal.credit, 900);
  assert.deepEqual(result.differences, { receivable: 0, payable: 0, inventory: 0, cash: 0 });
  assert.equal(result.writePerformed, false);
  assert.deepEqual(input, old);
  assert.equal(Object.isFrozen(result), true);
});

test('A02: mismatched inventory blocks activation even if journal is balanced', () => {
  const input = fixture();
  input.stock[0].value = 499;
  const result = previewOpeningBalances(input);
  assert.equal(result.readiness, 'blocked');
  assert.ok(result.issues.includes('OPENING_INVENTORY_MISMATCH'));
  assert.equal(result.differences.inventory, -1);
  assert.deepEqual(input.stock[0], { warehouseId: 'warehouse', productId: 'sku',
    quantityUnits: 1000, value: 499 });
});

test('A02: unbalanced journal and existing posted transactions must block write', () => {
  const input = fixture();
  input.lines[4].credit = 699;
  input.priorPostedJournals = 1;
  const report = previewOpeningBalances(input);
  assert.deepEqual(report.issues, ['EXISTING_POSTED_JOURNALS', 'UNBALANCED_OPENING_JOURNAL']);
});

test('A02: reject cross-company, closed period, date error, duplicate and integer overflow', () => {
  const invalid = [
    { companyId: 'c2' }, { period: { ...period, status: 'closed' } },
    { openingDate: '1405/13/31' }, { openingDate: '1406/01/01' },
    { priorPostedJournals: -1 },
    { lines: [...fixture().lines, fixture().lines[0]] },
    { stock: [...fixture().stock, fixture().stock[0]] },
    { contacts: [...fixture().contacts, fixture().contacts[0]] },
    { cash: [{ accountId: 'cash-1', balance: Infinity }] },
    { stock: [{ ...fixture().stock[0], quantityUnits: -1 }] },
    { lines: fixture().lines.map(x => ({ ...x, debit: Number.MAX_SAFE_INTEGER })) }
  ];
  for (const patch of invalid) {
    assert.throws(() => previewOpeningBalances({ ...fixture(), ...patch }));
  }
});
