import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../docs/holoo-lab-public-execute-body-review.md',import.meta.url));
test('body review records six persistent DML procedures and two external-call cases',()=>{
 const s=readFileSync(file,'utf8');
 for(const n of ['dt_adduserobject','dt_adduserobject_vcs','dt_droppropertiesbyid','dt_dropuserobjectbyid','dt_setpropertybyid','dt_setpropertybyid_u','dt_checkoutobject','dt_isundersourcecontrol','sp_OACreate','NO-GO']) assert.ok(s.includes(n),n);
 assert.match(s,/No procedure was invoked/);
});
