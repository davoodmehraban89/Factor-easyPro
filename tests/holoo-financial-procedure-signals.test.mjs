import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = resolve(root, 'scripts/holoo-financial-procedure-signals.ps1');

test('procedure signals are catalog-only and preflight-gated', () => {
  const source = readFileSync(script, 'utf8');
  assert.match(source, /holoo-direct-sql-readiness\.ps1/);
  assert.match(source, /sys\.sql_modules/);
  assert.match(source, /sys\.sql_expression_dependencies/);
  assert.match(source, /productionWriteGate='NO-GO'/);
  assert.doesNotMatch(source, /\.ExecuteNonQuery\s*\(/i);
  assert.doesNotMatch(source, /\bEXEC(?:UTE)?\s+dbo\./i);
});

// The Windows CI runner has no approved private SQL LAB. Only explicit LAB integration
// runs may execute the read-only metadata collector; its own preflight still fails closed.
test('live lab signal output is explicitly non-authoritative', { skip: process.platform !== 'win32' || process.env.HOLOO_SQL_INTEGRATION !== '1' }, () => {
  const run = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Json'], { encoding:'utf8', timeout:60000 });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.database, 'HolooBackup_050808_LAB_20261110');
  assert.equal(report.metadataOnly, true);
  assert.equal(report.lexicalOnly, true);
  assert.equal(report.financialSemanticsVerified, false);
  assert.equal(report.productionWriteGate, 'NO-GO');
  assert.equal(report.procedureCount, report.procedures.length);
  assert.ok(report.procedureCount > 0);
  assert.ok(report.procedures.every(p => typeof p.name === 'string' && typeof p.signals.FACTURE === 'number'));
});
