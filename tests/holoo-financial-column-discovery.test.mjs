import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=fileURLToPath(new URL('../scripts/holoo-financial-column-discovery.ps1',import.meta.url));
test('financial metadata discovery is scoped to LAB and catalog SELECTs',()=>{
 const source=readFileSync(script,'utf8');
 assert.match(source,/HolooBackup_050808_LAB_20261110/);
 assert.match(source,/sys\.columns/);assert.match(source,/sys\.types/);
 assert.match(source,/financialReconciliationAuthorized=\$false/);
 assert.doesNotMatch(source,/\b(?:INSERT\s+INTO|UPDATE\s+dbo\.|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|EXEC(?:UTE)?\s+dbo\.)\b/i);
});
test('live metadata inventory has all three tables without claiming financial semantics',{skip:process.platform!=='win32'||process.env.HOLOO_SQL_INTEGRATION!=='1'},()=>{
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Json'],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
 assert.equal(r.status,0,r.stderr);
 const x=JSON.parse(r.stdout);assert.equal(x.metadataOnly,true);assert.equal(x.columnSemanticsVerified,false);assert.equal(x.productionWriteGate,'NO-GO');
 assert.deepEqual([...new Set(x.columns.map(c=>c.table))].sort(),['FACTART','FACTURE','SANAD']);
 assert.ok(x.columns.every(c=>Number.isInteger(c.ordinal)&&c.ordinal>0&&typeof c.sqlType==='string'));
});
