import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';

test('V2 schema upgrade from phase-one v5 preserves ledgers, stock and people',async()=>{
 const raw=await new Promise((resolve,reject)=>{
   const request=indexedDB.open('finora_pro_db',5);
   request.onupgradeneeded=()=>{
     const db=request.result;
     for(const name of ['companies','contacts','products','invoices',
       'account_chart','fiscal_periods','journal_entries','journal_lines']) {
       if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});
     }
     const tx=request.transaction;
     tx.objectStore('invoices').put({id:'old-finance-inv',companyId:'company_default',number:'119'});
     tx.objectStore('journal_entries').put({id:'old-journal',companyId:'company_default',
       status:'posted',debit:100,credit:100});
   };
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
 });
 raw.close();
 const db=await StorageService.init();
 assert.equal(db.version,6);
 assert.equal((await StorageService.get('invoices','old-finance-inv')).number,'119');
 assert.equal((await StorageService.get('journal_entries','old-journal')).debit,100);
 for(const store of ['warehouses','inventory_balances','stocktakes','stocktake_lines',
   'settlements','account_mappings'])assert.ok(db.objectStoreNames.contains(store),store);
 const snapshot=await StorageService.exportAll();
 assert.equal(snapshot.data.invoices.length,1);
 assert.equal(snapshot.data.journal_entries.length,1);
});
