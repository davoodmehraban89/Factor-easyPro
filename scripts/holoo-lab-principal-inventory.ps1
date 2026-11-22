[CmdletBinding()]
param([switch]$Json)
$ErrorActionPreference='Stop'
$preflight=Join-Path $PSScriptRoot 'holoo-direct-sql-readiness.ps1'
$raw=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $preflight -Json
if($LASTEXITCODE -ne 0 -or -not ($raw|ConvertFrom-Json).readyForLabSql){throw 'Approved LAB preflight failed'}
Add-Type -AssemblyName System.Data
$c=New-Object System.Data.SqlClient.SqlConnection('Server=ARAM\TNC;Database=HolooBackup_050808_LAB_20261110;Integrated Security=True;Connection Timeout=5;Application Name=FinoraHolooPrincipalInventory')
function Get-Rows($Connection,$Sql){
 $q=$Connection.CreateCommand();$q.CommandText=$Sql;$q.CommandTimeout=15
 $r=$q.ExecuteReader();$rows=@()
 try {while($r.Read()){$item=@{};for($i=0;$i -lt $r.FieldCount;$i++){$item[$r.GetName($i)]=if($r.IsDBNull($i)){$null}else{$r.GetValue($i)}};$rows+= [pscustomobject]$item}}finally{$r.Close();$q.Dispose()}
 return ,$rows
}
try {
 $c.Open()
 $identity=Get-Rows $c 'SELECT DB_NAME() AS database_name,SYSTEM_USER AS login_name,USER_NAME() AS database_user'
 if($identity.Count -ne 1 -or $identity[0].database_name -ne 'HolooBackup_050808_LAB_20261110'){throw 'Unexpected SQL database'}
 $memberships=Get-Rows $c "SELECT USER_NAME(rm.role_principal_id) AS role_name,USER_NAME(rm.member_principal_id) AS member_name FROM sys.database_role_members rm ORDER BY role_name,member_name"
 $grants=Get-Rows $c "SELECT USER_NAME(p.grantee_principal_id) AS principal_name,p.state_desc,p.permission_name,p.class_desc,CASE WHEN p.class=1 THEN OBJECT_SCHEMA_NAME(p.major_id)+'.'+OBJECT_NAME(p.major_id) ELSE NULL END AS object_name FROM sys.database_permissions p ORDER BY principal_name,p.permission_name"
 $principals=Get-Rows $c "SELECT name,type_desc FROM sys.database_principals WHERE type IN ('S','U','G','R') ORDER BY name"
 $serverRoles=Get-Rows $c "SELECT SUSER_SNAME(srm.member_principal_id) AS member_name,SUSER_SNAME(srm.role_principal_id) AS role_name FROM sys.server_role_members srm ORDER BY member_name,role_name"
 $result=[pscustomobject]@{schemaVersion=1;readOnlyInventory=$true;identity=$identity[0];databasePrincipals=@($principals);databaseRoleMemberships=@($memberships);databasePermissions=@($grants);serverRoleMemberships=@($serverRoles);productionWriteGate='NO-GO';note='Metadata inventory only; inherited Windows group rights and effective privilege closure require separate review'}
 if($Json){$result|ConvertTo-Json -Depth 7 -Compress}else{$result|Format-List}
} finally {$c.Dispose()}
