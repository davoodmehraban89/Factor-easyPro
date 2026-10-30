#requires -Version 5.1
<#
A02: LIVE SQL restore test with strictly synthetic rows in a newly created,
disposable LocalDB instance. Do NOT supply, open, or upload any owner backup.
No SQL Server engine installation or existing instance modification.
#>
[CmdletBinding()]
param([ValidateSet('Test','Run')][string]$Mode='Test')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

function Require([bool]$valid,[string]$reason) { if(-not $valid){throw $reason} }
function Literal([string]$value) { return "N'"+$value.Replace("'","''")+"'" }
function ExecSql($conn,[string]$sql) {
  $c=$conn.CreateCommand(); $c.CommandText=$sql; $c.CommandTimeout=180
  try{[void]$c.ExecuteNonQuery()}finally{$c.Dispose()}
}
function QuerySql($conn,[string]$sql) {
  $c=$conn.CreateCommand();$c.CommandText=$sql;$c.CommandTimeout=180
  $adapter=[System.Data.SqlClient.SqlDataAdapter]::new($c)
  $table=[System.Data.DataTable]::new()
  try{[void]$adapter.Fill($table);return ,$table}
  finally{$adapter.Dispose();$c.Dispose()}
}
function FindLocalDB {
  $cmd=Get-Command 'SqlLocalDB.exe' -ErrorAction SilentlyContinue
  if($null -ne $cmd){return $cmd.Source}
  $root=Join-Path $env:ProgramFiles 'Microsoft SQL Server'
  if(Test-Path -LiteralPath $root){
    $found=@(Get-ChildItem -LiteralPath $root -Filter SqlLocalDB.exe -Recurse -File -ErrorAction SilentlyContinue|Select-Object -First 1)
    if($found.Count -gt 0){return $found[0].FullName}
  }
  throw 'A02_LOCALDB_RUNTIME_NOT_INSTALLED'
}
if($Mode -eq 'Test'){
  Require ((Literal "O'Brien") -ceq "N'O''Brien'") 'A02_SQL_LITERAL_ESCAPE'
  [pscustomobject]@{status='synthetic-sql-test-contract-passed';engineConnected=$false;databaseCreated=$false;ownerBackupUsed=$false;canImport=$false}|ConvertTo-Json -Compress
  return
}
$token=[guid]::NewGuid().ToString('N').Substring(0,12)
$instance='FinoraA02_'+$token
$source='A02Source_'+$token
$restored='A02Restore_'+$token
$folder=Join-Path ([IO.Path]::GetTempPath()) ('FinoraA02_SQL_'+$token)
$localdb=$null;$created=$false;$conn=$null;$phase='find-localdb'
try{
  $localdb=FindLocalDB
  $phase='create-instance'
  $null=[IO.Directory]::CreateDirectory($folder)
  & $localdb create $instance | Out-Null
  Require ($LASTEXITCODE -eq 0) 'A02_LOCALDB_CREATE_FAILED'
  $created=$true
  $phase='start-instance'
  & $localdb start $instance | Out-Null
  Require ($LASTEXITCODE -eq 0) 'A02_LOCALDB_START_FAILED'
  # Only an internally generated alphanumeric LocalDB instance is used.
  # Use a literal, fully assembled connection string rather than property
  # assignments on a .NET Framework builder (Windows runner compatibility).
  $phase='connection-string-assemble'
  $connectionString='Data Source=(localdb)\\'+$instance+
      ';Initial Catalog=master;Integrated Security=True;Connect Timeout=30;Encrypt=False;Pooling=False;'
  $phase='connection-object'
  $conn=[System.Data.SqlClient.SqlConnection]::new($connectionString)
  $phase='connection-open'
  $conn.Open()
  $phase='create-synthetic-database'
  ExecSql $conn ('CREATE DATABASE ['+$source+'];')
  ExecSql $conn ('CREATE TABLE ['+$source+'].dbo.A02Synthetic(id int NOT NULL PRIMARY KEY,amount bigint NOT NULL);'+
    'INSERT INTO ['+$source+'].dbo.A02Synthetic(id,amount) VALUES(1,12345),(2,67890);')
  $phase='create-synthetic-backup'
  $bak=Join-Path $folder 'synthetic_copy_only.bak'
  ExecSql $conn ('BACKUP DATABASE ['+$source+'] TO DISK = '+(Literal $bak)+' WITH INIT,COPY_ONLY;')
  Require ([IO.File]::Exists($bak)) 'A02_BACKUP_NOT_CREATED'
  $phase='headeronly'
  $header=QuerySql $conn ('RESTORE HEADERONLY FROM DISK = '+(Literal $bak))
  Require ($header.Rows.Count -eq 1 -and [int]$header.Rows[0]['BackupType'] -eq 1) 'A02_HEADER_INVALID'
  $phase='filelistonly'
  $files=QuerySql $conn ('RESTORE FILELISTONLY FROM DISK = '+(Literal $bak))
  Require ($files.Rows.Count -ge 2) 'A02_FILELIST_INVALID'
  $moves=@();$data=0;$logs=0
  foreach($f in $files.Rows){
    $type=[string]$f['Type']
    if($type -eq 'D'){$data++;$ext=if($data -eq 1){'.mdf'}else{'.ndf'}}
    elseif($type -eq 'L'){$logs++;$ext='.ldf'}
    else{throw 'A02_SQL_FILE_TYPE_UNSUPPORTED'}
    $target=Join-Path $folder ($restored+'_'+$moves.Count+$ext)
    Require (-not [IO.File]::Exists($target)) 'A02_RESTORE_TARGET_COLLISION'
    $moves+=('MOVE '+(Literal ([string]$f['LogicalName']))+' TO '+(Literal $target))
  }
  Require ($data -gt 0 -and $logs -gt 0) 'A02_DATA_AND_LOG_REQUIRED'
  $from='FROM DISK = '+(Literal $bak)+' WITH FILE = 1, '+($moves -join ', ')
  $phase='verifyonly'
  ExecSql $conn ('RESTORE VERIFYONLY '+$from+';')
  $phase='restore-new-db'
  ExecSql $conn ('IF DB_ID('+(Literal $restored)+") IS NOT NULL THROW 51001, 'A02_SYNTHETIC_COLLISION', 1;"+
    [Environment]::NewLine+'RESTORE DATABASE ['+$restored+'] '+$from+', RECOVERY;')
  $phase='dbcc-checkdb'
  ExecSql $conn ('DBCC CHECKDB(['+$restored+']) WITH NO_INFOMSGS;')
  $phase='synthetic-reconciliation'
  $row=QuerySql $conn ('SELECT COUNT_BIG(*) AS C,SUM(amount) AS T FROM ['+$restored+'].dbo.A02Synthetic;')
  Require ($row.Rows.Count -eq 1 -and [long]$row.Rows[0]['C'] -eq 2 -and
    [long]$row.Rows[0]['T'] -eq 80235) 'A02_RESTORED_SYNTHETIC_TOTALS_MISMATCH'
  [pscustomobject]@{
    status='synthetic-localdb-restore-verified';ownerBackupUsed=$false
    headerVerified=$true;fileListVerified=$true;verifyOnlyPassed=$true
    restoreExecuted=$true;dbccPassed=$true;syntheticRecords=2
    syntheticTotal=80235;financialMigrationPerformed=$false;canImport=$false
  }|ConvertTo-Json -Compress
}catch{
  # Only a bounded phase and exception *type* are public; never emit raw SQL,
  # paths, backup bytes, identity, or exception messages.
  $kind=$_.Exception.GetType().Name
  Write-Error ('A02_SYNTHETIC_LOCALDB_RESTORE_FAILED phase='+$phase+' type='+$kind)
  exit 2
}finally{
  if($null -ne $conn){
    try{
      foreach($name in @($restored,$source)){
        ExecSql $conn ('IF DB_ID('+(Literal $name)+') IS NOT NULL BEGIN '+
          'ALTER DATABASE ['+$name+'] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; '+
          'DROP DATABASE ['+$name+']; END;')
      }
    }catch{}
    $conn.Dispose()
  }
  if($created){
    try{& $localdb stop $instance -k | Out-Null}catch{}
    try{& $localdb delete $instance | Out-Null}catch{}
  }
  if([IO.Directory]::Exists($folder)){try{[IO.Directory]::Delete($folder,$true)}catch{}}
}
