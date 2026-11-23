import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file=fileURLToPath(new URL('../docs/holoo-lab-public-grants-findings.md',import.meta.url));
test('public grants findings preserve write risk and no-go',()=>{
 const text=readFileSync(file,'utf8');
 for(const phrase of ['NO-GO','dbo.dtproperties','31 `GRANT EXECUTE`','not necessarily database-wide read-only','No SQL principal']) assert.ok(text.includes(phrase),phrase);
});
