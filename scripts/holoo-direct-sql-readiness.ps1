# Read-only readiness check for direct Holoo SQL testing on Aram.
[CmdletBinding()]
param([string]$Server='ARAM\TNC',[string]$Database='HolooBackup_050808_LAB_20261110',[switch]$Json)
$ErrorActionPreference='Stop'
$checks=New-Object System.Collections.Generic.List[object]
function Add-Check($Name,$Status,$Detail){$checks.Add([pscustomobject]@{name=$Name;status=$Status;detail=$Detail})}
if($Server -ne 'ARAM\TNC' -or $Database -ne 'HolooBackup_050808_LAB_20261110') {Add-Check 'database-selection' 'BLOCKED' 'Only the verified Aram SQL instance and disposable backup LAB database are accepted'} else {Add-Check 'database-selection' 'PASS' 'Explicit LAB database selected'}
if ($checks[0].status -eq 'PASS') {
try {
 Add-Type -AssemblyName System.Data
 $c=New-Object System.Data.SqlClient.SqlConnection("Server=$Server;Database=master;Integrated Security=True;Connection Timeout=5")
 $c.Open()
 Add-Check 'connection' 'PASS' 'Windows authentication connected to SQL Server'
 $q=$c.CreateCommand();$q.CommandText='SELECT state_desc,is_read_only FROM sys.databases WHERE name=@db';$null=$q.Parameters.Add('@db',[System.Data.SqlDbType]::NVarChar,128);$q.Parameters['@db'].Value=$Database
 $r=$q.ExecuteReader()
 if(-not $r.Read()){Add-Check 'database' 'BLOCKED' 'Selected database not found'} else {
  $state=$r.GetString(0);$ro=$r.GetBoolean(1)
  if($state -ne 'ONLINE'){Add-Check 'database' 'BLOCKED' 'Database is not online'} elseif($ro){Add-Check 'database' 'BLOCKED' 'Database is read-only'} else {Add-Check 'database' 'PASS' 'Selected LAB database is online and writable'}
 }
 $r.Close();$c.Close()
} catch {Add-Check 'connection' 'BLOCKED' ('SQL connectivity failed: '+$_.Exception.GetType().Name)}
}
$blocked=@($checks|Where-Object {$_.status -eq 'BLOCKED'}).Count
$result=[pscustomobject]@{schemaVersion=1;readyForLabSql=($blocked -eq 0);checks=$checks.ToArray();note='Readiness does not authorize writes or prove Holoo behavioral parity'}
if($Json){$result|ConvertTo-Json -Depth 5}else{$checks|Format-Table -AutoSize;Write-Output ('READY_FOR_LAB_SQL='+$result.readyForLabSql)}
if($blocked -gt 0){exit 2}



