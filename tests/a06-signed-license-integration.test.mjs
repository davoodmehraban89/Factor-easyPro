import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical } from '../src/core/EntitlementVerifier.mjs';
import { loadProductionLicensePublicKey, validateOfflineActivation }
  from '../src/core/LicenseActivationCore.mjs';

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
