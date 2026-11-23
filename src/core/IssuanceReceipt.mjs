export const receiptKey = (companyId, invoiceId) =>
  'issuance_receipt_' + JSON.stringify([companyId, invoiceId]);
export const counterKey = 'issuance_global_counter_v1';
export const idempotencyRecordKey = (companyId, key) =>
  'issuance_idempotency_' + JSON.stringify([companyId, key]);

export async function createTreasuryRetryIdentity(signature, storageService,
  makeId = () => globalThis.crypto.randomUUID()) {
  if (typeof signature !== 'string' || !signature.length || signature.length > 32768)
    throw Error('Invalid treasury retry signature');
  if (!storageService || typeof storageService.transaction !== 'function')
    throw Error('Durable treasury retry storage is unavailable');
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(signature)
  );
  const signatureHash = Array.from(new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, '0')).join('');
  const storageKey = 'treasury_retry_v1:' + signatureHash;
  return storageService.transaction('settings', async tx => {
    const pending = await tx.get('settings', storageKey);
    if (pending) {
      if (pending.signatureHash !== signatureHash ||
          typeof pending.idempotencyKey !== 'string' ||
          pending.idempotencyKey.length < 16 || pending.idempotencyKey.length > 256)
        throw Error('Corrupt treasury retry identity; posting is blocked');
      return { storageKey, idempotencyKey: pending.idempotencyKey };
    }
    const idempotencyKey = makeId();
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 256)
      throw Error('Invalid treasury idempotency key');
    await tx.put('settings', {
      id: storageKey, signatureHash, idempotencyKey,
      recordType: 'treasury_retry_pending', schemaVersion: 1
    });
    return { storageKey, idempotencyKey };
  });
}

export async function clearTreasuryRetryIdentity(storageService, identity) {
  if (!storageService || typeof storageService.transaction !== 'function' ||
      !identity?.storageKey || typeof identity.idempotencyKey !== 'string')
    throw Error('Invalid treasury retry cleanup identity');
  return storageService.transaction('settings', async tx => {
    const pending = await tx.get('settings', identity.storageKey);
    if (!pending || pending.idempotencyKey !== identity.idempotencyKey) return false;
    await tx.delete('settings', identity.storageKey);
    return true;
  });
}
export async function createRetryStorageKey(signature) {
  if (typeof signature !== 'string' || !signature.length)
    throw Error('Invalid retry signature');
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(signature)
  );
  const hex = Array.from(new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, '0')).join('');
  return 'factor_easypro_pending_invoice_v2:' + hex;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = canonical(value[key]);
    }
    return result;
  }
  if (typeof value === 'number' && !Number.isFinite(value))
    throw Error('Invalid non-finite value in issuance request');
  return value;
}

export async function createIssuanceIdentity(invoice, idempotencyKey) {
  if (!invoice?.companyId || typeof idempotencyKey !== 'string' ||
      idempotencyKey.length < 16 || idempotencyKey.length > 256)
    throw Error('Invalid issuance idempotency identity');
  const payload = {
    companyId: invoice.companyId,
    kind: invoice.kind,
    isPreInvoice: false,
    requestedNumber: invoice.requestedNumber ?? null,
    date: invoice.date ?? null,
    contactId: invoice.contactId ?? null,
    contactName: invoice.contactName ?? '',
    items: invoice.items ?? [],
    subtotal: invoice.subtotal,
    totalDiscount: invoice.totalDiscount,
    discountType: invoice.discountType,
    discountInput: invoice.discountInput,
    vatEnabled: invoice.vatEnabled,
    vatRate: invoice.vatRate,
    vatAmount: invoice.vatAmount,
    grandTotal: invoice.grandTotal,
    paymentMethod: invoice.paymentMethod,
    paidAmount: invoice.requestedPaidAmount ?? invoice.paidAmount ?? 0,
    originalInvoiceId: invoice.originalInvoiceId ?? null,
    warehouseId: Object.hasOwn(invoice, 'requestedWarehouseId') ? invoice.requestedWarehouseId : (invoice.warehouseId ?? null),
    description: invoice.description ?? ''
  };
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(payload)));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const requestHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return { idempotencyKey, requestHash, requestedPaidAmount: invoice.requestedPaidAmount ?? invoice.paidAmount ?? 0, requestedWarehouseId: Object.hasOwn(invoice, 'requestedWarehouseId') ? invoice.requestedWarehouseId : (invoice.warehouseId ?? null) };
}

export async function findIdempotentInvoice(tx, invoice) {
  const key = invoice?.idempotencyKey;
  if (!key) return null;
  const record = await tx.get('settings', idempotencyRecordKey(invoice.companyId, key));
  if (!record) return null;
  if (record.companyId !== invoice.companyId || record.requestHash !== invoice.requestHash)
    throw Error('Idempotency key reused with different invoice content');
  const previous = await tx.get('invoices', record.invoiceId);
  if (!previous || previous.companyId !== invoice.companyId)
    throw Error('Idempotency record exists without its invoice; issuance is blocked for safe recovery');
  return previous;
}

export async function recordIssuanceReceipt(tx, invoice, quota) {
  if (!invoice?.id || !invoice?.companyId || invoice.isPreInvoice)
    throw Error('Invalid issuance receipt');
  if (typeof invoice.idempotencyKey !== 'string' ||
      invoice.idempotencyKey.length < 16 || invoice.idempotencyKey.length > 256 ||
      typeof invoice.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(invoice.requestHash))
    throw Error('A durable idempotency key and request fingerprint are mandatory');
  const id = receiptKey(invoice.companyId, invoice.id);
  if (await tx.get('settings', id)) throw Error('Duplicate issuance receipt');
  const key = idempotencyRecordKey(invoice.companyId, invoice.idempotencyKey);
  if (await tx.get('settings', key)) throw Error('Duplicate issuance idempotency record');
  if (!quota || !Number.isSafeInteger(quota.floor) || quota.floor < 0 ||
      !Number.isSafeInteger(quota.limit) || quota.limit < 1)
    throw Error('A valid issuance quota is mandatory');
  const previous = await tx.get('settings', counterKey);
  const persisted = previous?.count;
  if (previous && (!Number.isSafeInteger(persisted) || persisted < 0))
    throw Error('Corrupt issuance counter');
  const current = Math.max(persisted ?? 0, quota.floor);
  if (current >= quota.limit) throw Error('Invoice quota exhausted');
  await tx.put('settings', {
    id: counterKey, count: current + 1, schemaVersion: 1
  });
  await tx.put('settings', {
    id, companyId: invoice.companyId, invoiceId: invoice.id,
    number: String(invoice.number), kind: invoice.kind, schemaVersion: 1
  });
  if (invoice.idempotencyKey) {
    await tx.put('settings', {
      id: idempotencyRecordKey(invoice.companyId, invoice.idempotencyKey),
      companyId: invoice.companyId, idempotencyKey: invoice.idempotencyKey,
      requestHash: invoice.requestHash, invoiceId: invoice.id, schemaVersion: 1
    });
  }
}
