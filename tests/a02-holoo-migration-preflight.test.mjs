import test from 'node:test';
import assert from 'node:assert/strict';
import { previewHolooExtract } from '../src/core/HolooMigrationPreflight.mjs';

const clean = () => ({
  sourceSystem: 'holoo',
  // Names are placeholders for an explicitly exported/decoded, *synthetic*
  // tabular source. Not claims about proprietary Holoo table/field names.
  datasets: {
    contacts: [{ code: 'C1', label: 'test', debit: 0, credit: 0 }],
    products: [{ code: 'P1', label: 'item' }],
    invoices: [{ id: 'I1', contact: 'C1', gross: 300, paid: 100 }],
    invoiceLines: [{ invoice: 'I1', product: 'P1' }],
    cheques: [{ code: 'Q1', total: 50 }]
  },
  columns: {
    contacts: { sourceId: 'code', name: 'label', receivable: 'debit', payable: 'credit' },
    products: { sourceId: 'code', name: 'label' },
    invoices: { sourceId: 'id', contactId: 'contact', grandTotal: 'gross', paidAmount: 'paid' },
    invoiceLines: { invoiceId: 'invoice', productId: 'product' },
    cheques: { sourceId: 'code', amount: 'total' }
  }
});

test('A02/Holoo synthetic explicit mapping preview never imports or writes anything', () => {
  const data = clean(), before = structuredClone(data);
  const result = previewHolooExtract(data);
  assert.equal(result.issueCount, 0);
  assert.equal(result.status, 'requires-source-and-accountant-review');
  assert.equal(result.inspectedRows, 5);
  assert.equal(result.importPerformed, false);
  assert.equal(result.writePerformed, false);
  assert.equal(result.canCommit, false);
  assert.deepEqual(data, before);
  assert.equal(Object.isFrozen(result), true);
});

test('A02/Holoo rejects duplicate source IDs and orphan references without identifying records', () => {
  const data = clean();
  data.datasets.contacts.push({ ...data.datasets.contacts[0], label: 'PRIVATE PERSON' });
  data.datasets.invoiceLines[0].invoice = 'missing-personal-document';
  data.datasets.invoiceLines[0].product = 'missing-secret-code';
  const result = previewHolooExtract(data);
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(x => x.code === 'DUPLICATE_SOURCE_ID'));
  assert.equal(result.issues.filter(x => x.code === 'REFERENCE_NOT_FOUND').length, 2);
  for (const sensitive of ['PRIVATE PERSON', 'missing-personal-document', 'missing-secret-code']) {
    assert.ok(!JSON.stringify(result).includes(sensitive));
  }
});

test('A02/Holoo refuses fractional/invalid rial amounts and overpaid invoices', () => {
  const data = clean();
  data.datasets.invoices[0].gross = 100.25;
  data.datasets.invoices[0].paid = 180;
  const result = previewHolooExtract(data);
  assert.ok(result.issues.some(x => x.code === 'AMOUNT_NOT_INTEGER_RIAL'));
  data.datasets.invoices[0].gross = 100;
  const result2 = previewHolooExtract(data);
  assert.ok(result2.issues.some(x => x.code === 'PAID_EXCEEDS_GROSS'));
});

test('A02/Holoo never guesses missing schema mappings or backup decoders', () => {
  const data = clean();
  delete data.columns.cheques;
  const result = previewHolooExtract(data);
  assert.ok(result.issues.some(x => x.code === 'MAPPING_REQUIRED'));
  assert.equal(result.canCommit, false);
  assert.throws(() => previewHolooExtract({ ...data, sourceSystem: 'unknown' }));
  assert.throws(() => previewHolooExtract({ ...data, datasets: { invoices: {} } }));
});

test('A02/Holoo exposes bounded diagnostics for big sensitive exports', () => {
  const data = clean();
  data.datasets.cheques = Array.from({ length: 15 }, (_, i) => ({
    code: 'duplicate', total: -100, holder: 'PERSON ' + i
  }));
  const result = previewHolooExtract(data, { maxIssues: 2 });
  assert.equal(result.issues.length, 2);
  assert.equal(result.truncated, true);
  assert.ok(result.issueCount > 2);
  assert.ok(!JSON.stringify(result).includes('PERSON'));
  for (const n of [0, -1, 1001, 1.5]) {
    assert.throws(() => previewHolooExtract(data, { maxIssues: n }), RangeError);
  }
});

