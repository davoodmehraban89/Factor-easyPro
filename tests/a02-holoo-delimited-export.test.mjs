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


test('A02: declared Holoo report control counts and rial totals match explicit mapped data', () => {
  const sample = fixture();
  sample.declaredControlTotals = {
    contacts: { count: 1, receivable: 0, payable: 0 },
    products: { count: 1 },
    invoices: { count: 1, grandTotal: 300, paidAmount: 100 },
    invoiceLines: { count: 1 }, cheques: { count: 1, amount: 50 }
  };
  const before = structuredClone(sample);
  const result = previewHolooDelimitedExport(sample);
  assert.equal(result.issueCount, 0, JSON.stringify(result.issues));
  assert.equal(result.declaredControlChecks, 10);
  assert.equal(result.sourceControlClaimsPresent, true);
  assert.equal(result.independentlyVerified, false);
  assert.equal(result.canCommit, false);
  assert.deepEqual(sample, before);
});

test('A02: source-report amount and row-count differences fail without leaking actual financial numbers', () => {
  const sample = fixture();
  sample.declaredControlTotals = { invoices: { count: 2, grandTotal: 97531, paidAmount: 99999 } };
  const result = previewHolooDelimitedExport(sample);
  const codes = result.issues.map(x => x.code);
  for (const code of ['CONTROL_COUNT_MISMATCH','CONTROL_AMOUNT_MISMATCH'])
    assert.ok(codes.includes(code));
  for (const secret of ['97531','99999','مشتری'])
    assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(result.canCommit, false);
  assert.equal(result.status, 'blocked');
});

test('A02: explicit toman source amounts are reconciled only against correctly converted rial controls', () => {
  const sample = fixture();
  sample.moneyUnit = 'toman';
  sample.declaredControlTotals = { invoices: { grandTotal: 3000, paidAmount: 1000 } };
  assert.equal(previewHolooDelimitedExport(sample).issueCount, 0);
  sample.declaredControlTotals.invoices.grandTotal = 300;
  const report = previewHolooDelimitedExport(sample);
  assert.ok(report.issues.some(x => x.code === 'CONTROL_AMOUNT_MISMATCH'));
});

test('A02: controls never claim success when their table is missing or the source amount is invalid', () => {
  const sample = fixture();
  sample.declaredControlTotals = { cheques: { count: 1 } };
  delete sample.tables.cheques;
  delete sample.mappings.cheques;
  const missing = previewHolooDelimitedExport(sample);
  assert.ok(missing.issues.some(x => x.code === 'CONTROL_SOURCE_DATASET_MISSING'));
  sample.tables.cheques = {text:'id,amount\nQ1,N/A\n'};
  sample.mappings.cheques = { sourceId: 'id', amount: 'amount' };
  sample.declaredControlTotals = { cheques: { amount: 50 } };
  const invalid = previewHolooDelimitedExport(sample);
  assert.ok(invalid.issues.some(x => x.code === 'CONTROL_SOURCE_AMOUNT_INVALID'));
});

test('A02: large per-row safe amounts detect aggregate overflow and never silently round', () => {
  const sample = fixture();
  sample.tables.invoices.text =
    'id,contact,gross,paid\nI1,C1,9007199254740990,0\nI2,C1,9007199254740990,0\n';
  sample.declaredControlTotals = { invoices: { grandTotal: 9007199254740990 } };
  const result = previewHolooDelimitedExport(sample);
  assert.ok(result.issues.some(x => x.code === 'CONTROL_SOURCE_SUM_OVERFLOW'));
});

test('A02: reject unauthorized control schema, unsafe numbers and prototype-name tables', () => {
  const sample = fixture();
  sample.declaredControlTotals = { invoices: { amount: 10 } };
  assert.throws(() => previewHolooDelimitedExport(sample), /CONTROL_TOTALS_SCHEMA_INVALID/);
  sample.declaredControlTotals = { invoices: { grandTotal: Number.MAX_SAFE_INTEGER + 1 } };
  assert.throws(() => previewHolooDelimitedExport(sample), /CONTROL_TOTAL_NOT_SAFE_RIAL/);
  sample.declaredControlTotals = { constructor: { count: 1 } };
  assert.throws(() => previewHolooDelimitedExport(sample), /CONTROL_TOTALS_SCHEMA_INVALID/);
  delete sample.declaredControlTotals;
  sample.tables.constructor = { text: 'id\nx\n' };
  assert.throws(() => previewHolooDelimitedExport(sample), /SOURCE_UNSUPPORTED_TABLE/);
});

test('A02: bounded combined diagnostics preserve total count without leaking raw data', () => {
  const sample = fixture();
  sample.tables.cheques.text = 'id,amount\nX,-45\n';
  sample.declaredControlTotals = {
    cheques: { count: 2, amount: 123456 },
    invoices: { count: 0, grandTotal: 999999 }
  };
  const result = previewHolooDelimitedExport(sample, { maxIssues: 2 });
  assert.equal(result.issues.length, 2);
  assert.equal(result.truncated, true);
  assert.ok(result.issueCount > 2);
  assert.equal(result.independentlyVerified, false);
  assert.ok(!JSON.stringify(result).includes('123456'));
  assert.ok(!JSON.stringify(result).includes('999999'));
});

test('A02: blank CSV records never disappear from source counts', () => {
  assert.throws(
    () => parseStrictDelimitedRows('id,name\nC1,A\n\nC2,B\n'),
    /CSV_EMPTY_RECORD/
  );
  assert.throws(
    () => parseStrictDelimitedRows('id\n""\n'),
    /CSV_EMPTY_RECORD/
  );
  assert.deepEqual(
    parseStrictDelimitedRows('id,name\nC1,A\n').rows,
    [{ id: 'C1', name: 'A' }]
  );
});

test('A02: ambiguous mappings cannot reuse one source column for different fields', () => {
  const sample = fixture();
  sample.mappings.invoices.paidAmount = 'gross';
  assert.throws(
    () => previewHolooDelimitedExport(sample),
    /CSV_DUPLICATE_SOURCE_COLUMN_MAPPING/
  );
});

test('A02: supplied empty control claims are rejected, not presented as checked', () => {
  const sample = fixture();
  sample.declaredControlTotals = {};
  assert.throws(
    () => previewHolooDelimitedExport(sample),
    /CONTROL_TOTALS_SCHEMA_INVALID/
  );
});

test('A02: unknown canonical mapping fields fail closed before preflight', () => {
  const sample = fixture();
  sample.mappings.invoices.unrecognizedAmount = 'gross';
  assert.throws(() => previewHolooDelimitedExport(sample), /CSV_UNSUPPORTED_CANONICAL_FIELD/);
});

test('A02: a mapping without its source table fails closed', () => {
  const sample = fixture();
  delete sample.tables.cheques;
  assert.throws(() => previewHolooDelimitedExport(sample), /CSV_MAPPING_WITHOUT_SOURCE_TABLE/);
});
