#requires -Version 5.1
<#
A02: schema-only metadata from new isolated SQL DB. No financial rows, counts
of business rows, raw SQL messages, schema names or file paths in STDOUT.
Test mode is pure synthetic; Inspect never writes/creates databases.
#>
[CmdletBinding()]
param([ValidateSet('Test','Inspect')][string]$Mode='Test',
  [string]$InstanceName='FINORAMIG',[string]$DatabaseName='')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Assert-Target([string]$instance,[string]$database){
  if($instance -ceq 'FINORAMIG'){
    if($database -cnotmatch '^FinoraHoloo_[0-9a-f]{32}$'){throw 'A02_ISOLATED_DB_REQUIRED'}
  }elseif($instance -cmatch '^FinoraA02_([0-9a-f]{12})$'){
    if($database -cne ('A02Restore_'+$Matches[1])){throw 'A02_TEST_DB_PAIR_MISMATCH'}
  }else{throw 'A02_LOCAL_INSTANCE_ONLY'}
}
function Frame([string]$v){if($null -eq $v){$v=''};return ([string]$v.Length)+':'+$v}
function Fingerprint([object[]]$rows){
  if($rows.Count -gt 200000){throw 'A02_TOO_MANY_COLUMNS'}
  $lines=[Collections.Generic.List[string]]::new()
  foreach($row in $rows){
    $parts=@((Frame ([string]$row.SchemaName)),(Frame ([string]$row.TableName)),
      (Frame ([string]$row.ColumnName)),(Frame ([string]$row.DataType)),
      (Frame ([string]$row.Ordinal)),(Frame ([string]$row.MaxLength)),
      (Frame ([string]$row.Precision)),(Frame ([string]$row.Scale)),
      (Frame ([string]$row.IsNullable)),(Frame ([string]$row.IsIdentity)),
      (Frame ([string]$row.IsComputed)))
    $lines.Add(($parts -join '|'))
  }
  $lines.Sort([StringComparer]::Ordinal)
  $sha=[Security.Cryptography.SHA256]::Create()
  try{
    $bytes=[Text.Encoding]::UTF8.GetBytes(($lines -join [Environment]::NewLine))
    return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()
  }finally{$sha.Dispose()}
}
if($Mode -eq 'Test'){
  Assert-Target 'FINORAMIG' 'FinoraHoloo_0123456789abcdef0123456789abcdef'
  Assert-Target 'FinoraA02_0123456789ab' 'A02Restore_0123456789ab'
  foreach($pair in @(@('FINORAMIG','master'),@('FINORAMIG','Holoo1'),
      @('master','FinoraHoloo_0123456789abcdef0123456789abcdef'),
      @('FinoraA02_0123456789ab','A02Restore_aaaaaaaaaaaa'))){
    $blocked=$false
    try{Assert-Target $pair[0] $pair[1]}catch{$blocked=$true}
    if(-not $blocked){throw 'A02_UNSAFE_TARGET_ACCEPTED'}
  }
  $rows=@(
    [pscustomobject]@{SchemaName='dbo';TableName='Synthetic';ColumnName='id';DataType='int';Ordinal=1;MaxLength=4;Precision=10;Scale=0;IsNullable=0;IsIdentity=0;IsComputed=0},
    [pscustomobject]@{SchemaName='dbo';TableName='Synthetic';ColumnName='amount';DataType='bigint';Ordinal=2;MaxLength=8;Precision=19;Scale=0;IsNullable=0;IsIdentity=0;IsComputed=0}
  )
  $h=Fingerprint $rows;[array]::Reverse($rows)
  if((Fingerprint $rows) -cne $h){throw 'A02_FINGERPRINT_NOT_ORDER_INDEPENDENT'}
  $rows[0].ColumnName='changed'
  if((Fingerprint $rows) -ceq $h){throw 'A02_FINGERPRINT_NOT_CHANGE_SENSITIVE'}
  [pscustomobject]@{status='schema-fingerprint-selftest-passed';sqlOpened=$false;userRowsRead=$false;databaseModified=$false;canImport=$false}|ConvertTo-Json -Compress
  return
}
$conn=$null
try{
  Assert-Target $InstanceName $DatabaseName
  $source=if($InstanceName -ceq 'FINORAMIG'){'lpc:.\FINORAMIG'}else{'(localdb)\'+$InstanceName}
  $connectionString='Data Source='+$source+';Initial Catalog=master;Integrated Security=True;Connect Timeout=15;Encrypt=False;Pooling=False;'
  $conn=[Data.SqlClient.SqlConnection]::new($connectionString);$conn.Open()
  $check=$conn.CreateCommand()
  $check.CommandText='SELECT state_desc FROM sys.databases WHERE name=@db;'
  [void]$check.Parameters.Add('@db',[Data.SqlDbType]::NVarChar,128)
  $check.Parameters['@db'].Value=$DatabaseName
  $status=$check.ExecuteScalar();$check.Dispose()
  if($null -eq $status -or [string]$status -cne 'ONLINE'){throw 'A02_RESTORE_NOT_ONLINE'}
  $conn.ChangeDatabase($DatabaseName)
  # System catalogs ONLY; never reads application tables or business rows.
  $sql=@'
SELECT s.name AS SchemaName,t.name AS TableName,c.name AS ColumnName,
       ty.name AS DataType,c.column_id AS Ordinal,c.max_length AS MaxLength,
       c.precision AS Precision,c.scale AS Scale,c.is_nullable AS IsNullable,
       c.is_identity AS IsIdentity,c.is_computed AS IsComputed
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id=t.schema_id
JOIN sys.columns AS c ON c.object_id=t.object_id
JOIN sys.types AS ty ON ty.user_type_id=c.user_type_id
WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name,c.column_id;
'@
  $cmd=$conn.CreateCommand();$cmd.CommandText=$sql;$cmd.CommandTimeout=120
  $adapter=[Data.SqlClient.SqlDataAdapter]::new($cmd)
  $table=[Data.DataTable]::new()
  try{[void]$adapter.Fill($table)}finally{$adapter.Dispose();$cmd.Dispose()}
  if($table.Rows.Count -lt 2 -or $table.Rows.Count -gt 200000){throw 'A02_SCHEMA_SIZE_INVALID'}
  $columns=[Collections.Generic.List[object]]::new()
  $tables=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach($r in $table.Rows){
    $o=[pscustomobject]@{
      SchemaName=[string]$r['SchemaName'];TableName=[string]$r['TableName']
      ColumnName=[string]$r['ColumnName'];DataType=[string]$r['DataType']
      Ordinal=[int]$r['Ordinal'];MaxLength=[int]$r['MaxLength']
      Precision=[int]$r['Precision'];Scale=[int]$r['Scale']
      IsNullable=[int]$r['IsNullable'];IsIdentity=[int]$r['IsIdentity']
      IsComputed=[int]$r['IsComputed']
    }
    $columns.Add($o);[void]$tables.Add((Frame $o.SchemaName)+(Frame $o.TableName))
  }
  [pscustomobject]@{
    status='isolated-schema-inventoried'
    fingerprintSha256=(Fingerprint ($columns.ToArray()))
    tableCount=$tables.Count;columnCount=$columns.Count
    userRowsRead=$false;databaseModified=$false;canImport=$false
  }|ConvertTo-Json -Compress
}catch{
  Write-Error 'A02_SCHEMA_INVENTORY_FAILED'
  exit 2
}finally{if($null -ne $conn){$conn.Dispose()}}
