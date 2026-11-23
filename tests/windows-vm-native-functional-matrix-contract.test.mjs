import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('A05 cheque approval compares against a journal baseline taken after the valid transfer',()=>{
 const source=readFileSync(new URL('./windows-vm-native-functional-matrix.cjs',import.meta.url),'utf8');
 const scenario=source.indexOf('async function nativeInactiveBankSettlementGuard');
 const transfer=source.lastIndexOf("await tv._saveTransaction('transfer');");
 const approval=source.indexOf('const journalCountBeforeApproval=',transfer);
 const apply=source.indexOf('await cv._applyStatusChange(cheque.id);',approval);
 const check=source.indexOf("'Cheque cleared before approval'",apply);
 assert.ok(scenario>=0&&transfer>scenario&&approval>transfer&&apply>approval&&check>apply,
   'Cheque approval journal baseline must be captured after the valid transfer and before confirmation');
 assert.match(source.slice(approval,check),/journalCountBeforeApproval/);
 assert.match(source.slice(approval,check),/chequeSettlementsBeforeApproval/);
 assert.doesNotMatch(source.slice(apply,check),/length===journalCount\)/,
   'Cheque approval must not compare against the pre-transfer journal count');
});

test('native matrix dismisses stale global toasts only between completed scenarios',async()=>{
 const {createRequire}=await import('node:module');
 const require=createRequire(import.meta.url);
 const matrix=require('./windows-vm-native-functional-matrix.cjs');
 const expressions=[];
 const cdp={evaluate:async expression=>{
   expressions.push(expression);
   if(expression.startsWith('(() => {'))return undefined;
   return {verified:true};
 }};
 const result=await matrix(cdp);
 const phases=Object.keys(result);
 assert.equal(phases.length,24);
 assert.equal(expressions.length,phases.length*2);
 for(let i=0;i<expressions.length;i+=2){
   assert.match(expressions[i],/\.toast-error, \.toast-warning/);
   assert.match(expressions[i],/\.toast-close/);
   assert.doesNotMatch(expressions[i],/\.modal-backdrop|FINORA\.Storage/);
   assert.match(expressions[i+1],/^\(async function /);
 }
});
