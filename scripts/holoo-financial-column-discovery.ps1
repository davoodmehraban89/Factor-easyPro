# Metadata-only discovery. No financial formula or column semantics are assumed.
[CmdletBinding()]
param([switch]$Json)
$ErrorActionPreference='Stop'
$preflight=Join-Path $PSScriptRoot 'holoo-direct-sql-readiness.ps1'
$raw=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $preflight -Json
if($LASTEXITCODE -ne 0 -or -not ($raw|ConvertFrom-Json).readyForLabSql){throw 'Approved LAB preflight failed'}
Add-Type -AssemblyName System.Data
$c=New-Object System.Data.SqlClient.SqlConnection('Server=ARAM\TNC;Database=HolooBackup_050808_LAB_20261110;Integrated Security=True;Connection Timeout=5;Application Name=FinoraHolooFinancialMetadata')
try {
 $c.Open()
 $q=$c.CreateCommand();$q.CommandTimeout=15
 $q.CommandText="SELECT DB_NAME() AS database_name,SYSTEM_USER AS login_name"
 $r=$q.ExecuteReader()
 try {if(-not $r.Read() -or $r.GetString(0) -ne 'HolooBackup_050808_LAB_20261110'){throw 'Unexpected database'};$login=$r.GetString(1)}finally{$r.Close()}
 $q.CommandText="SELECT t.name AS table_name,c.column_id,c.name AS column_name,ty.name AS sql_type,c.max_length,c.precision,c.scale,c.is_nullable FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name='dbo' AND t.name IN ('FACTURE','FACTART','SANAD') ORDER BY t.name,c.column_id"
 $r=$q.ExecuteReader();$columns=@()
 try {while($r.Read()){$columns += [pscustomobject]@{table=$r.GetString(0);ordinal=$r.GetInt32(1);name=$r.GetString(2);sqlType=$r.GetString(3);maxLength=$r.GetInt16(4);precision=$r.GetByte(5);scale=$r.GetByte(6);nullable=$r.GetBoolean(7)}}}finally{$r.Close()}
 $tables=@($columns|Group-Object table|ForEach-Object {$_.Name})
 if(@($tables|Where-Object {$_ -notin @('FACTURE','FACTART','SANAD')}).Count -gt 0 -or $tables.Count -ne 3){throw 'Incomplete or unexpected LAB table metadata'}
 $result=[pscustomobject]@{schemaVersion=1;database='HolooBackup_050808_LAB_20261110';login=$login;metadataOnly=$true;columns=@($columns);columnSemanticsVerified=$false;financialReconciliationAuthorized=$false;productionWritesAuthorized=$false;productionWriteGate='NO-GO';note='Catalog names and types only; do not infer VAT, discount, amounts, or stock movements from names'}
 if($Json){$result|ConvertTo-Json -Depth 5 -Compress}else{$result|Format-List}
}finally{$c.Dispose()}
