'use strict';
const { evaluateHolooWrite } = require('./holoo-write-policy.cjs');
// Explicit SQL boundary for future adapters. Never accepts arbitrary SQL from callers.
const QUERIES = Object.freeze({
  invoiceCount: 'SELECT COUNT_BIG(*) AS count FROM dbo.FACTURE',
  lineCount: 'SELECT COUNT_BIG(*) AS count FROM dbo.FACTART',
  documentCount: 'SELECT COUNT_BIG(*) AS count FROM dbo.SANAD'
});
async function executeHolooLabRead({ database, audit, queryId, executor } = {}) {
  const decision = evaluateHolooWrite({ operation: 'read', database, audit });
  if (!decision.allowed) throw new Error(decision.reason);
  if (!Object.hasOwn(QUERIES, queryId)) throw new Error('Unapproved Holoo read query');
  if (typeof executor !== 'function') throw new Error('Read executor is required');
  return executor({ database, sql: QUERIES[queryId], readOnly: true });
}
module.exports = { executeHolooLabRead };
