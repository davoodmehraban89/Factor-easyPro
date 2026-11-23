import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { loadApprovedHolooAudit } = require('../src/holoo-audit-loader.cjs');
test('audit loader refuses non-Windows host', { skip: process.platform === 'win32' }, () => {
 assert.throws(loadApprovedHolooAudit, /Windows/);
});
test('audit loader executes approved script and returns read-only NO-GO evidence', { skip: process.platform !== 'win32' || process.env.HOLOO_SQL_INTEGRATION !== '1' }, () => {
 const audit = loadApprovedHolooAudit();
 assert.equal(audit.database, 'HolooBackup_050808_LAB_20261110');
 assert.equal(audit.readOnlyAudit, true);
 assert.equal(audit.productionWriteGate.productionWritesAuthorized, false);
});
