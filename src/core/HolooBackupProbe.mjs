// A02: browser-only, read-only ZIP envelope profiler. Never decompress or import.
// Local file bytes and source names are never logged or sent over the network.
const MAX_ARCHIVE_BYTES = 2 * 1024 ** 3;
const MAX_ENTRY_BYTES = 4 * 1024 ** 3 - 1;
const MAX_NAME_BYTES = 255;
const MAX_EOCD_SCAN = 22 + 65535;
const fail = code => { throw new Error(code); };
const LE = (view, offset, n) => n === 2
  ? view.getUint16(offset, true) : view.getUint32(offset, true);

/** Inspect a local ZIP envelope only. Does not attest Holoo, SQL format or ZIP CRC. */
export async function probeHolooBackupZip(file) {
  if (!file || typeof file.size !== 'number' ||
      typeof file.slice !== 'function' || !Number.isSafeInteger(file.size)) {
    throw new TypeError('HOLOO_FILE_REQUIRED');
  }
  if (file.size < 52) fail('HOLOO_ZIP_TOO_SMALL');
  if (file.size > MAX_ARCHIVE_BYTES) fail('HOLOO_ZIP_TOO_LARGE');
  const bytes = file.size;
  const prefix = new DataView(await file.slice(0, 30).arrayBuffer());
  if (LE(prefix, 0, 4) !== 0x04034b50) fail('HOLOO_NOT_ZIP');
  const flags = LE(prefix, 6, 2);
  if ((flags & 1) || (flags & 0x40)) fail('HOLOO_ENCRYPTED_ZIP');
  const method = LE(prefix, 8, 2);
  if (method !== 0 && method !== 8) fail('HOLOO_ZIP_METHOD_UNSUPPORTED');
  const nameLength = LE(prefix, 26, 2);
  const extraLength = LE(prefix, 28, 2);
  if (!nameLength || nameLength > MAX_NAME_BYTES ||
      30 + nameLength + extraLength >= bytes) fail('HOLOO_ZIP_INVALID_ENTRY');

  const trailerStart = Math.max(0, bytes - MAX_EOCD_SCAN);
  const trailer = new DataView(await file.slice(trailerStart).arrayBuffer());
  let eocd = -1;
  for (let pos = trailer.byteLength - 22; pos >= 0; pos--) {
    if (LE(trailer, pos, 4) === 0x06054b50 &&
        pos + 22 + LE(trailer, pos + 20, 2) === trailer.byteLength) {
      eocd = pos;
      break;
    }
  }
  if (eocd < 0) fail('HOLOO_ZIP_MISSING_END');
  if (LE(trailer, eocd + 4, 2) !== 0 || LE(trailer, eocd + 6, 2) !== 0 ||
      LE(trailer, eocd + 8, 2) !== 1 || LE(trailer, eocd + 10, 2) !== 1) {
    fail('HOLOO_ZIP_SINGLE_ENTRY_REQUIRED');
  }
  const directorySize = LE(trailer, eocd + 12, 4);
  const directoryOffset = LE(trailer, eocd + 16, 4);
  const directoryEnd = trailerStart + eocd;
  if (directoryOffset === 0xffffffff || directorySize === 0xffffffff ||
      directorySize < 46 || directoryOffset + directorySize !== directoryEnd) {
    fail('HOLOO_ZIP_CENTRAL_DIRECTORY_INVALID');
  }
  const central = new DataView(await file.slice(directoryOffset, directoryOffset + 46).arrayBuffer());
  if (central.byteLength !== 46 || LE(central, 0, 4) !== 0x02014b50 ||
      LE(central, 28, 2) !== nameLength ||
      LE(central, 42, 4) !== 0 || LE(central, 10, 2) !== method ||
      LE(central, 8, 2) !== flags) fail('HOLOO_ZIP_CENTRAL_DIRECTORY_INVALID');
  const compressedSize = LE(central, 20, 4);
  const uncompressedSize = LE(central, 24, 4);
  if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff ||
      uncompressedSize > MAX_ENTRY_BYTES || compressedSize > bytes ||
      30 + nameLength + extraLength + compressedSize > directoryOffset) {
    fail('HOLOO_ZIP_INVALID_SIZES');
  }
  const nameBytes = new Uint8Array(await file.slice(30, 30 + nameLength).arrayBuffer());
  const centralName = new Uint8Array(await file.slice(directoryOffset + 46, directoryOffset + 46 + nameLength).arrayBuffer());
  if (centralName.length !== nameLength || nameBytes.some((b, i) => b !== centralName[i])) {
    fail('HOLOO_ZIP_ENTRY_MISMATCH');
  }
  let entryName;
  try { entryName = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes); }
  catch { fail('HOLOO_ZIP_FILENAME_ENCODING'); }
  if (!entryName || entryName.includes('/') || entryName.includes('\\') ||
      entryName.includes(':') || entryName.includes('..') ||
      /[\u0000-\u001f]/.test(entryName)) fail('HOLOO_ZIP_UNSAFE_ENTRY_NAME');
  if (LE(central, 32, 2) !== 0 || LE(central, 30, 2) !== extraLength) {
    // Reject ambiguous central metadata rather than implying it was verified.
    fail('HOLOO_ZIP_CENTRAL_DIRECTORY_INVALID');
  }
  return Object.freeze({
    kind: 'single-entry-zip', entryName, compressedSize, uncompressedSize,
    archiveSize: bytes, method: method === 8 ? 'deflate' : 'stored',
    zipEnvelopeIdentified: true, crcVerified: false, sqlBackupVerified: false,
    migrationSupported: false, canCommit: false, writePerformed: false
  });
}
