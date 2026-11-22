import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { readApprovedLabCount } = require('../src/holoo-lab-reader.cjs');
const database='HolooBackup_050808_LAB_20261110';
test('real SQL lab counts match verified structural audit', {skip:process.platform!=='win32'||process.env.HOLOO_SQL_INTEGRATION!=='1'}, async()=>{
 const {loadApprovedHolooAudit}=require('../src/holoo-audit-loader.cjs');
 const audit=loadApprovedHolooAudit();
 for(const [queryId,field] of [['invoiceCount','invoiceHeaders'],['lineCount','invoiceLines'],['documentCount','accountingDocuments']]) {
   assert.equal(await readApprovedLabCount({database,queryId}),audit.integrity[field],queryId);
 }
});
test('rejects production database and arbitrary SQL without running queries',async()=>{
 await assert.rejects(readApprovedLabCount({database:'Holoo1',queryId:'invoiceCount'}));
 await assert.rejects(readApprovedLabCount({database,queryId:'DELETE FROM FACTURE'}));
});