test('A02/Holoo unrecognized snapshots are blocked and no false import readiness claimed', () => {
  const missing = previewHolooExtract({ sourceSystem: 'holoo' });
  assert.equal(missing.status, 'blocked');
  assert.ok(missing.issues.some(x => x.code === 'SOURCE_HAS_NO_MAPPED_ROWS'));
  const sparse = previewHolooExtract({ sourceSystem: 'holoo', datasets: {
    products: [{ id: 'p1', name: 'some product' }]
  }, columns: { products: { sourceId: 'id', name: 'name' } } });
  assert.equal(sparse.issueCount, 0);
  assert.equal(sparse.status, 'requires-source-and-accountant-review');
  assert.equal(sparse.canCommit, false);
});

test('A02/Holoo missing invoice lines cannot appear migration-ready',()=>{
 const data=clean();
 data.datasets.invoiceLines=[];
 const before=structuredClone(data);
 const result=previewHolooExtract(data);
 assert.equal(result.status,'blocked');
 assert.ok(result.issues.some(x=>x.code==='INVOICE_LINES_REQUIRED'));
 assert.deepEqual(data,before);
 assert.equal(result.writePerformed,false);
 assert.equal(result.importPerformed,false);
 assert.equal(result.canCommit,false);
});

test('A02/Holoo optional cheque counterparty mapping detects orphan references',()=>{
 const data=clean();
 data.datasets.cheques[0].party='C1';
 data.columns.cheques.contactId='party';
 assert.equal(previewHolooExtract(data).issueCount,0);
 data.datasets.cheques[0].party='unlisted-PRIVATE-CONTACT';
 const before=structuredClone(data);
 let result=previewHolooExtract(data);
 assert.ok(result.issues.some(x=>x.code==='REFERENCE_NOT_FOUND'&&x.table==='cheques'));
 assert.ok(!JSON.stringify(result).includes('PRIVATE-CONTACT'));
 assert.deepEqual(data,before);
 data.datasets.contacts=[];
 result=previewHolooExtract(data);
 assert.ok(result.issues.some(x=>x.code==='REFERENCE_PARENT_DATASET_REQUIRED'&&x.table==='cheques'));
 assert.equal(result.importPerformed,false);
});

test('A02/Holoo numeric names and zero value cheques are blocked without PII leakage',()=>{
 const data=clean();
 data.datasets.contacts[0].label=7319;
 data.datasets.products[0].label=0;
 data.datasets.cheques[0].total=0;
 const result=previewHolooExtract(data);
 assert.equal(result.status,'blocked');
 assert.equal(result.issues.filter(x=>x.code==='REQUIRED_FIELD_EMPTY').length,2);
 assert.ok(result.issues.some(x=>x.code==='ZERO_VALUE_CHEQUE'));
 assert.equal(result.canCommit,false);
 assert.equal(result.writePerformed,false);
 assert.ok(!JSON.stringify(result).includes('7319'));
});

test('A02/Holoo each mapped invoice header must be covered by its own line items',()=>{
 const data=clean();
 data.datasets.invoices.push({
   id:'PRIVATE-MISSING-INVOICE-002',contact:'C1',gross:120,paid:0
 });
 const before=structuredClone(data);
 const report=previewHolooExtract(data);
 assert.equal(report.status,'blocked');
 assert.equal(report.issueCount,1);
 assert.deepEqual(report.issues,[{
   code:'INVOICE_WITHOUT_LINES',table:'invoices',rowIndex:1
 }]);
 assert.equal(report.canCommit,false);
 assert.equal(report.writePerformed,false);
 assert.equal(report.importPerformed,false);
 assert.ok(!JSON.stringify(report).includes('PRIVATE-MISSING-INVOICE-002'));
 assert.deepEqual(data,before,'The preflight must remain read-only');
 data.datasets.invoiceLines.push({invoice:'PRIVATE-MISSING-INVOICE-002',product:'P1'});
 const covered=previewHolooExtract(data);
 assert.equal(covered.issueCount,0);
 assert.equal(covered.status,'requires-source-and-accountant-review');
 assert.equal(covered.canCommit,false);
});

test('A02/Holoo orphan line does not disguise an uncovered invoice and diagnostics stay bounded',()=>{
 const data=clean();
 data.datasets.invoices.push({id:'PRIVATE-UNCOVERED',contact:'C1',gross:60,paid:0});
 data.datasets.invoiceLines[0].invoice='PRIVATE-ORPHAN';
 const report=previewHolooExtract(data,{maxIssues:2});
 assert.equal(report.status,'blocked');
 assert.equal(report.issues.length,2);
 assert.equal(report.truncated,true);
 assert.equal(report.issueCount,3);
 assert.equal(report.issues.filter(x=>x.code==='INVOICE_WITHOUT_LINES').length,2);
 for (const secret of ['PRIVATE-UNCOVERED','PRIVATE-ORPHAN']) {
   assert.ok(!JSON.stringify(report).includes(secret));
 }
 assert.equal(report.importPerformed,false);
 assert.equal(report.canCommit,false);
});
