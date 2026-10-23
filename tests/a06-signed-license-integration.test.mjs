import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical } from '../src/core/EntitlementVerifier.mjs';
import { loadProductionLicensePublicKey, validateOfflineActivation }
  from '../src/core/LicenseActivationCore.mjs';
import 'fake-indexeddb/auto';
import { StorageService as db } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { LicenseService } from '../src/core/LicenseService.js';

const NOW = Date.UTC(2026, 9, 15);
async function newSignedExample() {
  const keys = await crypto.subtle.generateKey({
    name: 'ECDSA', namedCurve: 'P-256'
  }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const payload = {
    product: 'Factor-easyPro',
    installationId: 'device-hardware-1', perpetual: true,
    issuedAt: '2026-10-15T00:00:00.000Z',
    lastOnlineCheckAt: '2026-10-15T00:00:00.000Z',
    maxCompanies: 5, maxUsers: 4, maxDevices: 1
  };
  const sign = async value => {
    const sig = await crypto.subtle.sign({
      name: 'ECDSA', hash: 'SHA-256'
    }, keys.privateKey, new TextEncoder().encode(canonical(value)));
    return { payload: value, signature: Buffer.from(sig).toString('base64url') };
  };
  return { pub, payload, sign };
}

test('A06: only a trusted public P-256 key without private scalar is accepted', async () => {
  const { pub } = await newSignedExample();
  assert.deepEqual(loadProductionLicensePublicKey(JSON.stringify(pub)), pub);
  assert.equal(loadProductionLicensePublicKey(null), null);
  assert.equal(loadProductionLicensePublicKey('{}'), null);
  assert.equal(loadProductionLicensePublicKey('{invalid-json'), null);
  assert.equal(loadProductionLicensePublicKey(JSON.stringify({ ...pub, d: 'secret' })), null);
});

test('A06: locally generated signed license verifies when bound to this exact installation', async () => {
  const { pub, payload, sign } = await newSignedExample();
  const token = await sign(payload);
  assert.equal(await validateOfflineActivation(token, pub, 'device-hardware-1', NOW), true);
  assert.equal(await validateOfflineActivation(token, pub, 'another-device', NOW), false);
  assert.equal(await validateOfflineActivation(
    { ...token, payload: { ...payload, maxUsers: 8 } }, pub, 'device-hardware-1', NOW
  ), false);
  assert.equal(await validateOfflineActivation(
    { ...token, signature: 'tampered' }, pub, 'device-hardware-1', NOW
  ), false);
});

test('A06: signed lease fails closed after 30 days, before activation, or on future timestamps', async () => {
  const { pub, payload, sign } = await newSignedExample();
  const token = await sign(payload);
  const DAY = 86400000;
  assert.equal(await validateOfflineActivation(token, pub, payload.installationId, NOW + 31 * DAY), false);
  assert.equal(await validateOfflineActivation(token, pub, payload.installationId, NOW - DAY), false);
  const future = await sign({
    ...payload, issuedAt: '2026-10-20T00:00:00.000Z',
    lastOnlineCheckAt: '2026-10-20T00:00:00.000Z'
  });
  assert.equal(await validateOfflineActivation(future, pub, payload.installationId, NOW), false);
});

test('A06: a caller-supplied forged public key is not automatically trusted by the application', async () => {
  const { payload, sign } = await newSignedExample();
  const attackerToken = await sign(payload);
  assert.equal(await validateOfflineActivation(attackerToken, null, payload.installationId, NOW), false);
});

test('A06: invalid wall-clock inputs cannot validate a signed offline lease', async () => {
  const { pub, payload, sign } = await newSignedExample();
  const token = await sign(payload);
  for (const invalidNow of [NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_VALUE, null, '2026-10-15']) {
    assert.equal(await validateOfflineActivation(token, pub, payload.installationId, invalidNow),
      false, String(invalidNow));
  }
  assert.equal(await validateOfflineActivation(token, pub, payload.installationId, NOW), true);
});

test('A06: initialized verified quota limits new companies and users; existing data stays readable',async()=>{
 const previous={state:LicenseService.state,verifiedPayload:LicenseService.verifiedPayload,
   clockRollback:LicenseService.clockRollback,user:Auth.currentUser,
   company:CompanyService.activeCompanyId};
 try {
   await db.clearAll();
   await db.put('users',{id:'quota-admin',role:'admin',username:'quota-admin'});
   await db.put('companies',{id:'quota-primary',name:'Existing company'});
   Auth.currentUser={id:'quota-admin',role:'admin',username:'quota-admin'};
   CompanyService.activeCompanyId='quota-primary';
   const now=new Date().toISOString();
   LicenseService.state={installationId:'quota-device',lastSeenAt:now};
   // The signature/installation verification is tested above. Here we
   // simulate its already verified in-memory payload at the service boundary.
   LicenseService.verifiedPayload={
     product:'Factor-easyPro',installationId:'quota-device',
     perpetual:true,issuedAt:now,lastOnlineCheckAt:now,
     maxCompanies:1,maxUsers:1,maxDevices:1
   };
   LicenseService.clockRollback=false;
   await assert.rejects(CompanyService.create({name:'Blocked extra company'}),/تعداد شرکت/);
   await assert.rejects(Auth.createUser({
     username:'quota-staff',password:'secure-password-012345',
     displayName:'Employee'
   }),/تعداد کاربر/);
   assert.equal((await db.getAll('companies')).length,1);
   assert.equal((await db.getAll('users')).length,1);
   assert.equal((await CompanyService.list()).length,1);
   LicenseService.verifiedPayload={
     ...LicenseService.verifiedPayload,maxCompanies:2,maxUsers:2
   };
   const newCompany=await CompanyService.create({name:'Allowed second company'});
   assert.ok(newCompany.id);
   const newUser=await Auth.createUser({
     username:'quota-staff',password:'secure-password-012345',
     displayName:'Employee'
   });
   assert.equal(newUser.username,'quota-staff');
   assert.equal((await db.getAll('companies')).length,2);
   assert.equal((await db.getAll('users')).length,2);
   await assert.rejects(CompanyService.create({name:'Third company'}),/تعداد شرکت/);
   await assert.rejects(Auth.createUser({
     username:'third-staff',password:'secure-password-012345'
   }),/تعداد کاربر/);
   LicenseService.clockRollback=true;
   await assert.rejects(CompanyService.create({name:'Expired write'}),/پایان/);
   await assert.rejects(Auth.createUser({
     username:'expired-staff',password:'secure-password-012345'
   }),/پایان/);
   assert.equal((await db.getAll('companies')).length,2,
     'Read-only license must not delete existing company data');
   assert.equal((await db.getAll('users')).length,2,
     'Read-only license must not delete existing accounts');
 } finally {
   LicenseService.state=previous.state;
   LicenseService.verifiedPayload=previous.verifiedPayload;
   LicenseService.clockRollback=previous.clockRollback;
   Auth.currentUser=previous.user;
   CompanyService.activeCompanyId=previous.company;
 }
});
