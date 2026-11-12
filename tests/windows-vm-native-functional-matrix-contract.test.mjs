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
