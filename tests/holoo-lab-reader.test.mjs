import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { readApprovedLabCount } = require('../src/holoo-lab-reader.cjs');
const database='HolooBackup_050808_LAB_20261110';
test('real SQL lab count requests are blocked while Windows login has write privileges', {skip:process.platform!=='win32'||process.env.HOLOO_SQL_INTEGRATION!=='1'}, async()=>{
 await assert.rejects(readApprovedLabCount({database,queryId:'invoiceCount'}),/Approved lab count query failed/);
});
test('rejects production database and arbitrary SQL without running queries',async()=>{
 await assert.rejects(readApprovedLabCount({database:'Holoo1',queryId:'invoiceCount'}));
 await assert.rejects(readApprovedLabCount({database,queryId:'DELETE FROM FACTURE'}));
});


test('count SQL is gated by effective permission audit before connection',()=>{
 const source=readFileSync(fileURLToPath(new URL('../scripts/holoo-lab-counts.ps1',import.meta.url)),'utf8');
 const gate=source.indexOf('holoo-sql-permissions-audit.ps1');
 const connection=source.indexOf('New-Object System.Data.SqlClient.SqlConnection');
 assert.ok(gate>=0 && connection>gate);
 assert.match(source,/leastPrivilegeReadOnly/);
 assert.match(source,/SQL least-privilege gate BLOCKED/);
});
