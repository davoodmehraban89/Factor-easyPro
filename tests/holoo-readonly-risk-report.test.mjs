import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {generateReport}=require('../scripts/holoo-readonly-risk-report.cjs');
const script=fileURLToPath(new URL('../scripts/holoo-readonly-risk-report.cjs',import.meta.url));
const fixture={identity:{database_name:'HolooBackup_050808_LAB_20261110'},readOnlyInventory:true,databasePermissions:[{principal_name:'public',state_desc:'GRANT',permission_name:'EXECUTE',object_name:'dbo.dt_setpropertybyid'}],databaseRoleMemberships:[],serverRoleMemberships:[]};
test('report pipeline emits explainable NO-GO without SQL writes',()=>{
 const report=generateReport({runner:()=>({status:0,stdout:JSON.stringify(fixture)})});
 assert.equal(report.status,'NO-GO');assert.equal(report.publicExecuteGrantCount,1);assert.equal(report.sqlChangesPerformed,false);
 assert.equal(report.source,'live-readonly-lab-principal-inventory');
});
test('report pipeline fails closed on missing or invalid evidence',()=>{
 assert.throws(()=>generateReport({runner:()=>({status:1,stdout:''})}),/unavailable/);
 assert.throws(()=>generateReport({runner:()=>({status:0,stdout:'not json'})}),/Invalid/);
 assert.throws(()=>generateReport({runner:()=>({status:0,stdout:JSON.stringify({...fixture,identity:{database_name:'Holoo1'}})})}),/non-LAB/);
});
test('live report returns structured NO-GO with dedicated nonzero status',{skip:process.platform!=='win32'||process.env.HOLOO_SQL_INTEGRATION!=='1'},()=>{
 const result=spawnSync('node',[script],{encoding:'utf8',timeout:40000,maxBuffer:4*1024*1024});
 assert.equal(result.status,2,result.stderr);
 const report=JSON.parse(result.stdout);
 assert.equal(report.status,'NO-GO');assert.equal(report.publicExecuteGrantCount,31);assert.equal(report.publicMutationGrantCount,3);
});
