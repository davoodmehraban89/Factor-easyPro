import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { evaluateHolooWrite } = require('../src/holoo-write-policy.cjs');
const database = 'HolooBackup_050808_LAB_20261110';
const audit = { database, readOnlyAudit: true, complete: true, productionWriteGate: { status: 'NO-GO', productionWritesAuthorized: false } };
test('deny all write attempts even with approved lab audit', () => {
 for (const operation of ['insert','update','delete','execute','write',undefined]) assert.equal(evaluateHolooWrite({ operation, database, audit }).allowed, false);
});
test('deny production database even for reads', () => {
 assert.equal(evaluateHolooWrite({ operation:'read', database:'Holoo1', audit }).allowed, false);
});
test('deny missing or malformed audit', () => {
 for (const bad of [undefined, {}, {...audit,complete:false}, {...audit,productionWriteGate:{status:'GO',productionWritesAuthorized:true}}]) assert.equal(evaluateHolooWrite({ operation:'read', database, audit:bad }).allowed, false);
});
test('allow only audited approved lab read operation', () => {
 assert.equal(evaluateHolooWrite({ operation:'read', database, audit }).allowed, true);
});
