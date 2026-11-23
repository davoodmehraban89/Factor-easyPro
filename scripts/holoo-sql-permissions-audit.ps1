[CmdletBinding()]
param([switch]$Json)
$ErrorActionPreference='Stop'
$preflight=Join-Path $PSScriptRoot 'holoo-direct-sql-readiness.ps1'
$raw=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $preflight -Json
if($LASTEXITCODE -ne 0 -or -not ($raw|ConvertFrom-Json).readyForLabSql){throw 'Approved lab preflight failed'}
Add-Type -AssemblyName System.Data
$c=New-Object System.Data.SqlClient.SqlConnection('Server=ARAM\TNC;Database=HolooBackup_050808_LAB_20261110;Integrated Security=True;Connection Timeout=5;Application Name=FinoraHolooPermissionAudit')
try {
 $c.Open();$q=$c.CreateCommand();$q.CommandTimeout=15
 $q.CommandText="SELECT SYSTEM_USER AS login_name,USER_NAME() AS database_user,IS_MEMBER('db_owner') AS db_owner,HAS_PERMS_BY_NAME('dbo.FACTURE','OBJECT','SELECT') AS can_select,HAS_PERMS_BY_NAME('dbo.FACTURE','OBJECT','INSERT') AS can_insert,HAS_PERMS_BY_NAME('dbo.FACTURE','OBJECT','UPDATE') AS can_update,HAS_PERMS_BY_NAME('dbo.FACTURE','OBJECT','DELETE') AS can_delete,IS_SRVROLEMEMBER('sysadmin') AS sysadmin,HAS_PERMS_BY_NAME(NULL,NULL,'CONTROL SERVER') AS control_server"
 $r=$q.ExecuteReader()
 try {
  if(-not $r.Read()){throw 'No SQL permissions evidence'}
  $owner=($r.GetValue(2) -eq 1);$sel=($r.GetValue(3) -eq 1);$ins=($r.GetValue(4) -eq 1);$upd=($r.GetValue(5) -eq 1);$del=($r.GetValue(6) -eq 1);$sysadmin=($r.GetValue(7) -eq 1);$controlServer=($r.GetValue(8) -eq 1)
  # A table-only permission check is insufficient: inherited public DML/EXECUTE is a blocker.
  $publicRisk=$true
  $result=[pscustomobject]@{database='HolooBackup_050808_LAB_20261110';login=$r.GetString(0);databaseUser=$r.GetString(1);dbOwner=$owner;canSelect=$sel;canInsert=$ins;canUpdate=$upd;canDelete=$del;sysadmin=$sysadmin;controlServer=$controlServer;leastPrivilegeReadOnly=$false;tableScopeSelectOnly=($sel -and -not ($owner -or $ins -or $upd -or $del -or $sysadmin -or $controlServer));publicPrivilegeReviewRequired=$publicRisk;status='BLOCKED';note='Fail closed: FACTURE-only permissions cannot prove database-wide read-only; inherited public DML and EXECUTE grants require review'}
 } finally {$r.Close()}
 # Same-session read-only evidence for public grants and effective permissions.
 $q.CommandText="SELECT COUNT_BIG(*) FROM sys.database_permissions WHERE grantee_principal_id=DATABASE_PRINCIPAL_ID('public') AND state_desc IN ('GRANT','GRANT_WITH_GRANT_OPTION') AND permission_name='EXECUTE'"
 $result | Add-Member -NotePropertyName publicExecuteGrants -NotePropertyValue ([long]$q.ExecuteScalar())
 $q.CommandText="SELECT COUNT_BIG(*) FROM sys.database_permissions WHERE grantee_principal_id=DATABASE_PRINCIPAL_ID('public') AND state_desc IN ('GRANT','GRANT_WITH_GRANT_OPTION') AND permission_name IN ('INSERT','UPDATE','DELETE')"
 $result | Add-Member -NotePropertyName publicDmlGrants -NotePropertyValue ([long]$q.ExecuteScalar())
 $q.CommandText="SELECT HAS_PERMS_BY_NAME('dbo.dtproperties','OBJECT','INSERT'),HAS_PERMS_BY_NAME('dbo.dtproperties','OBJECT','UPDATE'),HAS_PERMS_BY_NAME('dbo.dtproperties','OBJECT','DELETE'),HAS_PERMS_BY_NAME('dbo.dt_setpropertybyid','OBJECT','EXECUTE')"
 $er=$q.ExecuteReader()
 try {
  if(-not $er.Read()){throw 'No effective permissions evidence'}
  $values=@();foreach($i in 0..3){$values+= $(if($er.IsDBNull($i)){$null}else{[int]$er.GetValue($i)})}
  $result | Add-Member -NotePropertyName effectiveDtpropertiesDml -NotePropertyValue @($values[0..2])
  $result | Add-Member -NotePropertyName effectiveSetPropertyExecute -NotePropertyValue $values[3]
 }finally{$er.Close()}
 if($Json){$result|ConvertTo-Json -Compress}else{$result|Format-List}
 if($result.status -ne 'PASS'){exit 2}
} finally {$c.Dispose()}





