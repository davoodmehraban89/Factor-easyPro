import test from 'node:test';
import assert from 'node:assert/strict';
import { previewSaleReturnSettlement as preview } from '../src/core/ReturnSettlementCore.mjs';

test('A01 preview: partially paid invoice, return exceeding receivable creates credit, not automatic refund', () => {
  const p = preview({ invoiceTotal: 1_000_000, paidAmount: 400_000, returnAmount: 800_000 });
  assert.equal(p.receivableBefore, 600_000);
  assert.equal(p.allocatedToReceivable, 600_000);
  assert.equal(p.newCustomerCredit, 200_000);
  assert.equal(p.customerCreditAfter, 200_000);
  assert.equal(p.receivableAfter, 0);
  assert.equal(p.invoiceNetAfter, 200_000);
  assert.equal(p.requiresCreditReview, true);
  assert.equal(p.autoRefundAllowed, false);
  assert.equal(Object.isFrozen(p), true);
});

test('A01 preview: return below open balance reduces debt without automatic credit', () => {
  const p = preview({ invoiceTotal: 1_000, paidAmount: 200, returnAmount: 300 });
  assert.equal(p.receivableBefore, 800);
  assert.equal(p.receivableAfter, 500);
  assert.equal(p.allocatedToReceivable, 300);
  assert.equal(p.newCustomerCredit, 0);
  assert.equal(p.requiresCreditReview, false);
});

test('A01 preview: full return with fully paid invoice holds all money as credit', () => {
  const p = preview({ invoiceTotal: 1_000, paidAmount: 1_000, returnAmount: 1_000 });
  assert.equal(p.allocatedToReceivable, 0);
  assert.equal(p.newCustomerCredit, 1_000);
  assert.equal(p.invoiceNetAfter, 0);
  assert.equal(p.autoRefundAllowed, false);
});

test('A01 preview: multiple returns retain previously established credit and cannot exceed source', () => {
  const p = preview({ invoiceTotal: 1_000, paidAmount: 800, priorReturns: 300, returnAmount: 200 });
  assert.equal(p.priorCustomerCredit, 100);
  assert.equal(p.newCustomerCredit, 200);
  assert.equal(p.customerCreditAfter, 300);
  assert.equal(p.receivableAfter, 0);
  assert.throws(() => preview({ invoiceTotal: 100, paidAmount: 0, priorReturns: 70, returnAmount: 31 }), /بیشتر/);
});

test('A01 preview: invalid currency, negative and unsafe amounts are rejected before any write', () => {
  const valid = { invoiceTotal: 1000, paidAmount: 100, returnAmount: 100 };
  for (const value of [-1, 1.5, NaN, Infinity, '100', Number.MAX_SAFE_INTEGER + 1]) {
    for (const key of ['invoiceTotal', 'paidAmount', 'priorReturns', 'returnAmount']) {
      assert.throws(() => preview({ ...valid, [key]: value }), RangeError);
    }
  }
  assert.throws(() => preview({ ...valid, paidAmount: 1001 }), /مغایرت/);
  assert.throws(() => preview({ ...valid, returnAmount: 0 }), RangeError);
});

test('A01 preview: invariant across varied safe integer rial inputs', () => {
  for (let gross = 1; gross <= 130; gross += 7) {
    for (let paid = 0; paid <= gross; paid += 5) {
      for (let prior = 0; prior <= gross; prior += 11) {
        for (let requested = 1; requested <= gross - prior; requested += 13) {
          const p = preview({
            invoiceTotal: gross, paidAmount: paid,
            priorReturns: prior, returnAmount: requested
          });
          assert.equal(p.invoiceNetBefore - requested, p.invoiceNetAfter);
          assert.equal(p.allocatedToReceivable + p.newCustomerCredit, requested);
          assert.equal(p.receivableBefore - p.allocatedToReceivable, p.receivableAfter);
          assert.equal(p.customerCreditAfter - p.priorCustomerCredit, p.newCustomerCredit);
          assert.equal(p.receivableAfter - p.customerCreditAfter, p.invoiceNetAfter - paid);
          assert.equal(p.autoRefundAllowed, false);
        }
      }
    }
  }
});
