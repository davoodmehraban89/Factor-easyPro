import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../docs/holoo-lab-public-execute-triage.md',import.meta.url));
test('public execute triage documents eight candidates and explicit blockers',()=>{
 const text=readFileSync(path,'utf8');
 for(const name of ['dt_adduserobject','dt_adduserobject_vcs','dt_checkoutobject','dt_droppropertiesbyid','dt_dropuserobjectbyid','dt_isundersourcecontrol','dt_setpropertybyid','dt_setpropertybyid_u']) assert.ok(text.includes(name),name);
 for(const item of ['NO-GO','textual signals','not proof','dbo.dtproperties','No stored procedure executed']) assert.ok(text.includes(item),item);
});
