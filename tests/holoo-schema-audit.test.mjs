import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const path = fileURLToPath(new URL('../scripts/holoo-schema-audit.ps1', import.meta.url));
const script = readFileSync(path, 'utf8');
test('schema audit uses approved preflight and read-only catalog queries', () => {
 assert.match(script, /holoo-direct-sql-readiness\.ps1/);
 assert.match(script, /sys\.foreign_keys/);
 assert.match(script, /sys\.key_constraints/);
 assert.match(script, /sys\.check_constraints/);
 assert.match(script, /sys\.triggers/);
 assert.doesNotMatch(script, /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+DATABASE|ALTER\s+DATABASE)\b/i);
});
test('real lab structural audit returns three complete primary-keyed tables', {skip: process.platform !== 'win32'}, () => {
 const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path, '-Json'], {encoding:'utf8', timeout:30000});
 assert.equal(result.status, 0, result.stderr);
 const audit = JSON.parse(result.stdout);
 assert.equal(audit.complete, true);
 assert.equal(audit.readOnlyAudit, true);
 for (const key of ['invoiceHeaders','invoiceLines','accountingDocuments','orphanInvoiceLines']) assert.ok(Number.isSafeInteger(audit.integrity[key]) && audit.integrity[key] >= 0, key);
 assert.ok(audit.integrity.orphanInvoiceLines <= audit.integrity.invoiceLines);
 for(const key of ['orphanInvoiceLinesExcludingCandidateSentinel','candidateSentinelRows','missingReferencedAccountingDocuments','duplicateInvoiceTypeNumberGroups','invoiceHeadersWithoutAccountingCode']) assert.ok(Number.isSafeInteger(audit.integrity[key]) && audit.integrity[key] >= 0, key);
 assert.ok(audit.integrity.orphanInvoiceLinesExcludingCandidateSentinel <= audit.integrity.orphanInvoiceLines);
 assert.deepEqual(audit.tables.map(t => t.table), ['FACTART','FACTURE','SANAD']);
 assert.deepEqual(audit.procedureConcurrencySignals.map(p => p.name), ['InsertInFacture','InsertInFactureCode','Sp_AppendNewSanad']);
 for (const proc of audit.procedureConcurrencySignals) for(const key of ['usesCursor','hasUpdateLock','hasSerializable','hasBeginTransaction']) assert.equal(typeof proc[key], 'boolean');
 for (const table of audit.tables) {
  assert.equal(table.primaryKeys, 1);
  for(const key of ['outboundForeignKeys','triggers','checkConstraints']) assert.ok(Number.isInteger(table[key]) && table[key]>=0);
 }
});




