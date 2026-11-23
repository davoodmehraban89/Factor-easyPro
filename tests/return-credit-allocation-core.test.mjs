import test from 'node:test';
import assert from 'node:assert/strict';
import { previewReturnCreditAllocation } from '../src/core/ReturnCreditAllocationCore.mjs';

test('return credit first offsets open original balance and leaves only excess as refundable credit',()=>{
  assert.deepEqual(previewReturnCreditAllocation({
    originalTotal:1_000_000,originalPaidAmount:700_000,priorCreditApplied:0,returnAmount:400_000
  }),{
    originalOpenBefore:300_000,allocatedToOriginal:300_000,originalOpenAfter:0,
    returnCreditRemaining:100_000,originalTotal:1_000_000,originalPaidAmount:700_000,
    priorCreditApplied:0,returnAmount:400_000
  });
});

test('unpaid original invoice absorbs the entire return credit without a cash refund',()=>{
  const result=previewReturnCreditAllocation({
    originalTotal:1_000_000,originalPaidAmount:0,returnAmount:400_000
  });
  assert.equal(result.allocatedToOriginal,400_000);
  assert.equal(result.originalOpenAfter,600_000);
  assert.equal(result.returnCreditRemaining,0);
});

test('fully paid original invoice leaves the full return as cash-recoverable credit',()=>{
  const result=previewReturnCreditAllocation({
    originalTotal:1_000_000,originalPaidAmount:1_000_000,returnAmount:400_000
  });
  assert.equal(result.allocatedToOriginal,0);
  assert.equal(result.originalOpenAfter,0);
  assert.equal(result.returnCreditRemaining,400_000);
});

test('multiple return allocations consume the original open amount once and conserve value',()=>{
  const first=previewReturnCreditAllocation({
    originalTotal:1_000_000,originalPaidAmount:700_000,returnAmount:200_000
  });
  const second=previewReturnCreditAllocation({
    originalTotal:1_000_000,originalPaidAmount:700_000,
    priorCreditApplied:first.allocatedToOriginal,returnAmount:200_000
  });
  assert.equal(first.allocatedToOriginal+second.allocatedToOriginal,300_000);
  assert.equal(second.originalOpenAfter,0);
  assert.equal(first.returnCreditRemaining+second.returnCreditRemaining,100_000);
});

test('unsafe, negative and over-allocated source amounts are rejected',()=>{
  for(const args of [
    {originalTotal:0,returnAmount:1},
    {originalTotal:10,originalPaidAmount:-1,returnAmount:1},
    {originalTotal:10,originalPaidAmount:8,priorCreditApplied:3,returnAmount:1},
    {originalTotal:10,returnAmount:Number.MAX_SAFE_INTEGER+1},
    {originalTotal:10,returnAmount:0}
  ]) assert.throws(()=>previewReturnCreditAllocation(args));
});
