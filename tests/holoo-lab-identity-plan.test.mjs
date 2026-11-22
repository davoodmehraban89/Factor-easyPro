import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const path=fileURLToPath(new URL('../docs/holoo-lab-readonly-identity-plan.md',import.meta.url));
test('identity rollout remains approval-gated, isolated, and reversible',()=>{
 const plan=readFileSync(path,'utf8');
 for(const required of ['DESIGN ONLY / NO-GO','HolooBackup_050808_LAB_20261110','ARAM\\TNC','Integrated Security','explicit approval','rollback','ARAM\\Davood','same dedicated Windows identity','production write gate NO-GO']) assert.ok(plan.includes(required),required);
 assert.ok(plan.includes('**not** been provisioned or tested'));
});


