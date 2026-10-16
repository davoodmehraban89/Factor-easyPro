[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Installer,
  [string]$ExpectedVersion = '2.0.3'
)
$ErrorActionPreference = 'Stop'
if ($env:RUNNER_OS -ne 'Windows' -or !$env:GITHUB_ACTIONS) {
  throw 'This test only runs inside a disposable Windows GitHub Actions VM'
}
$root = Join-Path $env:RUNNER_TEMP 'factor-fast-native-backup-lab'
$install = Join-Path $root 'installed'
$profile = Join-Path $root 'webview2-profile'
$reportDir = Join-Path $root 'reports'
New-Item -ItemType Directory -Force -Path $install,$profile,$reportDir | Out-Null
if (!(Test-Path -LiteralPath $Installer)) { throw 'Preview installer missing' }
$hash = (Get-FileHash -Path $Installer -Algorithm SHA256).Hash
Write-Host ("Using prebuilt NSIS artifact checksum SHA256: " + $hash)
$installerProcess = Start-Process -FilePath $Installer -ArgumentList @('/S',("/D="+$install)) -PassThru
try {
  if (!$installerProcess.WaitForExit(120000)) { $installerProcess.Kill(); throw 'NSIS timeout' }
  if ($installerProcess.ExitCode -ne 0) { throw "NSIS exited $($installerProcess.ExitCode)" }
} finally { $installerProcess.Dispose() }
$exe = @(Get-ChildItem -LiteralPath $install -File -Recurse |
  Where-Object { $_.Name -in @('app.exe','Factor-easyPro.exe') })[0]
if (!$exe) { throw 'Installed native app EXE missing' }
$report = Join-Path $reportDir 'fast-native-company-backup.json'
& node tests/windows-vm-installed-tauri-cdp.cjs $exe.FullName $profile fresh $ExpectedVersion $report | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Fast native company-backup smoke failed (exit $LASTEXITCODE)" }
$result = Get-Content $report -Raw | ConvertFrom-Json
if ($result.status -ne 'PASSED' -or !$result.encryptedCompanyBackup) {
  throw 'Encrypted company backup did not pass native WebView2 smoke'
}
Write-Host 'Prebuilt NSIS native encrypted backup smoke succeeded.'
