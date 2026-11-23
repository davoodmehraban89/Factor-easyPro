# Disposable Windows runner: run only the installed native A08 benchmark using an existing NSIS artifact.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Installer,
      [Parameter(Mandatory=$true)][string]$ExpectedVersion)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') {
  throw 'Targeted native test is restricted to disposable Windows GitHub Actions runners'
}
if ($ExpectedVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid expected version' }
$installerFile=Get-Item -LiteralPath $Installer
if ($installerFile.Length -lt 500000 -or $installerFile.Name -notlike "*$ExpectedVersion*x64-setup.exe") {
  throw 'Installer size/name/version mismatch'
}
$lab=Join-Path $env:RUNNER_TEMP 'factor-a08-targeted-native'
$install=Join-Path $lab 'installed'
$profile=Join-Path $lab 'profile'
$reports=Join-Path $lab 'reports'
New-Item -ItemType Directory -Force $install,$profile,$reports | Out-Null
$report=Join-Path $reports 'benchmark-native-result.json'
$proc=Start-Process -FilePath $installerFile.FullName -ArgumentList @('/S',("/D="+$install)) -PassThru
try {
  if (!$proc.WaitForExit(150000)) { $proc.Kill(); throw 'NSIS installation timeout' }
  if ($proc.ExitCode -ne 0) { throw "NSIS install failed: $($proc.ExitCode)" }
} finally { $proc.Dispose() }
$exe=@(Get-ChildItem $install -Recurse -File | Where-Object { $_.Name -in @('app.exe','Factor-easyPro.exe') })
if ($exe.Count -ne 1 -or $exe[0].Length -lt 300000) { throw 'Installed native executable not verified' }
& node tests/windows-vm-installed-tauri-cdp.cjs $exe[0].FullName $profile benchmark $ExpectedVersion $report
if ($LASTEXITCODE -ne 0) { throw 'Installed WebView2 A08 benchmark failed' }
$result=Get-Content $report -Raw | ConvertFrom-Json
if ($result.status -ne 'PASSED' -or $result.installedNativeTauri -ne $true -or
    $result.nativePerformance.products -ne 10000 -or
    $result.nativePerformance.invoices -ne 50000 -or
    $result.nativePerformance.companyInvoices -ne 50000) {
  throw 'Targeted A08 acceptance incomplete'
}
Write-Host 'Installed native A08 10k/50k benchmark PASSED'
