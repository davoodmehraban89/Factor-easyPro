'use strict';
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const AUDIT_SCRIPT = resolve(__dirname, '..', 'scripts', 'holoo-schema-audit.ps1');
function loadApprovedHolooAudit() {
  if (process.platform !== 'win32') throw new Error('Aram Windows lab audit is required');
  const result = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',AUDIT_SCRIPT,'-Json'], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true
  });
  if (result.error || result.status !== 0 || !result.stdout) throw new Error('Approved Holoo lab audit failed');
  let audit;
  try { audit = JSON.parse(result.stdout); } catch { throw new Error('Invalid Holoo audit JSON'); }
  if (audit?.database !== 'HolooBackup_050808_LAB_20261110' || audit?.complete !== true || audit?.readOnlyAudit !== true || audit?.productionWriteGate?.status !== 'NO-GO' || audit?.productionWriteGate?.productionWritesAuthorized !== false) throw new Error('Untrusted Holoo audit result');
  return audit;
}
module.exports = { loadApprovedHolooAudit };
