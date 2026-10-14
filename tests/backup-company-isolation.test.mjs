import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { Auth } from '../src/core/Auth.js';
import { SettingsController } from '../src/controllers/SettingsController.js';

test('company backup never exposes another company or global users/logs',async()=>{
  await StorageService.clearAll();
  Auth.currentUser={id:'admin-c1',role:'admin',username:'admin'};
  CompanyService.activeCompanyId='c1';

  await StorageService.put('companies',{id:'c1',name:'Company One'});
  await StorageService.put('companies',{id:'c2',name:'SECRET_COMPANY_TWO'});
  await StorageService.put('contacts',{id:'contact-c1',companyId:'c1',name:'Customer One'});
  await StorageService.put('contacts',{id:'contact-c2',companyId:'c2',name:'SECRET_CUSTOMER_TWO'});
  await StorageService.put('settings',{id:'finance_v2_enabled_c1',companyId:'c1',enabled:true});
  await StorageService.put('settings',{id:'finance_v2_enabled_c2',companyId:'c2',enabled:true,token:'SECRET_FOREIGN_SETTING'});
  await StorageService.put('settings',{id:'global_setting',value:'SECRET_GLOBAL_SETTING'});
  await StorageService.put('users',{id:'foreign-user',username:'SECRET_OTHER_USER',pwHash:'SECRET_PASSWORD_HASH'});
  await StorageService.put('logs',{id:'system-log',message:'SECRET_SENSITIVE_LOG'});

  const backup=await SettingsController.exportBackup();
  assert.equal(backup.scope,'company');
  assert.equal(backup.companyId,'c1');
  assert.ok(Number.isInteger(backup.schemaVersion));
  assert.deepEqual(backup.data.companies.map(x=>x.id),['c1']);
  assert.deepEqual(backup.data.contacts.map(x=>x.id),['contact-c1']);
  assert.deepEqual(backup.data.settings.map(x=>x.id),['finance_v2_enabled_c1']);
  assert.deepEqual(backup.data.users,[]);
  assert.deepEqual(backup.data.logs,[]);
  const exported=JSON.stringify(backup);
  for(const sensitive of ['SECRET_COMPANY_TWO','SECRET_CUSTOMER_TWO',
    'SECRET_FOREIGN_SETTING','SECRET_GLOBAL_SETTING','SECRET_OTHER_USER',
    'SECRET_PASSWORD_HASH','SECRET_SENSITIVE_LOG']){
    assert.ok(!exported.includes(sensitive),'A company-scoped backup leaked '+sensitive);
  }
  // The export operation cannot modify or erase the source records.
  assert.equal((await StorageService.get('companies','c2')).name,'SECRET_COMPANY_TWO');
  assert.equal((await StorageService.get('users','foreign-user')).pwHash,'SECRET_PASSWORD_HASH');
});

test('company backup preserves only same-company records from all financial stores',async()=>{
  await StorageService.clearAll();
  Auth.currentUser={id:'admin-c1',role:'admin',username:'admin'};
  CompanyService.activeCompanyId='c1';
  await StorageService.put('companies',{id:'c1',name:'One'});
  await StorageService.put('companies',{id:'c2',name:'Two'});
  await StorageService.put('invoices',{id:'i-c1',companyId:'c1',number:'120'});
  await StorageService.put('invoices',{id:'i-c2',companyId:'c2',number:'121'});
  await StorageService.put('journal_entries',{id:'j-c1',companyId:'c1',sourceKey:'c1-only'});
  await StorageService.put('journal_entries',{id:'j-c2',companyId:'c2',sourceKey:'c2-only'});
  const backup=await SettingsController.exportBackup();
  assert.deepEqual(backup.data.invoices.map(i=>i.id),['i-c1']);
  assert.deepEqual(backup.data.journal_entries.map(j=>j.id),['j-c1']);
});
