'use strict';
const { evaluateHolooWrite } = require('./holoo-write-policy.cjs');
// This boundary accepts only fixed reads; audit evidence must come from the trusted composition root.
const QUERIES = Object.freeze({
  invoiceCount: 'SELECT COUNT_BIG(*) AS count FROM dbo.FACTURE',
  lineCount: 'SELECT COUNT_BIG(*) AS count FROM dbo.FACTART',
  documentCount: 'SELECT COUNT_BIG(*) AS count FROM dbo.SANAD'
});
function createHolooLabReader({ loadAudit, executor } = {}) {
  if (typeof loadAudit !== 'function' || typeof executor !== 'function') throw new Error('Trusted audit loader and read executor required');
  return async function executeHolooLabRead({ database, queryId } = {}) {
    if (database !== 'HolooBackup_050808_LAB_20261110') throw new Error('Unapproved Holoo database');
    if (typeof queryId !== 'string' || !Object.hasOwn(QUERIES, queryId)) throw new Error('Unapproved Holoo read query');
    const audit = await loadAudit();
    const decision = evaluateHolooWrite({ operation: 'read', database, audit });
    if (!decision.allowed) throw new Error(decision.reason);
    return executor({ database, sql: QUERIES[queryId], readOnly: true });
  };
}
module.exports = { createHolooLabReader };
