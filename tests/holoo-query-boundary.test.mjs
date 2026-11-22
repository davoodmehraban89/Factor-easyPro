import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createHolooLabReader } = require('../src/holoo-query-boundary.cjs');
const database = 'HolooBackup_050808_LAB_20261110';
const audit = { database, schemaVersion: 1, tables: ['FACTART','FACTURE','SANAD'].map(table => ({table,primaryKeys:1})), procedureConcurrencySignals: ['InsertInFacture','InsertInFactureCode'].map(name => ({name,allocatesNumberWithoutVisibleLock:true})), readOnlyAudit: true, complete: true, productionWriteGate: { status:'NO-GO',productionWritesAuthorized:false } };
test('approved read calls trusted audit loader then fixed SELECT executor', async () => {
 const calls=[];
 const read=createHolooLabReader({loadAudit:async()=>{calls.push('audit');return audit;},executor:async x=>{calls.push(x);return 42;}});
 assert.equal(await read({database,queryId:'invoiceCount'}),42);
 assert.deepEqual(calls,['audit',{database,sql:'SELECT COUNT_BIG(*) AS count FROM dbo.FACTURE',readOnly:true}]);
});
test('arbitrary SQL cannot reach loader or executor', async () => {
 let calls=0;
 const read=createHolooLabReader({loadAudit:async()=>{calls++;return audit;},executor:async()=>{calls++;}});
 for(const queryId of ['DELETE FROM dbo.FACTURE','invoiceCount; DROP TABLE dbo.FACTURE','__proto__',undefined,{}]) await assert.rejects(read({database,queryId}));
 assert.equal(calls,0);
});
test('production target and invalid trusted audit never reach executor', async () => {
 let calls=0;
 const read=createHolooLabReader({loadAudit:async()=>null,executor:async()=>{calls++;}});
 await assert.rejects(read({database:'Holoo1',queryId:'invoiceCount'}));
 await assert.rejects(read({database,queryId:'invoiceCount',audit}));
 assert.equal(calls,0);
});
test('caller cannot substitute audit evidence', async () => {
 let calls=0;
 const read=createHolooLabReader({loadAudit:async()=>({}),executor:async()=>{calls++;}});
 await assert.rejects(read({database,queryId:'invoiceCount',audit}));
 assert.equal(calls,0);
});
test('missing trusted dependencies fail closed', () => {
 assert.throws(()=>createHolooLabReader({executor:async()=>42}));
 assert.throws(()=>createHolooLabReader({loadAudit:async()=>audit}));
});
