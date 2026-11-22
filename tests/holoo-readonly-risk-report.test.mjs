import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {loadAndEvaluate}=require('../src/holoo-readonly-risk-report.cjs');
const lab='HolooBackup_050808_LAB_20261110';
const fixture={schemaVersion:1,productionWriteGate:'NO-GO',identity:{database_name:lab},readOnlyInventory:true,databasePermissions:[{principal_name:'public',state_desc:'GRANT',permission_name:'INSERT',object_name:'dbo.dtproperties'}],databaseRoleMemberships:[],serverRoleMemberships:[]};
const mock=(value,status=0)=>()=>({status,stdout:JSON.stringify(value)});
test('rejects non-Windows execution and bad inventories',()=>{
 assert.throws(()=>loadAndEvaluate({platform:'linux',run:mock(fixture)}),/Windows/);
 assert.throws(()=>loadAndEvaluate({platform:'win32',run:mock({...fixture,productionWriteGate:'PASS'})}),/Untrusted/);
 assert.throws(()=>loadAndEvaluate({platform:'win32',run:()=>({status:0,stdout:'not-json'})}),/Invalid/);
 assert.throws(()=>loadAndEvaluate({platform:'win32',run:mock(fixture,1)}),/failed/);
});
test('reports blockers without ever authorizing writes',()=>{
 const report=loadAndEvaluate({platform:'win32',run:mock(fixture)});
 assert.equal(report.status,'NO-GO');assert.equal(report.sqlChangesPerformed,false);
 assert.equal(report.publicMutationGrantCount,1);
});
test('real Aram LAB report remains NO-GO', {skip:process.platform!=='win32'||process.env.HOLOO_SQL_INTEGRATION!=='1'},()=>{
 const script=fileURLToPath(new URL('../src/holoo-readonly-risk-report.cjs',import.meta.url));
 const result=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:40000});
 assert.equal(result.status,2,result.stderr);
 const report=JSON.parse(result.stdout);
 assert.equal(report.status,'NO-GO');assert.equal(report.publicExecuteGrantCount,31);assert.equal(report.publicMutationGrantCount,3);
});
