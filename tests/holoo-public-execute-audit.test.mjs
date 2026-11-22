import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=fileURLToPath(new URL('../scripts/holoo-public-execute-audit.ps1',import.meta.url));
test('public execute audit is scoped to catalog SELECT and conservative',()=>{
 const s=readFileSync(script,'utf8');
 assert.match(s,/HolooBackup_050808_LAB_20261110/);
 assert.match(s,/sys\.sql_modules/);
 assert.match(s,/requiresManualReview=\$true/);
 assert.doesNotMatch(s,/\b(?:CREATE\s+LOGIN|GRANT\s+EXECUTE|REVOKE\s+|DROP\s+USER|INSERT\s+INTO|DELETE\s+FROM)\b/i);
});
test('real lab public EXECUTE inventory stays NO-GO', {skip:process.platform!=='win32'||process.env.HOLOO_SQL_INTEGRATION!=='1'},()=>{
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Json'],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
 assert.equal(r.status,0,r.stderr);
 const audit=JSON.parse(r.stdout);
 assert.equal(audit.database,'HolooBackup_050808_LAB_20261110');
 assert.equal(audit.grantCount,31);
 assert.equal(audit.status,'NO-GO');
 assert.ok(Array.isArray(audit.dependencyEdges));
 assert.ok(audit.objects.every(x=>x.requiresManualReview===true));
});

