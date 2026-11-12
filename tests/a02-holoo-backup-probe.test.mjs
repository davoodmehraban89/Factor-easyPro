import test from 'node:test';
import assert from 'node:assert/strict';
import { probeHolooBackupZip } from '../src/core/HolooBackupProbe.mjs';

function zip({ name = 'Holoo1', flag = 0, method = 0, entries = 1, comment = '', payload = 'FAKE', corruptCentralName = false } = {}) {
  const bytes = new TextEncoder();
  const filename = bytes.encode(name);
  const data = bytes.encode(payload);
  const commentBytes = bytes.encode(comment);
  const local = new Uint8Array(30 + filename.length + data.length);
  const l = new DataView(local.buffer);
  l.setUint32(0, 0x04034b50, true);
  l.setUint16(4, 20, true);
  l.setUint16(6, flag, true);
  l.setUint16(8, method, true);
  l.setUint32(18, data.length, true);
  l.setUint32(22, data.length, true);
  l.setUint16(26, filename.length, true);
  local.set(filename, 30);
  local.set(data, 30 + filename.length);
  const central = new Uint8Array(46 + filename.length);
  const c = new DataView(central.buffer);
  c.setUint32(0, 0x02014b50, true);
  c.setUint16(4, 20, true);
  c.setUint16(6, 20, true);
  c.setUint16(8, flag, true);
  c.setUint16(10, method, true);
  c.setUint32(20, data.length, true);
  c.setUint32(24, data.length, true);
  c.setUint16(28, filename.length, true);
  central.set(filename, 46);
  if (corruptCentralName) central[46] ^= 1;
  const end = new Uint8Array(22 + commentBytes.length);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries, true);
  e.setUint16(10, entries, true);
  e.setUint32(12, central.length, true);
  e.setUint32(16, local.length, true);
  e.setUint16(20, commentBytes.length, true);
  end.set(commentBytes, 22);
  return new Blob([local, central, end]);
}

test('recognized one-entry ZIP without unpacking or importing records', async () => {
  const blob = zip();
  const result = await probeHolooBackupZip(blob);
  assert.equal(result.entryName, 'Holoo1');
  assert.equal(result.zipEnvelopeIdentified, true);
  assert.equal(result.uncompressedSize, 4);
  assert.equal(result.sqlBackupVerified, false);
  assert.equal(result.crcVerified, false);
  assert.equal(result.migrationSupported, false);
  assert.equal(result.canCommit, false);
  assert.equal(result.writePerformed, false);
  assert.equal(blob.size, 114);
});

test('supports trailing ZIP comments without false negative', async () => {
  assert.equal((await probeHolooBackupZip(zip({ comment: 'zip-note' }))).entryName, 'Holoo1');
});

test('rejects invalid source, magic, encryption, multiple entries and unsafe names', async () => {
  const invalid = [null, {}, new Blob(), new Blob(['BADZIP'.repeat(12)]),
    zip({ flag: 1 }), zip({ entries: 2 }), zip({ name: '../secret' }),
    zip({ name: 'C:evil' }), zip({ corruptCentralName: true }), zip({ method: 9 })];
  for (const candidate of invalid) {
    await assert.rejects(probeHolooBackupZip(candidate));
  }
});

test('rejects damaged end-of-archive, unsupported sizes, and malicious oversized inputs', async () => {
  const original = new Uint8Array(await zip().arrayBuffer());
  const copy = new Uint8Array(original);
  copy[copy.length - 22] ^= 1;
  await assert.rejects(probeHolooBackupZip(new Blob([copy])), /HOLOO_ZIP_MISSING_END/);
  const oversized = { size: 3 * 1024 ** 3, slice() { throw Error('should not read'); } };
  await assert.rejects(probeHolooBackupZip(oversized), /HOLOO_ZIP_TOO_LARGE/);
});

test('reads only bounded ZIP headers and never reads a payload', async () => {
  const blob = zip({payload:'PRIVATE'});
  const accesses = [];
  const bounded = {
    size: blob.size,
    slice(start, end) {
      accesses.push([start, end ?? blob.size]);
      return blob.slice(start, end);
    }
  };
  await probeHolooBackupZip(bounded);
  assert.ok(accesses.every(([start, end]) => end - start <= 65557));
  assert.equal(accesses.length, 5);
});
