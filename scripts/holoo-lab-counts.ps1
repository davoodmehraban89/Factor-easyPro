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
try {
 $c.Open()
 $q=$c.CreateCommand();$q.CommandTimeout=15
 # Recheck effective privileges on the SAME connection that will run the count.
 $q.CommandText="SELECT DB_NAME(),IS_MEMBER('db_owner'),HAS_PERMS_BY_NAME('dbo.FACTURE','OBJECT','SELECT'),HAS_PERMS_BY_NAME('dbo.FACTURE','OBJECT','INSERT'),HAS_PERMS_BY_NAME('dbo.FACTURE','OBJECT','UPDATE'),HAS_PERMS_BY_NAME('dbo.FACTURE','OBJECT','DELETE'),HAS_PERMS_BY_NAME('dbo.FACTART','OBJECT','SELECT'),HAS_PERMS_BY_NAME('dbo.FACTART','OBJECT','INSERT'),HAS_PERMS_BY_NAME('dbo.FACTART','OBJECT','UPDATE'),HAS_PERMS_BY_NAME('dbo.FACTART','OBJECT','DELETE'),HAS_PERMS_BY_NAME('dbo.SANAD','OBJECT','SELECT'),HAS_PERMS_BY_NAME('dbo.SANAD','OBJECT','INSERT'),HAS_PERMS_BY_NAME('dbo.SANAD','OBJECT','UPDATE'),HAS_PERMS_BY_NAME('dbo.SANAD','OBJECT','DELETE'),IS_MEMBER('db_datawriter'),IS_MEMBER('db_ddladmin'),IS_SRVROLEMEMBER('sysadmin'),HAS_PERMS_BY_NAME(NULL,NULL,'CONTROL SERVER')"
 $r=$q.ExecuteReader()
 try {
  if(-not $r.Read()){throw 'SQL same-connection privilege gate BLOCKED'}
  if($r.GetString(0) -ne 'HolooBackup_050808_LAB_20261110'){throw 'SQL same-connection database gate BLOCKED'}
  foreach($i in @(1,3,4,5,7,8,9,11,12,13,14,15,16,17)){if($r.IsDBNull($i) -or $r.GetInt32($i) -ne 0){throw 'SQL same-connection privilege gate BLOCKED'}}
  foreach($i in @(2,6,10)){if($r.IsDBNull($i) -or $r.GetInt32($i) -ne 1){throw 'SQL same-connection SELECT gate BLOCKED'}}
 } finally {$r.Close()}
 # Defense in depth: inherited public EXECUTE and persistent DML grants are not database-wide read-only.
 # The earlier separate-connection audit is deliberately BLOCKED; this protects against future accidental relaxation.
 $q.CommandText="SELECT COUNT_BIG(*) FROM sys.database_permissions WHERE grantee_principal_id=DATABASE_PRINCIPAL_ID('public') AND state_desc IN ('GRANT','GRANT_WITH_GRANT_OPTION') AND ((permission_name='EXECUTE') OR (permission_name IN ('INSERT','UPDATE','DELETE','ALTER','CONTROL','TAKE OWNERSHIP')))"
 $publicRisks=[long]$q.ExecuteScalar()
 if($publicRisks -ne 0){throw 'SQL same-connection inherited public privilege gate BLOCKED'}
 # Reject effective mutation paths even if catalog visibility or public-grant inventory changes.
 $q.CommandText="SELECT HAS_PERMS_BY_NAME('dbo.dtproperties','OBJECT','INSERT'),HAS_PERMS_BY_NAME('dbo.dtproperties','OBJECT','UPDATE'),HAS_PERMS_BY_NAME('dbo.dtproperties','OBJECT','DELETE'),HAS_PERMS_BY_NAME('dbo.dt_setpropertybyid','OBJECT','EXECUTE')"
 $er=$q.ExecuteReader()
 try {
  if(-not $er.Read()){throw 'SQL effective mutation-path gate BLOCKED'}
  foreach($i in 0..3){if($er.IsDBNull($i) -or $er.GetInt32($i) -ne 0){throw 'SQL effective mutation-path gate BLOCKED'}}
 }finally{$er.Close()}
 $q.CommandText=$queries[$QueryId]
 $value=[long]$q.ExecuteScalar()
 [pscustomobject]@{database='HolooBackup_050808_LAB_20261110';queryId=$QueryId;count=$value;readOnly=$true}|ConvertTo-Json -Compress
} finally {$c.Dispose()}
