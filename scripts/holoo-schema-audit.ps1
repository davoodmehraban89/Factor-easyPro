# Read-only structural audit of the approved Holoo backup lab database.
[CmdletBinding()]
param([switch]$Json)
$ErrorActionPreference='Stop'
$preflight=Join-Path $PSScriptRoot 'holoo-direct-sql-readiness.ps1'
$raw=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $preflight -Json
if($LASTEXITCODE -ne 0){throw 'Approved SQL lab preflight failed'}
$ready=$raw|ConvertFrom-Json
if(-not $ready.readyForLabSql){throw 'Approved SQL lab preflight did not pass'}
Add-Type -AssemblyName System.Data
$c=New-Object System.Data.SqlClient.SqlConnection('Server=ARAM\TNC;Database=HolooBackup_050808_LAB_20261110;Integrated Security=True;Connection Timeout=5;Application Name=FinoraHolooReadOnlyAudit')
try {
 $c.Open()
 $q=$c.CreateCommand();$q.CommandTimeout=15
 $q.CommandText="SELECT t.name AS table_name, (SELECT COUNT(*) FROM sys.foreign_keys f WHERE f.parent_object_id=t.object_id) AS outbound_fk, (SELECT COUNT(*) FROM sys.triggers g WHERE g.parent_id=t.object_id) AS trigger_count, (SELECT COUNT(*) FROM sys.check_constraints k WHERE k.parent_object_id=t.object_id) AS check_count, (SELECT COUNT(*) FROM sys.key_constraints k WHERE k.parent_object_id=t.object_id AND k.type='PK') AS primary_key_count FROM sys.tables t WHERE t.name IN ('FACTURE','FACTART','SANAD') ORDER BY t.name"
 $r=$q.ExecuteReader()
 try {
  $tables=@()
  while($r.Read()){$tables+= [pscustomobject]@{table=$r.GetString(0);outboundForeignKeys=$r.GetInt32(1);triggers=$r.GetInt32(2);checkConstraints=$r.GetInt32(3);primaryKeys=$r.GetInt32(4)}}
 } finally {$r.Close()}
 $result=[pscustomobject]@{schemaVersion=1;database='HolooBackup_050808_LAB_20261110';readOnlyAudit=$true;tables=$tables;complete=($tables.Count -eq 3);note='Structural audit only; no claim of application-level invariants or concurrency safety'}
 if($Json){$result|ConvertTo-Json -Depth 6}else{$tables|Format-Table -AutoSize;Write-Output ('COMPLETE='+$result.complete)}
 if(-not $result.complete){exit 2}
} finally {$c.Dispose()}

