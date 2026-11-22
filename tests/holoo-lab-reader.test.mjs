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

test('SQL execution rechecks all three tables on the same connection',()=>{
 const source=readFileSync(fileURLToPath(new URL('../scripts/holoo-lab-counts.ps1',import.meta.url)),'utf8');
 const open=source.indexOf('$c.Open()');
 const permission=source.indexOf('SQL same-connection privilege gate BLOCKED');
 const query=source.indexOf('$q.CommandText=$queries[$QueryId]');
 assert.ok(open>=0 && permission>open && query>permission);
 for(const table of ['FACTURE','FACTART','SANAD']) assert.match(source,new RegExp(`dbo\\.${table}`));
 assert.match(source,/IS_MEMBER\('db_datawriter'\)/);
 assert.match(source,/IS_MEMBER\('db_ddladmin'\)/);
});

test('same-connection gate checks server-level elevated privileges',()=>{
 const source=readFileSync(fileURLToPath(new URL('../scripts/holoo-lab-counts.ps1',import.meta.url)),'utf8');
 assert.match(source,/IS_SRVROLEMEMBER\('sysadmin'\)/);
 assert.match(source,/HAS_PERMS_BY_NAME\(NULL,NULL,'CONTROL SERVER'\)/);
 assert.match(source,/@\(1,3,4,5,7,8,9,11,12,13,14,15,16,17\)/);
});

test('same-connection gate blocks inherited public EXECUTE and DML before counts',()=>{
 const source=readFileSync(fileURLToPath(new URL('../scripts/holoo-lab-counts.ps1',import.meta.url)),'utf8');
 const grantCheck=source.indexOf("grantee_principal_id=DATABASE_PRINCIPAL_ID('public')");
 const countQuery=source.indexOf('$q.CommandText=$queries[$QueryId]');
 assert.ok(grantCheck>source.indexOf('$c.Open()') && countQuery>grantCheck);
 assert.match(source,/permission_name='EXECUTE'/);
 assert.match(source,/permission_name IN \('INSERT','UPDATE','DELETE'/);
 assert.match(source,/inherited public privilege gate BLOCKED/);
});
