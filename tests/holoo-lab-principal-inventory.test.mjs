import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const script=fileURLToPath(new URL('../scripts/holoo-lab-principal-inventory.ps1',import.meta.url));
test('principal inventory uses fixed LAB and metadata SELECT only',()=>{
 const source=readFileSync(script,'utf8');
 assert.match(source,/HolooBackup_050808_LAB_20261110/);
 for(const table of ['sys.database_role_members','sys.database_permissions','sys.database_principals','sys.server_role_members']) assert.ok(source.includes(table));
 assert.doesNotMatch(source,/\b(?:CREATE\s+LOGIN|CREATE\s+USER|GRANT\s+|REVOKE\s+|DENY\s+|DROP\s+|ALTER\s+ROLE|INSERT\s+INTO|DELETE\s+FROM)\b/i);
});
test('live LAB principal inventory is read-only and scoped', {skip:process.platform!=='win32'||process.env.HOLOO_SQL_INTEGRATION!=='1'},()=>{
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Json'],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
 assert.equal(result.status,0,result.stderr);
 const inventory=JSON.parse(result.stdout);
 assert.equal(inventory.identity.database_name,'HolooBackup_050808_LAB_20261110');
 assert.equal(inventory.readOnlyInventory,true);
 assert.equal(inventory.productionWriteGate,'NO-GO');
 for(const key of ['databasePrincipals','databaseRoleMemberships','databasePermissions','serverRoleMemberships']) assert.ok(Array.isArray(inventory[key]),key);
});
