import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const script = readFileSync(new URL('../scripts/holoo-direct-sql-readiness.ps1', import.meta.url), 'utf8');
test('direct SQL lab preflight is read-only and fails closed for non-lab databases', () => {
 assert.match(script, /Database -notmatch/);
 assert.match(script, /LAB_/);
 assert.match(script, /sys\.databases/);
 assert.match(script, /readyForLabSql/);
 assert.doesNotMatch(script, /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+DATABASE|ALTER\s+DATABASE)\b/i);
});
test('direct SQL lab preflight does not require a virtual machine or Hyper-V', () => {
 assert.doesNotMatch(script, /Hyper-V|MSSQL\$FINORA_LAB|VirtualizationFirmwareEnabled/i);
});
