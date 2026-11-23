// Pure allocation of a finalized return credit against its referenced original invoice.
// All values are non-negative safe-integer Rials; this helper never writes or moves cash.
function rial(value, label, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new RangeError(`${label} must be a ${positive ? 'positive' : 'non-negative'} safe integer Rial amount`);
  }
  return value;
}

export function previewReturnCreditAllocation({
  originalTotal,
  originalPaidAmount = 0,
  priorCreditApplied = 0,
  returnAmount
} = {}) {
  const gross = rial(originalTotal, 'originalTotal', { positive: true });
  const paid = rial(originalPaidAmount, 'originalPaidAmount');
  const prior = rial(priorCreditApplied, 'priorCreditApplied');
  const returned = rial(returnAmount, 'returnAmount', { positive: true });
  if (paid > gross || prior > gross - paid) {
    throw new RangeError('Original invoice cash paid and prior credit allocations exceed its gross total');
  }
  const originalOpenBefore = gross - paid - prior;
  const allocatedToOriginal = Math.min(returned, originalOpenBefore);
  const originalOpenAfter = originalOpenBefore - allocatedToOriginal;
  const returnCreditRemaining = returned - allocatedToOriginal;
  return Object.freeze({
    originalOpenBefore,
    allocatedToOriginal,
    originalOpenAfter,
    returnCreditRemaining,
    originalTotal: gross,
    originalPaidAmount: paid,
    priorCreditApplied: prior,
    returnAmount: returned
  });
}
