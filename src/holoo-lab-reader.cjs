'use strict';
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { createHolooLabReader } = require('./holoo-query-boundary.cjs');
const { loadApprovedHolooAudit } = require('./holoo-audit-loader.cjs');
const script = resolve(__dirname, '..', 'scripts', 'holoo-lab-counts.ps1');
const queryIds = new Map([
 ['SELECT COUNT_BIG(*) AS count FROM dbo.FACTURE','invoiceCount'],
 ['SELECT COUNT_BIG(*) AS count FROM dbo.FACTART','lineCount'],
 ['SELECT COUNT_BIG(*) AS count FROM dbo.SANAD','documentCount']
]);
function executeApprovedCount({ database, sql, readOnly }) {
  if (process.platform !== 'win32' || database !== 'HolooBackup_050808_LAB_20261110' || readOnly !== true || !queryIds.has(sql)) throw new Error('Rejected SQL execution');
  const queryId = queryIds.get(sql);
  const result = spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-QueryId',queryId],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,windowsHide:true});
  if (result.error || result.status !== 0) throw new Error('Approved lab count query failed');
  let data;
  try { data = JSON.parse(result.stdout); } catch { throw new Error('Invalid lab count response'); }
  if (data.database !== database || data.queryId !== queryId || data.readOnly !== true || !Number.isSafeInteger(data.count) || data.count < 0) throw new Error('Invalid lab count evidence');
  return data.count;
}
const readApprovedLabCount = createHolooLabReader({loadAudit:loadApprovedHolooAudit,executor:executeApprovedCount});
module.exports = { readApprovedLabCount };
