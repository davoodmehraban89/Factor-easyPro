import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=fileURLToPath(new URL('../scripts/holoo-financial-procedure-dependencies.ps1',import.meta.url));
test('catalog-only dependencies stay on LAB without invoking procedures',()=>{
 const source=readFileSync(script,'utf8');
 assert.match(source,/HolooBackup_050808_LAB_20261110/);
 assert.match(source,/sys\.sql_expression_dependencies/);
 assert.match(source,/sys\.procedures/);
 assert.match(source,/dynamicSqlAndIndirectCallsUnresolved=\$true/);
 assert.doesNotMatch(source,/\b(?:INSERT\s+INTO|UPDATE\s+dbo\.|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|EXEC(?:UTE)?\s+dbo\.)\b/i);
});
test('live LAB dependencies do not overclaim static coverage',{skip:process.platform!=='win32'||process.env.HOLOO_SQL_INTEGRATION!=='1'},()=>{
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Json'],{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
 assert.equal(r.status,0,r.stderr);
 const x=JSON.parse(r.stdout);
 assert.equal(x.database,'HolooBackup_050808_LAB_20261110');
 assert.equal(x.metadataOnly,true);assert.equal(x.dependencyCoverageComplete,false);
 assert.equal(x.dynamicSqlAndIndirectCallsUnresolved,true);
 assert.equal(x.productionWriteGate,'NO-GO');
 assert.ok(Array.isArray(x.dependencyRows));
 assert.equal(x.dependencyRowCount,x.dependencyRows.length);
});
