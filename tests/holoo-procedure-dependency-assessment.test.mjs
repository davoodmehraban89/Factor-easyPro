import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {assessProcedureDependencies}=require('../src/holoo-procedure-dependency-assessment.cjs');
const row={procedure_schema:'dbo',procedure_name:'p',referenced_entity_name:'FACTURE',referenced_minor_id:0,is_ambiguous:false,is_caller_dependent:false};
const fixture=()=>({schemaVersion:1,database:'HolooBackup_050808_LAB_20261110',metadataOnly:true,productionWriteGate:'NO-GO',dependencyCoverageComplete:false,dynamicSqlAndIndirectCallsUnresolved:true,financialSemanticsVerified:false,dependencyRows:[row],dependencyRowCount:1,procedureCount:1});
test('catalog evidence remains NO-GO',()=>{const r=assessProcedureDependencies(fixture());assert.equal(r.status,'CATALOG_ONLY');assert.equal(r.productionWriteGate,'NO-GO');assert.deepEqual(r.referencedTables,['FACTURE']);});
test('rejects fabricated completeness and wrong database',()=>{for(const patch of [{dependencyCoverageComplete:true},{database:'Holoo1'},{financialSemanticsVerified:true},{dynamicSqlAndIndirectCallsUnresolved:false}])assert.equal(assessProcedureDependencies({...fixture(),...patch}).status,'INVALID_EVIDENCE');});
test('rejects inconsistent counts and malformed rows',()=>{for(const patch of [{dependencyRowCount:2},{procedureCount:2},{dependencyRowCount:-1},{procedureCount:-1},{dependencyRows:[],dependencyRowCount:0,procedureCount:0},{dependencyRows:[{...row,referenced_entity_name:'UNKNOWN'}]},{dependencyRows:[{...row,referenced_minor_id:-1}]}])assert.equal(assessProcedureDependencies({...fixture(),...patch}).status,'INVALID_EVIDENCE');});
test('reports ambiguous dependencies without declaring semantic proof',()=>{const r=assessProcedureDependencies({...fixture(),dependencyRows:[{...row,is_ambiguous:1}]});assert.equal(r.ambiguousOrCallerDependent.length,1);assert.equal(r.financialSemanticsVerified,false);});
test('real LAB dependency catalog is structurally consistent', {skip:process.platform!=='win32'||process.env.HOLOO_SQL_INTEGRATION!=='1'},()=>{const script=fileURLToPath(new URL('../scripts/holoo-financial-procedure-dependencies.ps1',import.meta.url));const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Json'],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stderr);const assessment=assessProcedureDependencies(JSON.parse(result.stdout));assert.equal(assessment.status,'CATALOG_ONLY',JSON.stringify(assessment));assert.equal(assessment.productionWriteGate,'NO-GO');});

test('rejects padded catalog table identifiers rather than silently normalizing them',()=>{for(const name of [' FACTURE','FACTURE ',' FACTART '])assert.equal(assessProcedureDependencies({...fixture(),dependencyRows:[{...row,referenced_entity_name:name}]}).status,'INVALID_EVIDENCE');});
