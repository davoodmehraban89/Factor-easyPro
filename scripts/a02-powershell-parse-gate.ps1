#requires -Version 5.1
<#
A02: parser-only guard against accidentally committing malformed PowerShell.
This gate NEVER executes migration scripts, SQL, ZIP input or owner data.
#>
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
try {
  $root=[IO.Path]::GetFullPath($PSScriptRoot)
  $scripts=@(Get-ChildItem -LiteralPath $root -Filter 'a02-*.ps1' -File)
  if($scripts.Count -lt 7 -or $scripts.Count -gt 30){
    throw 'A02_POWERSHELL_SCRIPT_SET_UNEXPECTED'
  }
  foreach($scriptFile in $scripts){
    $tokens=$null
    $errors=$null
    $null=[System.Management.Automation.Language.Parser]::ParseFile(
      $scriptFile.FullName,[ref]$tokens,[ref]$errors)
    if($null -ne $errors -and @($errors).Count -gt 0){
      # Do not print original source lines, path, or diagnostics: future
      # operator scripts could accidentally contain sensitive strings.
      throw 'A02_POWERSHELL_SCRIPT_PARSE_FAILED'
    }
  }
  $tokens=$null
  $errors=$null
  $null=[System.Management.Automation.Language.Parser]::ParseInput(
    'try { Write-Output "broken" ',[ref]$tokens,[ref]$errors)
  if($null -eq $errors -or @($errors).Count -eq 0){
    throw 'A02_POWERSHELL_PARSER_NEGATIVE_CONTROL_FAILED'
  }
  [pscustomobject]@{
    status='a02-all-powershell-parser-gates-passed'
    checkedScripts=$scripts.Count
    malformedSyntheticScriptRejected=$true
    scriptsExecuted=$false
    ownerBackupUsed=$false
    sqlConnected=$false
    canImport=$false
  } | ConvertTo-Json -Compress
}catch{
  Write-Error 'A02_POWERSHELL_PARSE_GATE_FAILED'
  exit 2
}
