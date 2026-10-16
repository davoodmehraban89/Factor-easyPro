import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStrictDelimitedRows, previewHolooDelimitedExport
} from '../src/core/HolooDelimitedExportPreflight.mjs';

const fixture = () => ({
  sourceSystem: 'holoo',
  moneyUnit: 'rial',
  tables: {
    contacts: { text: '\uFEFFcode;name;ar;ap\r\nC1;"مشتری ""نمونه""";0;0\r\n', delimiter: ';' },
    products: { text: 'code,name\r\nP1,نمونه\r\n' },
    invoices: { text: 'id,contact,gross,paid\nI1,C1,300,100\n' },
    invoiceLines: { text: 'invoice,product\nI1,P1\n' },
    cheques: { text: 'id,amount\nQ1,50\n' }
  },
  mappings: {
    contacts: { sourceId: 'code', name: 'name', receivable: 'ar', payable: 'ap' },
    products: { sourceId: 'code', name: 'name' },
    invoices: { sourceId: 'id', contactId: 'contact', grandTotal: 'gross', paidAmount: 'paid' },
    invoiceLines: { invoiceId: 'invoice', productId: 'product' },
    cheques: { sourceId: 'id', amount: 'amount' }
  }
});

test('A02: mapped synthetic Holoo CSV/TSV extracts report only bounded non-identifying results', () => {
  const sample=fixture(), snapshot=structuredClone(sample);
  const report=previewHolooDelimitedExport(sample);
  assert.equal(report.issueCount, 0, JSON.stringify(report.issues));
  assert.equal(report.inspectedRows, 5);
  assert.equal(report.inputType, 'explicit-mapped-delimited-export');
  assert.equal(report.status, 'requires-source-and-accountant-review');
  assert.equal(report.canCommit, false);
  assert.equal(report.sourceVersionVerified, false);
  assert.deepEqual(sample,snapshot);
  assert.ok(!JSON.stringify(report).includes('مشتری'));
});

test('A02: quoted multiline text, escaped quotes and BOM parse without changing identity', () => {
  const parsed=parseStrictDelimitedRows('\uFEFFid,comment\r\n1,"line\n""quoted"""\r\n');
  assert.equal(parsed.rows.length,1);
  assert.deepEqual(parsed.headers,['id','comment']);
  assert.equal(parsed.rows[0].comment,'line\n"quoted"');
});

test('A02: currency unit conversion is explicit; no unannounced toman/rial guessing', () => {
  const sample=fixture();
  sample.moneyUnit='toman';
  sample.tables.invoices.text='id,contact,gross,paid\nI1,C1,1.5,1\n';
  const invalid=previewHolooDelimitedExport(sample);
  assert.ok(invalid.issues.some(x=>x.code==='AMOUNT_NOT_INTEGER_RIAL'));
  sample.tables.invoices.text='id,contact,gross,paid\nI1,C1,100,110\n';
  const bad=previewHolooDelimitedExport(sample);
  assert.ok(bad.issues.some(x=>x.code==='PAID_EXCEEDS_GROSS'));
  sample.moneyUnit='auto';
  assert.throws(()=>previewHolooDelimitedExport(sample),/MONEY_UNIT_REQUIRED/);
});

test('A02: partial source graph cannot silently pretend linked contacts exist', () => {
  const sample=fixture();
  delete sample.tables.contacts;
  delete sample.mappings.contacts;
  const result=previewHolooDelimitedExport(sample);
  assert.ok(result.issues.some(x=>x.code==='REFERENCE_PARENT_DATASET_REQUIRED'));
  assert.equal(result.status,'blocked');
});

test('A02: reference mismatch, malformed quote and row width abort before import', () => {
  const sample=fixture();
  sample.tables.invoiceLines.text='invoice,product\nI1,OTHER\n';
  const invalid=previewHolooDelimitedExport(sample);
  assert.ok(invalid.issues.some(x=>x.code==='REFERENCE_NOT_FOUND'));
  sample.tables.invoiceLines.text='invoice,product\n"I1,P1\n';
  assert.throws(()=>previewHolooDelimitedExport(sample),/CSV_UNTERMINATED_QUOTE/);
  sample.tables.invoiceLines.text='invoice,product\nI1\n';
  assert.throws(()=>previewHolooDelimitedExport(sample),/CSV_ROW_WIDTH_MISMATCH/);
});

test('A02: fail closed on ambiguous headers, missing mapped columns and unsupported table', () => {
  const sample=fixture();
  sample.tables.invoices.text='id,id,gross,paid\nI1,C1,300,100\n';
  assert.throws(()=>previewHolooDelimitedExport(sample),/CSV_INVALID_HEADER/);
  sample.tables.invoices.text='id,contact,gross,paid\nI1,C1,300,100\n';
  sample.mappings.invoices.paidAmount='missing';
  assert.throws(()=>previewHolooDelimitedExport(sample),/CSV_MAPPED_COLUMN_ABSENT/);
  sample.tables.hiddenSecrets={text:'anything\nraw\n'};
  assert.throws(()=>previewHolooDelimitedExport(sample),/SOURCE_UNSUPPORTED_TABLE/);
});

test('A02: text containing prototype-like column header cannot poison object prototype', () => {
  const result=parseStrictDelimitedRows('__proto__,constructor,id\nhijack,x,C1\n');
  assert.equal(result.rows[0]['__proto__'],'hijack');
  assert.equal(({}).hijack,undefined);
});

test('A02: diagnostics never expose raw bank IDs, contacts or formulas', () => {
  const sample=fixture();
  sample.tables.cheques.text='id,amount,name\nPRIVATE1234,-25,"=HYPERLINK(""https://example.invalid"")"\n';
  const outcome=previewHolooDelimitedExport(sample,{maxIssues:1});
  assert.equal(outcome.status,'blocked');
  for(const term of ['PRIVATE1234','HYPERLINK','example.invalid'])
    assert.ok(!JSON.stringify(outcome).includes(term));
  assert.equal(outcome.writePerformed,false);
  assert.equal(outcome.importPerformed,false);
});

test('A02: reject large cells and unsupported separator without emitting source text', () => {
  assert.throws(()=>parseStrictDelimitedRows('id,name\n1,'+'z'.repeat(270000)),/CSV_CELL_TOO_LARGE/);
  assert.throws(()=>parseStrictDelimitedRows('id|name\n1|x',{delimiter:'|'}),/CSV_UNSUPPORTED_DELIMITER/);
});
