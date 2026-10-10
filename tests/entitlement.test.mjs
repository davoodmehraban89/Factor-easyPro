import test from 'node:test';import assert from 'node:assert/strict';import {canonical,validateEntitlementPayload} from '../src/core/EntitlementVerifier.mjs';
test('canonical payload is key-order stable',()=>assert.equal(canonical({b:2,a:1}),canonical({a:1,b:2})));
test('entitlement is installation-bound',()=>assert.equal(validateEntitlementPayload({product:'Factor-easyPro',installationId:'other',perpetual:true,maxCompanies:1,maxUsers:1,maxDevices:1},'this'),false));
test('entitlement enforces normalized caps',()=>assert.equal(validateEntitlementPayload({product:'Factor-easyPro',installationId:'x',perpetual:true,maxCompanies:6,maxUsers:4,maxDevices:1},'x'),false));
