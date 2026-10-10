import test from 'node:test';import assert from 'node:assert/strict';import {trialStatus,licensedStatus} from '../src/core/LicensePolicy.mjs';
const DAY=86400000,now=Date.UTC(2026,9,7);
test('trial expires at 15 days',()=>assert.equal(trialStatus({trialStartedAt:new Date(now-15*DAY).toISOString(),issuedInvoiceCount:0},now).readOnly,true));
test('trial expires at 20 issued invoices',()=>assert.equal(trialStatus({trialStartedAt:new Date(now).toISOString(),issuedInvoiceCount:20},now).readOnly,true));
test('trial remains writable before both limits',()=>assert.equal(trialStatus({trialStartedAt:new Date(now-14*DAY).toISOString(),issuedInvoiceCount:19},now).readOnly,false));
test('licensed offline lease warns at day 25',()=>assert.equal(licensedStatus({active:true,perpetual:true,lastOnlineCheckAt:new Date(now-25*DAY).toISOString()},now).warning,true));
test('licensed offline lease is read only after day 30',()=>assert.equal(licensedStatus({active:true,perpetual:true,lastOnlineCheckAt:new Date(now-31*DAY).toISOString()},now).readOnly,true));
