[CmdletBinding()]
param([ValidateSet('invoiceCount','lineCount','documentCount')][string]$QueryId)
$ErrorActionPreference='Stop'
if(-not $QueryId){throw 'QueryId is required'}
$preflight=Join-Path $PSScriptRoot 'holoo-direct-sql-readiness.ps1'
$raw=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $preflight -Json
if($LASTEXITCODE -ne 0 -or -not ($raw|ConvertFrom-Json).readyForLabSql){throw 'Approved lab preflight failed'}
$permissionScript=Join-Path $PSScriptRoot 'holoo-sql-permissions-audit.ps1'
$permissionJson=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $permissionScript -Json
if($LASTEXITCODE -ne 0){throw 'SQL least-privilege gate BLOCKED: count query not executed'}
$permission=$permissionJson|ConvertFrom-Json
if($permission.status -ne 'PASS' -or -not $permission.leastPrivilegeReadOnly){throw 'SQL least-privilege gate BLOCKED: count query not executed'}
$queries=@{invoiceCount='SELECT COUNT_BIG(*) FROM dbo.FACTURE';lineCount='SELECT COUNT_BIG(*) FROM dbo.FACTART';documentCount='SELECT COUNT_BIG(*) FROM dbo.SANAD'}
Add-Type -AssemblyName System.Data
$c=New-Object System.Data.SqlClient.SqlConnection('Server=ARAM\TNC;Database=HolooBackup_050808_LAB_20261110;Integrated Security=True;Connection Timeout=5;Application Name=FinoraHolooLabCounts;ApplicationIntent=ReadOnly')
try {$c.Open();$q=$c.CreateCommand();$q.CommandTimeout=15;$q.CommandText=$queries[$QueryId];$value=[long]$q.ExecuteScalar();[pscustomobject]@{database='HolooBackup_050808_LAB_20261110';queryId=$QueryId;count=$value;readOnly=$true}|ConvertTo-Json -Compress} finally {$c.Dispose()}

