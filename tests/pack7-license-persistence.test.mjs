import test from 'node:test';
import assert from 'node:assert/strict';
import { LicenseService } from '../src/core/LicenseService.js';

test('pack7: failed secure-state persistence restores in-memory invoice count', async () => {
  const oldState = LicenseService.state;
  const oldSave = LicenseService._save;
  const oldPayload = LicenseService.verifiedPayload;
  const oldClock = LicenseService.clockRollback;
  const oldReconcile = LicenseService.reconcileIssuedInvoices;
  try {
    LicenseService.state = { trialStartedAt: new Date().toISOString(), issuedInvoiceCount: 3 };
    LicenseService.verifiedPayload = null;
    LicenseService.clockRollback = false;
    LicenseService.reconcileIssuedInvoices = async () => { LicenseService.state.issuedInvoiceCount = Math.max(LicenseService.state.issuedInvoiceCount, 4); };
    LicenseService._save = async () => { throw new Error('injected secure storage failure'); };
    await assert.rejects(LicenseService.recordIssuedInvoice(), /injected secure storage failure/);
    assert.equal(LicenseService.state.issuedInvoiceCount, 4);
    LicenseService._save = async () => {};
    await LicenseService.recordIssuedInvoice();
    assert.equal(LicenseService.state.issuedInvoiceCount, 4);
  } finally {
    LicenseService.state = oldState;
    LicenseService._save = oldSave;
    LicenseService.verifiedPayload = oldPayload;
    LicenseService.clockRollback = oldClock;
    LicenseService.reconcileIssuedInvoices = oldReconcile;
  }
});
