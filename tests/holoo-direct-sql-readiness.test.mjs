import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const scriptPath = new URL('../scripts/holoo-direct-sql-readiness.ps1', import.meta.url);
const script = readFileSync(scriptPath, 'utf8');
const onApprovedLab = process.platform === 'win32' && process.env.HOLOO_SQL_INTEGRATION === '1';
const run = (...args) => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(scriptPath), '-Json', ...args], { encoding: 'utf8', timeout: 15000 });
test('preflight contains only read-only SQL and no VM dependency', () => {
 assert.match(script, /Database -ne/);
 assert.match(script, /Server -ne/);
 assert.match(script, /sys\.databases/);
 assert.doesNotMatch(script, /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+DATABASE|ALTER\s+DATABASE)\b/i);
 assert.doesNotMatch(script, /Hyper-V|MSSQL\$FINORA_LAB|VirtualizationFirmwareEnabled/i);
});
test('rejects production database before opening a connection', {skip: process.platform !== 'win32'}, () => {
 const result = run('-Database', 'Holoo1');
 assert.equal(result.status, 2, result.stderr);
 const json = JSON.parse(result.stdout);
 assert.equal(json.readyForLabSql, false);
 assert.deepEqual(json.checks.map(c => c.name), ['database-selection']);
});
test('rejects unknown SQL server before opening a connection', {skip: process.platform !== 'win32'}, () => {
 const result = run('-Server', 'other-host');
 assert.equal(result.status, 2, result.stderr);
 const json = JSON.parse(result.stdout);
 assert.equal(json.readyForLabSql, false);
 assert.deepEqual(json.checks.map(c => c.name), ['database-selection']);
});
test('rejects similarly named lab database before opening a connection', {skip: process.platform !== 'win32'}, () => {
 const result = run('-Database', 'Holoo1_FACTORLAB_20261110');
 assert.equal(result.status, 2, result.stderr);
 assert.deepEqual(JSON.parse(result.stdout).checks.map(c => c.name), ['database-selection']);
});
test('verified lab database is accessible in direct SQL mode', {skip: !onApprovedLab}, () => {
 const result = run();
 assert.equal(result.status, 0, result.stderr);
 const json = JSON.parse(result.stdout);
 assert.equal(json.readyForLabSql, true);
 assert.deepEqual(json.checks.map(c => c.status), ['PASS', 'PASS', 'PASS']);
});

