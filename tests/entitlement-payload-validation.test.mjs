import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEntitlementPayload } from '../src/core/EntitlementVerifier.mjs';

const NOW = Date.UTC(2026, 9, 14);
const VALID = {
  product: 'Factor-easyPro', installationId: 'device-1',
  maxCompanies: 5, maxUsers: 4, maxDevices: 1,
  notBefore: '2026-01-01T00:00:00Z',
  expiresAt: '2027-01-01T00:00:00Z',
  perpetual: false
};

test('A06: valid device-bound timed or perpetual entitlement policy can pass', () => {
  assert.equal(validateEntitlementPayload(VALID, 'device-1', NOW), true);
  assert.equal(validateEntitlementPayload({ ...VALID, perpetual: true, expiresAt: undefined }, 'device-1', NOW), true);
});

test('A06: malformed expiration cannot create an accidental perpetual license', () => {
  for (const expiresAt of [undefined, null, '', 'not-a-date', '2025-01-01T00:00:00Z']) {
    assert.equal(validateEntitlementPayload({ ...VALID, expiresAt }, 'device-1', NOW), false);
  }
});

test('A06: invalid notBefore, wrong installation and product are rejected', () => {
  for (const notBefore of ['bad-date', '', '2027-01-02T00:00:00Z']) {
    assert.equal(validateEntitlementPayload({ ...VALID, notBefore }, 'device-1', NOW), false);
  }
  assert.equal(validateEntitlementPayload(VALID, 'another-installation', NOW), false);
  assert.equal(validateEntitlementPayload({ ...VALID, product: 'other' }, 'device-1', NOW), false);
});

test('A06: license seat limits must be bounded integer quantities', () => {
  for (const value of [0, 6, '5', 1.5, Infinity, NaN]) {
    assert.equal(validateEntitlementPayload({ ...VALID, maxCompanies: value }, 'device-1', NOW), false);
  }
  for (const value of [0, 5, '4', 1.5]) {
    assert.equal(validateEntitlementPayload({ ...VALID, maxUsers: value }, 'device-1', NOW), false);
  }
  for (const value of [0, '1', 1.5]) {
    assert.equal(validateEntitlementPayload({ ...VALID, maxDevices: value }, 'device-1', NOW), false);
  }
});
