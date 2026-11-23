# Catalog-only stored-procedure dependency evidence; no procedure invocation.
[CmdletBinding()]
param([switch]$Json)
$ErrorActionPreference='Stop'
$preflight=Join-Path $PSScriptRoot 'holoo-direct-sql-readiness.ps1'
$raw=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $preflight -Json
if($LASTEXITCODE -ne 0 -or -not ($raw|ConvertFrom-Json).readyForLabSql){throw 'Approved LAB preflight failed'}
Add-Type -AssemblyName System.Data
$c=New-Object System.Data.SqlClient.SqlConnection('Server=ARAM\TNC;Database=HolooBackup_050808_LAB_20261110;Integrated Security=True;Connection Timeout=5;Application Name=FinoraHolooProcedureDependencies')
try {
 $c.Open();$q=$c.CreateCommand();$q.CommandTimeout=20
 $q.CommandText='SELECT DB_NAME()'
 $db=[string]$q.ExecuteScalar()
 if($db -ne 'HolooBackup_050808_LAB_20261110'){throw 'Unexpected database'}
 $q.CommandText="SELECT OBJECT_SCHEMA_NAME(d.referencing_id) AS procedure_schema,OBJECT_NAME(d.referencing_id) AS procedure_name,d.referenced_schema_name,d.referenced_entity_name,d.referenced_minor_id,d.is_ambiguous,d.is_caller_dependent FROM sys.sql_expression_dependencies d JOIN sys.procedures p ON p.object_id=d.referencing_id WHERE (d.referenced_entity_name IN ('FACTURE','FACTART','SANAD') OR d.referenced_id IN (OBJECT_ID('dbo.FACTURE'),OBJECT_ID('dbo.FACTART'),OBJECT_ID('dbo.SANAD'))) ORDER BY procedure_schema,procedure_name,d.referenced_entity_name,d.referenced_minor_id"
 $r=$q.ExecuteReader();$rows=@()
 try {while($r.Read()){$item=@{};for($i=0;$i -lt $r.FieldCount;$i++){$item[$r.GetName($i)]=if($r.IsDBNull($i)){$null}else{$r.GetValue($i)}};$rows += [pscustomobject]$item}}finally{$r.Close()}
 $result=[pscustomobject]@{schemaVersion=1;database=$db;metadataOnly=$true;dependencyRows=@($rows);dependencyRowCount=$rows.Count;procedureCount=@($rows|ForEach-Object {$_.procedure_schema+'.'+$_.procedure_name}|Sort-Object -Unique).Count;dependencyCoverageComplete=$false;dynamicSqlAndIndirectCallsUnresolved=$true;financialSemanticsVerified=$false;productionWriteGate='NO-GO';note='Static catalog references only; absent dependency does not prove a procedure cannot access these tables'}
 if($Json){$result|ConvertTo-Json -Depth 6 -Compress}else{$result|Format-List}
}finally{$c.Dispose()}
