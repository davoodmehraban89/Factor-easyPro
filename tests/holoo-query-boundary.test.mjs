import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { executeHolooLabRead } = require('../src/holoo-query-boundary.cjs');
const database = 'HolooBackup_050808_LAB_20261110';
const audit = { database, schemaVersion: 1, tables: ['FACTART','FACTURE','SANAD'].map(table => ({table,primaryKeys:1})), procedureConcurrencySignals: ['InsertInFacture','InsertInFactureCode'].map(name => ({name,allocatesNumberWithoutVisibleLock:true})), readOnlyAudit: true, complete: true, productionWriteGate: { status:'NO-GO',productionWritesAuthorized:false } };
test('approved read calls executor with fixed SELECT only', async () => {
 const calls=[];
 const result=await executeHolooLabRead({database,audit,queryId:'invoiceCount',executor: async x => {calls.push(x);return 42;}});
 assert.equal(result,42);
 assert.deepEqual(calls,[{database,sql:'SELECT COUNT_BIG(*) AS count FROM dbo.FACTURE',readOnly:true}]);
});
test('arbitrary SQL cannot reach executor', async () => {
 let calls=0;
 for(const queryId of ['DELETE FROM dbo.FACTURE','invoiceCount; DROP TABLE dbo.FACTURE','__proto__',undefined]) await assert.rejects(executeHolooLabRead({database,audit,queryId,executor:async()=>{calls++;}}));
 assert.equal(calls,0);
});
test('invalid audit or production target never reaches executor', async () => {
 let calls=0;
 for(const params of [{database:'Holoo1',audit},{database,audit:null},{database,audit:{...audit,productionWriteGate:{status:'GO',productionWritesAuthorized:true}}}]) await assert.rejects(executeHolooLabRead({...params,queryId:'invoiceCount',executor:async()=>{calls++;}}));
 assert.equal(calls,0);
});
