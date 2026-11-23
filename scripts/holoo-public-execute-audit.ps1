[CmdletBinding()]
param([switch]$Json)
$ErrorActionPreference='Stop'
$preflight=Join-Path $PSScriptRoot 'holoo-direct-sql-readiness.ps1'
$raw=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $preflight -Json
if($LASTEXITCODE -ne 0 -or -not ($raw|ConvertFrom-Json).readyForLabSql){throw 'Approved LAB preflight failed'}
Add-Type -AssemblyName System.Data
$c=New-Object System.Data.SqlClient.SqlConnection('Server=ARAM\TNC;Database=HolooBackup_050808_LAB_20261110;Integrated Security=True;Connection Timeout=5;Application Name=FinoraHolooPublicExecuteAudit')
try {
 $c.Open();$q=$c.CreateCommand();$q.CommandTimeout=20
 $q.CommandText="SELECT DB_NAME() AS database_name,OBJECT_SCHEMA_NAME(p.major_id) AS schema_name,OBJECT_NAME(p.major_id) AS object_name,o.type_desc,m.definition FROM sys.database_permissions p LEFT JOIN sys.objects o ON o.object_id=p.major_id LEFT JOIN sys.sql_modules m ON m.object_id=p.major_id WHERE p.grantee_principal_id=DATABASE_PRINCIPAL_ID('public') AND p.permission_name='EXECUTE' AND p.state_desc='GRANT' AND p.class=1 ORDER BY schema_name,object_name"
 $r=$q.ExecuteReader();$items=@()
 try {while($r.Read()){
  if($r.GetString(0) -ne 'HolooBackup_050808_LAB_20261110'){throw 'Unexpected database'}
  $definition=if($r.IsDBNull(4)){$null}else{$r.GetString(4)}
  # Exclude only the CREATE/ALTER PROCEDURE declaration from DDL classification;
  # retain all other tokens and conservative flags (comments may still be false positives).
  $body=$definition
  if($null -ne $body){$body=[regex]::Replace($body,'(?is)^\s*(?:CREATE|ALTER)\s+(?:PROC|PROCEDURE)\b[^\r\n]*','')}
  $signals=@()
  if($null -ne $definition){
   foreach($pair in @(@('DML','\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b'),@('DDL','\b(CREATE|ALTER|DROP)\b'),@('DYNAMIC_SQL','\b(EXEC|EXECUTE|sp_executesql)\b'),@('TRANSACTION','\b(BEGIN\s+TRAN|COMMIT|ROLLBACK)\b'))){if($body -match $pair[1]){$signals+=$pair[0]}}
  }
  $items+= [pscustomobject]@{schema=if($r.IsDBNull(1)){$null}else{$r.GetString(1)};name=if($r.IsDBNull(2)){$null}else{$r.GetString(2)};type=if($r.IsDBNull(3)){$null}else{$r.GetString(3)};definitionVisible=($null -ne $definition);signals=@($signals);requiresManualReview=$true}
 }}finally{$r.Close()}
 # Catalog dependency edges are evidence only; dynamic SQL and cross-database calls may be absent.
 $d=$c.CreateCommand();$d.CommandTimeout=20
 $d.CommandText="SELECT OBJECT_SCHEMA_NAME(dep.referencing_id) AS caller_schema,OBJECT_NAME(dep.referencing_id) AS caller_name,dep.referenced_schema_name,dep.referenced_entity_name,dep.referenced_database_name FROM sys.sql_expression_dependencies dep WHERE dep.referencing_id IN (SELECT major_id FROM sys.database_permissions WHERE grantee_principal_id=DATABASE_PRINCIPAL_ID('public') AND permission_name='EXECUTE' AND state_desc='GRANT' AND class=1)"
 $dr=$d.ExecuteReader();$edges=@()
 try {while($dr.Read()){$edges+= [pscustomobject]@{caller=($dr.GetString(0)+'.'+$dr.GetString(1));targetSchema=if($dr.IsDBNull(2)){$null}else{$dr.GetString(2)};targetName=if($dr.IsDBNull(3)){$null}else{$dr.GetString(3)};targetDatabase=if($dr.IsDBNull(4)){$null}else{$dr.GetString(4)}}}}finally{$dr.Close();$d.Dispose()}
 $result=[pscustomobject]@{database='HolooBackup_050808_LAB_20261110';readOnlyMetadataAudit=$true;grantCount=$items.Count;objects=@($items);dependencyEdges=@($edges);status='NO-GO';note='Conservative regex signals only; no stored procedures executed; empty signals are NOT proof of read-only behavior'}
 if($Json){$result|ConvertTo-Json -Depth 6 -Compress}else{$result|Format-List}
}finally{$c.Dispose()}

