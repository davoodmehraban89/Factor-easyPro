import test from 'node:test';import assert from 'node:assert/strict';import {trialStatus,licensedStatus} from '../src/core/LicensePolicy.mjs';
const DAY=86400000,now=Date.UTC(2026,9,7);
test('trial expires at 15 days',()=>assert.equal(trialStatus({trialStartedAt:new Date(now-15*DAY).toISOString(),issuedInvoiceCount:0},now).readOnly,true));
test('trial expires at 20 issued invoices',()=>assert.equal(trialStatus({trialStartedAt:new Date(now).toISOString(),issuedInvoiceCount:20},now).readOnly,true));
test('trial remains writable before both limits',()=>assert.equal(trialStatus({trialStartedAt:new Date(now-14*DAY).toISOString(),issuedInvoiceCount:19},now).readOnly,false));
test('licensed offline lease warns at day 25',()=>assert.equal(licensedStatus({active:true,perpetual:true,lastOnlineCheckAt:new Date(now-25*DAY).toISOString()},now).warning,true));
test('licensed offline lease is read only after day 30',()=>assert.equal(licensedStatus({active:true,perpetual:true,lastOnlineCheckAt:new Date(now-31*DAY).toISOString()},now).readOnly,true));

test('A06: malformed persisted trial dates, counters and future dates fail closed without NaN UI', () => {
  const samples = [
    {}, { trialStartedAt: 'garbage', issuedInvoiceCount: 0 },
    { trialStartedAt: new Date(now).toISOString(), issuedInvoiceCount: -1 },
    { trialStartedAt: new Date(now).toISOString(), issuedInvoiceCount: '0' },
    { trialStartedAt: new Date(now + DAY).toISOString(), issuedInvoiceCount: 0 }
  ];
  for (const state of samples) {
    const status = trialStatus(state, now);
    assert.equal(status.readOnly, true);
    assert.equal(status.daysRemaining, 0);
    assert.equal(status.invoicesRemaining, 0);
    assert.ok(Number.isFinite(status.elapsedDays));
  }
});
test('A06: malformed or future lease and missing expiry cannot grant signed-license writes', () => {
  const values = [
    { perpetual: true, lastOnlineCheckAt: 'invalid' },
    { perpetual: true, lastOnlineCheckAt: new Date(now + DAY).toISOString() },
    { perpetual: false, lastOnlineCheckAt: new Date(now).toISOString() },
    { perpetual: false, expiresAt: 'invalid', lastOnlineCheckAt: new Date(now).toISOString() }
  ];
  for (const state of values) {
    assert.equal(licensedStatus(state, now).readOnly, true);
  }
  assert.equal(licensedStatus({
    perpetual: false, expiresAt: new Date(now + DAY).toISOString(),
    lastOnlineCheckAt: new Date(now).toISOString()
  }, now).readOnly, false);
});
