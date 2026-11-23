# Read-only lexical signals from stored-procedure definitions; never execute procedures.
[CmdletBinding()]
param([switch]$Json)
$ErrorActionPreference='Stop'
$preflight=Join-Path $PSScriptRoot 'holoo-direct-sql-readiness.ps1'
$raw=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $preflight -Json
if($LASTEXITCODE -ne 0 -or -not ($raw|ConvertFrom-Json).readyForLabSql){throw 'Approved LAB preflight failed'}
Add-Type -AssemblyName System.Data
$c=New-Object System.Data.SqlClient.SqlConnection('Server=ARAM\TNC;Database=HolooBackup_050808_LAB_20261110;Integrated Security=True;Connection Timeout=5;Application Name=FinoraHolooProcedureSignals')
try {
 $c.Open();$q=$c.CreateCommand();$q.CommandTimeout=20
 $q.CommandText='SELECT DB_NAME()'
 $db=[string]$q.ExecuteScalar()
 if($db -ne 'HolooBackup_050808_LAB_20261110'){throw 'Unexpected database'}
 $q.CommandText="SELECT DISTINCT p.object_id,SCHEMA_NAME(p.schema_id) AS procedure_schema,p.name AS procedure_name,m.definition FROM sys.procedures p JOIN sys.sql_modules m ON m.object_id=p.object_id WHERE EXISTS (SELECT 1 FROM sys.sql_expression_dependencies d WHERE d.referencing_id=p.object_id AND (d.referenced_entity_name IN ('FACTURE','FACTART','SANAD') OR d.referenced_id IN (OBJECT_ID('dbo.FACTURE'),OBJECT_ID('dbo.FACTART'),OBJECT_ID('dbo.SANAD')))) ORDER BY procedure_schema,procedure_name"
 $reader=$q.ExecuteReader();$rows=@()
 try {
  while($reader.Read()){
   $definition=if($reader.IsDBNull(3)){$null}else{[string]$reader.GetString(3)}
   $signals=@{}
   foreach($term in @('FACTURE','FACTART','SANAD','Sum_Price','Takhfif','Sum_Levy','Sum_Scot','Tedad','Buy_Price','Price_BS','INSERT','UPDATE','DELETE','EXEC','sp_executesql')){
    $signals[$term]=if($null -eq $definition){$null}else{[regex]::Matches($definition,'(?i)\b'+[regex]::Escape($term)+'\b').Count}
   }
   $rows += [pscustomobject]@{schema=$reader.GetString(1);name=$reader.GetString(2);definitionAvailable=($null -ne $definition);signals=$signals}
  }
 }finally{$reader.Close()}
 $result=[pscustomobject]@{schemaVersion=1;database=$db;metadataOnly=$true;procedureCount=$rows.Count;procedures=@($rows);lexicalOnly=$true;dynamicSqlAndIndirectCallsUnresolved=$true;financialSemanticsVerified=$false;productionWriteGate='NO-GO';note='Token counts are lexical hints, not execution paths or accounting formulas; procedure bodies are not exported'}
 if($Json){$result|ConvertTo-Json -Depth 7 -Compress}else{$result|Format-List}
}finally{$c.Dispose()}
