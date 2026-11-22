import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const script=fileURLToPath(new URL('../scripts/holoo-sql-permissions-audit.ps1',import.meta.url));
test('permission audit has fixed lab target and read-only SQL',()=>{
 const source=readFileSync(script,'utf8');
 assert.match(source,/HolooBackup_050808_LAB_20261110/);
 assert.match(source,/HAS_PERMS_BY_NAME/);
 assert.doesNotMatch(source,/\b(?:GRANT|REVOKE|DENY|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|ALTER\s+ROLE)\b/i);
});
test('real Aram SQL login must not be mistaken for read-only', {skip:process.platform!=='win32'||process.env.HOLOO_SQL_INTEGRATION!=='1'},()=>{
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Json'],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,2,result.stderr);
 const audit=JSON.parse(result.stdout);
 assert.equal(audit.status,'BLOCKED');
 assert.equal(audit.leastPrivilegeReadOnly,false);
 assert.equal(audit.dbOwner,true);
});
