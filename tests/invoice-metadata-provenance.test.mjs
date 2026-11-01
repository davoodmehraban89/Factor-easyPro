import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { inspectInvoiceMetadataProvenance } from '../src/core/FinancialDiagnosticsService.js';
import { auditStoredInvoiceProvenance } from '../src/core/InvoiceMetadataProvenance.mjs';

async function setup() {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'a01-provenance-admin', role: 'admin', username: 'admin' };
  await StorageService.put('companies', { id: 'a01-company', name: 'Synthetic company' });
  await StorageService.put('companies', { id: 'foreign-company', name: 'Foreign synthetic company' });
  CompanyService.activeCompanyId = 'a01-company';
}

const valid = overrides => ({
  id: 'a01-good', companyId: 'a01-company', isPreInvoice: false, financePosted: true,
  kind: 'sale', subtotal: 270, totalDiscount: 27,
  discountType: 'percent', discountInput: 10,
  vatEnabled: true, vatRate: 10, vatAmount: 24,
  items: [{ qty: 2, price: 150, discountType: 'percent',
    discountInput: 10, discount: 30, lineSubtotal: 300, lineTotal: 270 }],
  ...overrides
});

test('A01 metadata: known exact whole-rial tax and discount input has no false issues', async () => {
  assert.deepEqual(auditStoredInvoiceProvenance(valid({})), []);
  assert.deepEqual(auditStoredInvoiceProvenance(valid({
    vatEnabled: false, vatRate: 0, vatAmount: 0, discountType:'fixed',
    discountInput:27, items:[{qty:2,price:150,discountType:'fixed',discountInput:30,discount:30}]
  })), []);
});

test('A01 metadata: missing historical percentage and VAT provenance is flagged, never guessed', async () => {
  await setup();
  const legacy = valid({
    id:'a01-legacy',financePosted:false,vatEnabled:undefined,vatRate:undefined,
    discountInput:undefined,items:[{qty:2,price:150,discountType:'percent',discount:30}],
    customerPhone:'CONFIDENTIAL_CONTACT_DATA',
    contactName:'CONFIDENTIAL_COMPANY_NAME'
  });
  await StorageService.put('invoices', legacy);
  const foreign = valid({
    id:'a01-foreign',companyId:'foreign-company',vatEnabled:true,vatRate:-1,
    discountInput:undefined,contactName:'FOREIGN_PRIVATE_DATA'
  });
  await StorageService.put('invoices',foreign);
  await StorageService.put('invoices',valid({id:'a01-draft',isPreInvoice:true,vatEnabled:undefined}));
  const original = await StorageService.get('invoices','a01-legacy');
  const report = await inspectInvoiceMetadataProvenance();
  assert.equal(report.companyId,'a01-company');
  assert.equal(report.checkedInvoices,1);
  assert.equal(report.legacyDirectInvoices,1);
  assert.equal(report.affectedInvoices,1);
  assert.deepEqual(report.issues.map(x=>x.code).sort(),[
    'GLOBAL_DISCOUNT_INPUT_MISSING','LINE_DISCOUNT_INPUT_MISSING','VAT_TREATMENT_UNKNOWN'
  ]);
  assert.ok(report.issues.every(x=>x.documentId==='a01-legacy'));
  assert.deepEqual(report.issues.find(x=>x.code==='LINE_DISCOUNT_INPUT_MISSING')?.lineIndex,0);
  const serialized=JSON.stringify(report);
  for(const privateField of ['CONFIDENTIAL_CONTACT_DATA','CONFIDENTIAL_COMPANY_NAME','FOREIGN_PRIVATE_DATA'])
    assert.ok(!serialized.includes(privateField));
  assert.deepEqual(await StorageService.get('invoices','a01-legacy'),original,
    'read-only provenance check must not repair historical invoice fields');
});

test('A01 metadata: inconsistent explicitly-stored inputs are distinguished from missing evidence', async () => {
  const bad=valid({
    vatAmount:25, discountInput:9,
    items:[{qty:2,price:150,discountType:'percent',discountInput:20,discount:30}]
  });
  assert.deepEqual(auditStoredInvoiceProvenance(bad).map(x=>x.code).sort(),[
    'GLOBAL_DISCOUNT_AMOUNT_MISMATCH','LINE_DISCOUNT_AMOUNT_MISMATCH','VAT_AMOUNT_MISMATCH'
  ]);
  const invalid = valid({
    vatEnabled:true,vatRate:'nan',
    items:[{qty:1,price:150,discountType:'percent',discountInput:120,discount:10}]
  });
  assert.ok(auditStoredInvoiceProvenance(invalid).some(x=>x.code==='VAT_RATE_INVALID'));
  assert.ok(auditStoredInvoiceProvenance(invalid).some(x=>x.code==='LINE_DISCOUNT_INPUT_OR_BASIS_INVALID'));
});

test('A01 metadata: diagnostics bound issue disclosure, count all issues and reject unsafe limits', async () => {
  await setup();
  for(let i=0;i<5;i++){
    await StorageService.put('invoices',valid({
      id:'a01-bad-'+i,vatEnabled:undefined,discountInput:undefined,
      items:[{qty:2,price:150,discountType:'percent',discount:30}]
    }));
  }
  const report=await inspectInvoiceMetadataProvenance({maxIssues:2});
  assert.equal(report.issueCount,15);
  assert.equal(report.issues.length,2);
  assert.equal(report.affectedInvoices,5);
  assert.equal(report.truncated,true);
  for(const maxIssues of [0,-1,1.5,1001,Infinity,'50']){
    await assert.rejects(inspectInvoiceMetadataProvenance({maxIssues}),RangeError);
  }
});

test('A01 metadata: diagnostics exposed as admin-only read-only UI action',()=>{
  const s=readFileSync(new URL('../src/views/SettingsView.js',import.meta.url),'utf8');
  assert.match(s,/runInvoiceMetadataDiagnostics\(\)/);
  assert.match(s,/if \(!Auth\.isAdmin\(\)\)/);
  assert.match(s,/inspectInvoiceMetadataProvenance\(\{ maxIssues: 50 \}\)/);
  assert.match(s,/this\._esc\(issue\.documentId\)/);
  assert.ok(!/const rate = .*vatAmount/.test(s));
});
