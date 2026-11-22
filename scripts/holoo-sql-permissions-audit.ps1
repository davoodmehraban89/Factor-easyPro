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
  $result=[pscustomobject]@{database='HolooBackup_050808_LAB_20261110';login=$r.GetString(0);databaseUser=$r.GetString(1);dbOwner=$owner;canSelect=$sel;canInsert=$ins;canUpdate=$upd;canDelete=$del;sysadmin=$sysadmin;controlServer=$controlServer;leastPrivilegeReadOnly=($sel -and -not ($owner -or $ins -or $upd -or $del -or $sysadmin -or $controlServer));status=$(if($sel -and -not ($owner -or $ins -or $upd -or $del -or $sysadmin -or $controlServer)){'PASS'}else{'BLOCKED'});note='ApplicationIntent=ReadOnly is not a SQL permission boundary; effective object permissions checked without writes'}
 } finally {$r.Close()}
 if($Json){$result|ConvertTo-Json -Compress}else{$result|Format-List}
 if($result.status -ne 'PASS'){exit 2}
} finally {$c.Dispose()}

