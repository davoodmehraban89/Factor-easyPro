#requires -Version 5.1
<#
A02: read-only SQL schema inventory for a restored, isolated database.
Inspect prints counts/hash only. PrivateManifest writes schema metadata only,
encrypted with Windows DPAPI CurrentUser and a restrictive local file ACL.
DecryptManifest creates a local ACL-restricted plaintext schema-only JSON file.
No application/business rows are queried. No database writes are performed.
#>
[CmdletBinding()]
param(
  [ValidateSet('Test','Inspect','PrivateManifest','DecryptManifest')]
  [string]$Mode='Test',
  [string]$InstanceName='FINORAMIG',
  [string]$DatabaseName='',
  [string]$OutputPath='',
  [string]$InputPath=''
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$script:ManifestHeader='FEP-A02-DPAPI-V1'
$script:ManifestEntropy=[Text.Encoding]::UTF8.GetBytes('FactorEasyPro|A02|SchemaManifest|v1')

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
function Assert-LocalFilePath([string]$value,[bool]$mustExist){
  if([string]::IsNullOrWhiteSpace($value) -or
     $value -notmatch '^[A-Za-z]:\\' -or
     $value -match '[/\x00-\x1f<>\"|?*]' -or
     $value.Substring(2).Contains(':')){throw 'A02_PRIVATE_PATH_NOT_LOCAL'}
  foreach($segment in $value.Substring(3).Split('\')){
    if([string]::IsNullOrWhiteSpace($segment) -or $segment -eq '.' -or
       $segment -eq '..' -or $segment.EndsWith(' ') -or $segment.EndsWith('.')){
      throw 'A02_PRIVATE_PATH_AMBIGUOUS'
    }
  }
  $full=[IO.Path]::GetFullPath($value)
  $drive=[IO.DriveInfo]::new($full.Substring(0,1))
  if($drive.DriveType -ne [IO.DriveType]::Fixed -or -not $drive.IsReady){
    throw 'A02_PRIVATE_PATH_REQUIRES_FIXED_LOCAL_DISK'
  }
  $directory=[IO.DirectoryInfo]::new([IO.Path]::GetDirectoryName($full))
  if(-not $directory.Exists){throw 'A02_PRIVATE_PARENT_DIRECTORY_MISSING'}
  $cursor=$directory
  while($null -ne $cursor){
    if(($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){
      throw 'A02_PRIVATE_PATH_REPARSE_POINT'
    }
    $cursor=$cursor.Parent
  }
  if($mustExist){
    $file=[IO.FileInfo]::new($full)
    if(-not $file.Exists -or $file.Length -lt 1 -or $file.Length -gt 67108864){
      throw 'A02_PRIVATE_INPUT_FILE_INVALID'
    }
    if(($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){
      throw 'A02_PRIVATE_INPUT_REPARSE_POINT'
    }
  }else{
    if([IO.File]::Exists($full) -or [IO.Directory]::Exists($full)){
      throw 'A02_PRIVATE_OUTPUT_ALREADY_EXISTS'
    }
  }
  return $full
}
function Write-RestrictedFile([string]$path,[byte[]]$bytes){
  if($bytes.Length -lt 1 -or $bytes.Length -gt 67108864){throw 'A02_PRIVATE_OUTPUT_SIZE_INVALID'}
  $full=Assert-LocalFilePath $path $false
  $directory=[IO.Path]::GetDirectoryName($full)
  $temporary=[IO.Path]::Combine($directory,'.a02-'+[guid]::NewGuid().ToString('N')+'.tmp')
  try{
    $stream=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    $stream.Dispose()
    $current=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $sidValues=@($current.Value,'S-1-5-18','S-1-5-32-544') | Select-Object -Unique
    $acl=[Security.AccessControl.FileSecurity]::new()
    $acl.SetAccessRuleProtection($true,$false)
    $acl.SetOwner($current)
    foreach($sidValue in $sidValues){
      $sid=[Security.Principal.SecurityIdentifier]::new([string]$sidValue)
      $rule=[Security.AccessControl.FileSystemAccessRule]::new(
        $sid,[Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow)
      [void]$acl.AddAccessRule($rule)
    }
    [IO.File]::SetAccessControl($temporary,$acl)
    [IO.File]::WriteAllBytes($temporary,$bytes)
    $check=[IO.File]::GetAccessControl($temporary)
    if(-not $check.AreAccessRulesProtected){throw 'A02_PRIVATE_ACL_NOT_PROTECTED'}
    $rules=@($check.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))
    if($rules.Count -ne $sidValues.Count){throw 'A02_PRIVATE_ACL_RULE_COUNT_INVALID'}
    foreach($entry in $rules){
      if($entry.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
         $entry.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or
         $entry.IdentityReference.Value -notin $sidValues){
        throw 'A02_PRIVATE_ACL_RULE_INVALID'
      }
    }
    [IO.File]::Move($temporary,$full)
  }finally{
    if([IO.File]::Exists($temporary)){[IO.File]::Delete($temporary)}
  }
}
function Get-SchemaData($connection){
  $columnSql=@'
SELECT s.name AS SchemaName,t.name AS TableName,c.name AS ColumnName,
       ts.name AS TypeSchemaName,ty.name AS DataType,
       c.column_id AS Ordinal,c.max_length AS MaxLength,
       c.precision AS Precision,c.scale AS Scale,c.is_nullable AS IsNullable,
       c.is_identity AS IsIdentity,c.is_computed AS IsComputed,
       c.collation_name AS CollationName,c.is_rowguidcol AS IsRowGuid,
       c.is_sparse AS IsSparse,c.is_filestream AS IsFileStream
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id=t.schema_id
JOIN sys.columns AS c ON c.object_id=t.object_id
JOIN sys.types AS ty ON ty.user_type_id=c.user_type_id
JOIN sys.schemas AS ts ON ts.schema_id=ty.schema_id
WHERE t.is_ms_shipped=0
ORDER BY s.name,t.name,c.column_id;
'@
  $indexSql=@'
SELECT s.name AS SchemaName,t.name AS TableName,i.index_id AS IndexId,
       i.name AS IndexName,i.is_primary_key AS IsPrimaryKey,
       i.is_unique AS IsUnique,i.type_desc AS IndexType,
       i.is_disabled AS IsDisabled,i.has_filter AS HasFilter,
       ic.key_ordinal AS KeyOrdinal,ic.index_column_id AS IndexColumnId,
       ic.is_included_column AS IsIncludedColumn,
       ic.is_descending_key AS IsDescendingKey,c.name AS ColumnName
FROM sys.indexes AS i
JOIN sys.tables AS t ON t.object_id=i.object_id
JOIN sys.schemas AS s ON s.schema_id=t.schema_id
JOIN sys.index_columns AS ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
JOIN sys.columns AS c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE t.is_ms_shipped=0 AND i.index_id>0 AND i.is_hypothetical=0
  AND (i.is_primary_key=1 OR i.is_unique=1)
ORDER BY s.name,t.name,i.index_id,ic.index_column_id;
'@
  $foreignSql=@'
SELECT fk.object_id AS ForeignKeyId,fk.name AS ForeignKeyName,
       ps.name AS ParentSchema,pt.name AS ParentTable,
       pc.name AS ParentColumn,rs.name AS ReferencedSchema,
       rt.name AS ReferencedTable,rc.name AS ReferencedColumn,
       fkc.constraint_column_id AS Ordinal,
       fk.is_disabled AS IsDisabled,fk.is_not_trusted AS IsNotTrusted,
       fk.delete_referential_action_desc AS DeleteAction,
       fk.update_referential_action_desc AS UpdateAction,
       fk.is_not_for_replication AS IsNotForReplication
FROM sys.foreign_keys AS fk
JOIN sys.foreign_key_columns AS fkc ON fkc.constraint_object_id=fk.object_id
JOIN sys.tables AS pt ON pt.object_id=fk.parent_object_id
JOIN sys.schemas AS ps ON ps.schema_id=pt.schema_id
JOIN sys.columns AS pc ON pc.object_id=pt.object_id AND pc.column_id=fkc.parent_column_id
JOIN sys.tables AS rt ON rt.object_id=fk.referenced_object_id
JOIN sys.schemas AS rs ON rs.schema_id=rt.schema_id
JOIN sys.columns AS rc ON rc.object_id=rt.object_id AND rc.column_id=fkc.referenced_column_id
ORDER BY ps.name,pt.name,fk.object_id,fkc.constraint_column_id;
'@
  $metaSql=@'
SELECT CAST(SERVERPROPERTY('ProductMajorVersion') AS int) AS EngineMajorVersion,
       d.compatibility_level AS CompatibilityLevel,d.collation_name AS DatabaseCollation,
       d.is_read_only AS IsReadOnly,d.recovery_model_desc AS RecoveryModel
FROM sys.databases AS d WHERE d.name=DB_NAME();
'@
  $columnTable=$null;$indexTable=$null;$foreignTable=$null;$metaTable=$null
  try{
    foreach($spec in @(
      @{Name='columnTable';Sql=$columnSql},
      @{Name='indexTable';Sql=$indexSql},
      @{Name='foreignTable';Sql=$foreignSql},
      @{Name='metaTable';Sql=$metaSql}
    )){
      $cmd=$connection.CreateCommand();$cmd.CommandText=$spec.Sql;$cmd.CommandTimeout=120
      $adapter=[Data.SqlClient.SqlDataAdapter]::new($cmd);$result=[Data.DataTable]::new()
      try{[void]$adapter.Fill($result)}finally{$adapter.Dispose();$cmd.Dispose()}
      Set-Variable -Name $spec.Name -Value $result -Scope Local
    }
    if($columnTable.Rows.Count -lt 1 -or $columnTable.Rows.Count -gt 200000 -or
       $metaTable.Rows.Count -ne 1){throw 'A02_SCHEMA_SIZE_OR_METADATA_INVALID'}
    $tableMap=[Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal);$tableOrder=[Collections.Generic.List[string]]::new()
    foreach($r in $columnTable.Rows){
      $schema=[string]$r['SchemaName'];$name=[string]$r['TableName']
      $key=(Frame $schema)+(Frame $name)
      if(-not $tableMap.ContainsKey($key)){
        $tableMap[$key]=[ordered]@{
          schema=$schema;name=$name
          columns=[Collections.Generic.List[object]]::new()
          indexes=[Collections.Generic.List[object]]::new()
          foreignKeys=[Collections.Generic.List[object]]::new()
        }
        $tableOrder.Add($key)
      }
      $tableMap[$key].columns.Add([pscustomobject][ordered]@{
        name=[string]$r['ColumnName'];typeSchema=[string]$r['TypeSchemaName']
        dataType=[string]$r['DataType'];ordinal=[int]$r['Ordinal']
        maxLength=[int]$r['MaxLength'];precision=[int]$r['Precision']
        scale=[int]$r['Scale'];nullable=([int]$r['IsNullable'] -eq 1)
        identity=([int]$r['IsIdentity'] -eq 1);computed=([int]$r['IsComputed'] -eq 1)
        collation=if($r['CollationName'] -is [DBNull]){$null}else{[string]$r['CollationName']}
        rowGuid=([int]$r['IsRowGuid'] -eq 1);sparse=([int]$r['IsSparse'] -eq 1)
        fileStream=([int]$r['IsFileStream'] -eq 1)
      })
    }
    $indexMap=[Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
    foreach($r in $indexTable.Rows){
      $tableKey=(Frame ([string]$r['SchemaName']))+(Frame ([string]$r['TableName']))
      $idxKey=$tableKey+(Frame ([string]$r['IndexId']))
      if(-not $tableMap.ContainsKey($tableKey)){throw 'A02_SCHEMA_INDEX_PARENT_MISSING'}
      if(-not $indexMap.ContainsKey($idxKey)){
        $indexMap[$idxKey]=[ordered]@{
          name=[string]$r['IndexName'];indexId=[int]$r['IndexId']
          primaryKey=([int]$r['IsPrimaryKey'] -eq 1)
          unique=([int]$r['IsUnique'] -eq 1);type=[string]$r['IndexType']
          disabled=([int]$r['IsDisabled'] -eq 1);filtered=([int]$r['HasFilter'] -eq 1)
          keyColumns=[Collections.Generic.List[object]]::new()
          includedColumns=[Collections.Generic.List[string]]::new()
        }
        $tableMap[$tableKey].indexes.Add($indexMap[$idxKey])
      }
      if([int]$r['IsIncludedColumn'] -eq 1){
        $indexMap[$idxKey].includedColumns.Add([string]$r['ColumnName'])
      }elseif([int]$r['KeyOrdinal'] -gt 0){
        $indexMap[$idxKey].keyColumns.Add([pscustomobject]@{
          name=[string]$r['ColumnName'];ordinal=[int]$r['KeyOrdinal']
          descending=([int]$r['IsDescendingKey'] -eq 1)
        })
      }
    }
    $foreignMap=[Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
    foreach($r in $foreignTable.Rows){
      $parentKey=(Frame ([string]$r['ParentSchema']))+(Frame ([string]$r['ParentTable']))
      $fkKey=$parentKey+(Frame ([string]$r['ForeignKeyId']))
      if(-not $tableMap.ContainsKey($parentKey)){throw 'A02_SCHEMA_FOREIGN_KEY_PARENT_MISSING'}
      if(-not $foreignMap.ContainsKey($fkKey)){
        $foreignMap[$fkKey]=[ordered]@{
          name=[string]$r['ForeignKeyName']
          referencedSchema=[string]$r['ReferencedSchema']
          referencedTable=[string]$r['ReferencedTable']
          disabled=([int]$r['IsDisabled'] -eq 1)
          notTrusted=([int]$r['IsNotTrusted'] -eq 1)
          deleteAction=[string]$r['DeleteAction'];updateAction=[string]$r['UpdateAction']
          notForReplication=([int]$r['IsNotForReplication'] -eq 1)
          columns=[Collections.Generic.List[object]]::new()
        }
        $tableMap[$parentKey].foreignKeys.Add($foreignMap[$fkKey])
      }
      $foreignMap[$fkKey].columns.Add([pscustomobject]@{
        ordinal=[int]$r['Ordinal'];column=[string]$r['ParentColumn']
        referencedColumn=[string]$r['ReferencedColumn']
      })
    }
    $tables=[Collections.Generic.List[object]]::new()
    foreach($key in $tableOrder){$tables.Add($tableMap[$key])}
    $schemaObject=[ordered]@{tables=$tables}
    $canonical=ConvertTo-Json -InputObject $schemaObject -Depth 20 -Compress
    $sha=[Security.Cryptography.SHA256]::Create()
    try{
      $fingerprint=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical))).Replace('-','').ToLowerInvariant()
    }finally{$sha.Dispose()}
    $columnCount=[int]$columnTable.Rows.Count
    $tableCount=[int]$tables.Count
    $indexCount=0;$primaryCount=0;$foreignCount=0
    foreach($t in $tables){
      foreach($idx in $t.indexes){$indexCount++;if($idx.primaryKey){$primaryCount++}}
      $foreignCount+=$t.foreignKeys.Count
    }
    $manifest=[pscustomobject][ordered]@{
      format='factor-easypro-a02-schema-manifest';formatVersion=1
      generatedUtc=[DateTime]::UtcNow.ToString('o')
      engineMajorVersion=[int]$metaTable.Rows[0]['EngineMajorVersion']
      compatibilityLevel=[int]$metaTable.Rows[0]['CompatibilityLevel']
      databaseCollation=[string]$metaTable.Rows[0]['DatabaseCollation']
      isReadOnly=([int]$metaTable.Rows[0]['IsReadOnly'] -eq 1)
      recoveryModel=[string]$metaTable.Rows[0]['RecoveryModel']
      schemaFingerprintSha256=$fingerprint
      tableCount=$tableCount;columnCount=$columnCount
      uniqueIndexCount=$indexCount;primaryKeyCount=$primaryCount
      foreignKeyCount=$foreignCount
      userRowsRead=$false;databaseModified=$false;canImport=$false
      tables=$tables
    }
    return $manifest
  }finally{
    foreach($item in @($columnTable,$indexTable,$foreignTable,$metaTable)){
      if($null -ne $item){$item.Dispose()}
    }
  }
}
function Read-EncryptedManifest([string]$path){
  $full=Assert-LocalFilePath $path $true
  $raw=[IO.File]::ReadAllBytes($full)
  $headerBytes=[Text.Encoding]::ASCII.GetBytes($script:ManifestHeader)
  if($raw.Length -le ($headerBytes.Length+1)){throw 'A02_PRIVATE_MANIFEST_TRUNCATED'}
  $header=[Text.Encoding]::ASCII.GetString($raw,0,$headerBytes.Length)
  if($header -cne $script:ManifestHeader -or $raw[$headerBytes.Length] -ne 10){
    throw 'A02_PRIVATE_MANIFEST_HEADER_INVALID'
  }
  $cipherLength=$raw.Length-$headerBytes.Length-1
  $cipher=New-Object byte[] $cipherLength
  [Buffer]::BlockCopy($raw,$headerBytes.Length+1,$cipher,0,$cipherLength)
  Add-Type -AssemblyName System.Security -ErrorAction Stop
  $plain=[Security.Cryptography.ProtectedData]::Unprotect(
    $cipher,$script:ManifestEntropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $json=[Text.Encoding]::UTF8.GetString($plain)
  $manifest=$json | ConvertFrom-Json
  if($null -eq $manifest.tables){throw 'A02_PRIVATE_MANIFEST_TABLES_MISSING'}
  $schemaObject=[ordered]@{tables=$manifest.tables}
  $canonical=ConvertTo-Json -InputObject $schemaObject -Depth 20 -Compress
  $sha=[Security.Cryptography.SHA256]::Create()
  try{
    $actualFingerprint=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical))).Replace('-','').ToLowerInvariant()
  }finally{$sha.Dispose()}
  if($actualFingerprint -cne [string]$manifest.schemaFingerprintSha256){
    throw 'A02_PRIVATE_MANIFEST_FINGERPRINT_MISMATCH'
  }
  if($manifest.format -cne 'factor-easypro-a02-schema-manifest' -or
     [int]$manifest.formatVersion -ne 1 -or
     [string]$manifest.schemaFingerprintSha256 -cnotmatch '^[0-9a-f]{64}$' -or
     [int]$manifest.tableCount -lt 1 -or
     [int]$manifest.columnCount -lt 1 -or
     $manifest.userRowsRead -ne $false -or
     $manifest.databaseModified -ne $false -or
     $manifest.canImport -ne $false){
    throw 'A02_PRIVATE_MANIFEST_CONTRACT_INVALID'
  }
  return ,$plain
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
  [pscustomobject]@{
    status='schema-fingerprint-selftest-passed';sqlOpened=$false
    userRowsRead=$false;databaseModified=$false;canImport=$false
  }|ConvertTo-Json -Compress
  return
}

if($Mode -eq 'DecryptManifest'){
  try{
    if([string]::IsNullOrWhiteSpace($InputPath) -or [string]::IsNullOrWhiteSpace($OutputPath)){
      throw 'A02_PRIVATE_MANIFEST_PATHS_REQUIRED'
    }
    $plain=Read-EncryptedManifest $InputPath
    Write-RestrictedFile $OutputPath $plain
    [pscustomobject]@{status='private-schema-manifest-decrypted';plaintextFileAclRestricted=$true;userRowsRead=$false;databaseModified=$false;canImport=$false}|ConvertTo-Json -Compress
  }catch{Write-Error 'A02_PRIVATE_MANIFEST_DECRYPT_FAILED';exit 2}
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
  $manifest=Get-SchemaData $conn
  if($Mode -eq 'Inspect'){
    [pscustomobject]@{
      status='isolated-schema-inventoried'
      fingerprintSha256=$manifest.schemaFingerprintSha256
      tableCount=$manifest.tableCount;columnCount=$manifest.columnCount
      primaryKeyCount=$manifest.primaryKeyCount;foreignKeyCount=$manifest.foreignKeyCount
      userRowsRead=$false;databaseModified=$false;canImport=$false
    }|ConvertTo-Json -Compress
  }else{
    if([string]::IsNullOrWhiteSpace($OutputPath)){throw 'A02_PRIVATE_OUTPUT_PATH_REQUIRED'}
    $json=ConvertTo-Json -InputObject $manifest -Depth 20
    $plain=[Text.Encoding]::UTF8.GetBytes($json)
    if($plain.Length -gt 33554432){throw 'A02_PRIVATE_MANIFEST_TOO_LARGE'}
    Add-Type -AssemblyName System.Security -ErrorAction Stop
    $cipher=[Security.Cryptography.ProtectedData]::Protect(
      $plain,$script:ManifestEntropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $header=[Text.Encoding]::ASCII.GetBytes($script:ManifestHeader)
    $payload=New-Object byte[] ($header.Length+1+$cipher.Length)
    [Buffer]::BlockCopy($header,0,$payload,0,$header.Length)
    $payload[$header.Length]=10
    [Buffer]::BlockCopy($cipher,0,$payload,$header.Length+1,$cipher.Length)
    Write-RestrictedFile $OutputPath $payload
    [pscustomobject]@{
      status='private-schema-manifest-encrypted'
      tableCount=$manifest.tableCount;columnCount=$manifest.columnCount
      primaryKeyCount=$manifest.primaryKeyCount;foreignKeyCount=$manifest.foreignKeyCount
      dpapiScope='CurrentUser';fileAclRestricted=$true
      userRowsRead=$false;databaseModified=$false;canImport=$false
    }|ConvertTo-Json -Compress
  }
}catch{
  Write-Error 'A02_SCHEMA_INVENTORY_OR_PRIVATE_EXPORT_FAILED'
  exit 2
}finally{if($null -ne $conn){$conn.Dispose()}}
