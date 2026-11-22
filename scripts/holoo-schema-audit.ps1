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
 $q.CommandText="SELECT (SELECT COUNT_BIG(*) FROM dbo.FACTURE) AS invoiceHeaders,(SELECT COUNT_BIG(*) FROM dbo.FACTART) AS invoiceLines,(SELECT COUNT_BIG(*) FROM dbo.SANAD) AS accountingDocuments,(SELECT COUNT_BIG(*) FROM dbo.FACTART a LEFT JOIN dbo.FACTURE f ON a.Fac_Code=f.Fac_Code AND a.Fac_Type=f.Fac_Type WHERE f.Fac_Code IS NULL) AS orphanInvoiceLines"
 $r=$q.ExecuteReader()
 try {
  if(-not $r.Read()){throw 'Data integrity query returned no row'}
  $integrity=[pscustomobject]@{invoiceHeaders=$r.GetInt64(0);invoiceLines=$r.GetInt64(1);accountingDocuments=$r.GetInt64(2);orphanInvoiceLines=$r.GetInt64(3)}
 } finally {$r.Close()}
 $q.CommandText="SELECT (SELECT COUNT_BIG(*) FROM dbo.FACTART a LEFT JOIN dbo.FACTURE f ON a.Fac_Code=f.Fac_Code AND a.Fac_Type=f.Fac_Type WHERE f.Fac_Code IS NULL AND NOT (a.Fac_Code='000000' AND a.Fac_Type='L' AND a.A_Code='0000000' AND a.A_Index=0)),(SELECT COUNT_BIG(*) FROM dbo.FACTART WHERE Fac_Code='000000' AND Fac_Type='L' AND A_Code='0000000' AND A_Index=0),(SELECT COUNT_BIG(*) FROM dbo.FACTURE f LEFT JOIN dbo.SANAD s ON f.Sanad_Code=s.Sanad_Code WHERE f.Sanad_Code IS NOT NULL AND f.Sanad_Code<>0 AND s.Sanad_Code IS NULL)"
 $r=$q.ExecuteReader()
 try {
  if(-not $r.Read()){throw 'Detailed integrity query returned no row'}
  $integrity | Add-Member -NotePropertyName orphanInvoiceLinesExcludingCandidateSentinel -NotePropertyValue $r.GetInt64(0)
  $integrity | Add-Member -NotePropertyName candidateSentinelRows -NotePropertyValue $r.GetInt64(1)
  $integrity | Add-Member -NotePropertyName missingReferencedAccountingDocuments -NotePropertyValue $r.GetInt64(2)
 } finally {$r.Close()}
 $q.CommandText="SELECT (SELECT COUNT_BIG(*) FROM (SELECT Fac_Type,Fac_Code_C FROM dbo.FACTURE WHERE Fac_Code_C IS NOT NULL GROUP BY Fac_Type,Fac_Code_C HAVING COUNT_BIG(*)>1) d),(SELECT COUNT_BIG(*) FROM dbo.FACTURE WHERE Sanad_Code IS NULL OR Sanad_Code=0)"
 $r=$q.ExecuteReader()
 try {
  if(-not $r.Read()){throw 'Invoice numbering audit returned no row'}
  $integrity | Add-Member -NotePropertyName duplicateInvoiceTypeNumberGroups -NotePropertyValue $r.GetInt64(0)
  $integrity | Add-Member -NotePropertyName invoiceHeadersWithoutAccountingCode -NotePropertyValue $r.GetInt64(1)
 } finally {$r.Close()}
 $result=[pscustomobject]@{schemaVersion=1;database='HolooBackup_050808_LAB_20261110';readOnlyAudit=$true;tables=$tables;integrity=$integrity;complete=($tables.Count -eq 3);note='Candidate sentinel classification is unverified; raw orphan count retained. No application-level invariants or concurrency claims'}
 if($Json){$result|ConvertTo-Json -Depth 6}else{$tables|Format-Table -AutoSize;Write-Output ('COMPLETE='+$result.complete)}
 if(-not $result.complete){exit 2}
} finally {$c.Dispose()}




