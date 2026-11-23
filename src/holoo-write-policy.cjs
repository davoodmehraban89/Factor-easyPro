'use strict';
// Deliberately fail closed. This is a reusable policy, not an installed SQL interception layer.
function evaluateHolooWrite({ operation, database, audit } = {}) {
  if (operation !== 'read') return Object.freeze({ allowed: false, reason: 'Holoo writes are not authorized: no behavioral/concurrency acceptance evidence' });
  if (database !== 'HolooBackup_050808_LAB_20261110') return Object.freeze({ allowed: false, reason: 'Only the approved backup lab may be read through this policy' });
  if (!audit || audit.readOnlyAudit !== true || audit.complete !== true || audit.database !== database || audit.schemaVersion !== 1 || !Array.isArray(audit.tables) || !['FACTART','FACTURE','SANAD'].every(name => audit.tables.some(table => table.table === name && table.primaryKeys === 1)) || !Array.isArray(audit.procedureConcurrencySignals) || !['InsertInFacture','InsertInFactureCode'].every(name => audit.procedureConcurrencySignals.some(proc => proc.name === name && proc.allocatesNumberWithoutVisibleLock === true)) || audit.productionWriteGate?.status !== 'NO-GO' || audit.productionWriteGate?.productionWritesAuthorized !== false) return Object.freeze({ allowed: false, reason: 'Verified lab audit is required' });
  return Object.freeze({ allowed: true, reason: 'Read-only approved lab operation' });
}
module.exports = { evaluateHolooWrite };

