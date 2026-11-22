import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {evaluateReadOnlyRisk}=require('../src/holoo-readonly-risk-evaluator.cjs');
const lab='HolooBackup_050808_LAB_20261110';
const fixture=(permissions=[])=>({identity:{database_name:lab},readOnlyInventory:true,databasePermissions:permissions,databaseRoleMemberships:[],serverRoleMemberships:[]});
test('rejects wrong database or incomplete evidence',()=>{
 assert.throws(()=>evaluateReadOnlyRisk({}),/Untrusted/);
 assert.throws(()=>evaluateReadOnlyRisk({...fixture(),identity:{database_name:'Holoo1'}}),/non-LAB/);
 assert.throws(()=>evaluateReadOnlyRisk({...fixture(),databasePermissions:null}),/Incomplete/);
});
test('public mutation and execute grants block read-only certification',()=>{
 const report=evaluateReadOnlyRisk(fixture([{principal_name:'public',state_desc:'GRANT',permission_name:'INSERT',object_name:'dbo.dtproperties'},{principal_name:'public',state_desc:'GRANT',permission_name:'EXECUTE',object_name:'dbo.dt_setpropertybyid'}]));
 assert.equal(report.status,'NO-GO');assert.equal(report.publicMutationGrantCount,1);assert.equal(report.publicExecuteGrantCount,1);
 assert.ok(report.blockers.some(x=>x.code==='PUBLIC_MUTATION_GRANTS'));
});
test('empty catalog does not prove safety of a proposed identity',()=>{
 const report=evaluateReadOnlyRisk(fixture());
 assert.equal(report.databaseWideReadOnlyProven,false);
 assert.ok(report.blockers.some(x=>x.code==='PROPOSED_IDENTITY_NOT_VERIFIED'));
});
test('real LAB inventory yields explainable blockers', {skip:process.platform!=='win32'||process.env.HOLOO_SQL_INTEGRATION!=='1'},()=>{
 const script=fileURLToPath(new URL('../scripts/holoo-lab-principal-inventory.ps1',import.meta.url));
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Json'],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
 assert.equal(result.status,0,result.stderr);
 const report=evaluateReadOnlyRisk(JSON.parse(result.stdout));
 assert.equal(report.publicExecuteGrantCount,31);assert.equal(report.publicMutationGrantCount,3);assert.equal(report.status,'NO-GO');
});
