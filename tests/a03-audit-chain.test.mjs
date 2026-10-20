import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256, auditHash, verifyChain, normalizeLegacyAudit } from '../src/core/AuditChain.js';

function sample() {
  let previous = null;
  return ['first','second','third'].map((id, index) => {
    const row = { id, companyId: 'company-1', chainIndex: index,
      prevHash: previous, eventType: 'journal_posted' };
    row.eventHash = auditHash(row);
    previous = row.eventHash;
    return row;
  });
}
test('A03 SHA-256 matches published abc vector', () => {
  assert.equal(sha256('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('A03 valid chain and anchor', () => {
  const rows = sample();
  assert.equal(verifyChain(rows, { count: 3, headHash: rows[2].eventHash }).valid, true);
});
test('A03 changed event payload is detected', () => {
  const rows = sample();
  rows[1].eventType = 'period_closed';
  assert.equal(verifyChain(rows).valid, false);
});
test('A03 middle deletion is detected', () => {
  const rows = sample();
  rows.splice(1, 1);
  assert.equal(verifyChain(rows).valid, false);
});
test('A03 reordering is detected', () => {
  const rows = sample();
  [rows[0], rows[1]] = [rows[1], rows[0]];
  assert.equal(verifyChain(rows).valid, false);
});
test('A03 final event deletion needs a retained anchor', () => {
  const rows = sample();
  const anchor = { count: 3, headHash: rows[2].eventHash };
  rows.pop();
  assert.equal(verifyChain(rows, anchor).valid, false);
  assert.equal(verifyChain(rows).valid, true);
});
test('A03 old backup audit metadata receives deterministic defaults', () => {
  const old = { id: 'legacy-1', companyId: 'company-1', eventType: 'journal_posted' };
  const migrated = normalizeLegacyAudit(old, 0, null);
  assert.equal(migrated.actorId, 'legacy-unknown');
  assert.equal(migrated.sourceId, 'legacy-1');
  assert.equal(migrated.businessDate, null);
  assert.equal(verifyChain([migrated]).valid, true);
  assert.deepEqual(normalizeLegacyAudit(old, 0, null), migrated);
});

test('A03: foreign-company event cannot join an otherwise valid hash chain', () => {
  const rows = sample();
  rows[1].companyId = 'other-company';
  rows[1].eventHash = auditHash(rows[1]);
  assert.equal(verifyChain(rows).valid, false);
});
test('A03: invalid anchor metadata is rejected', () => {
  assert.equal(verifyChain(sample(), { count: -1, headHash: null }).valid, false);
});
