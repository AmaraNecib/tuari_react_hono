# sidecar-env-repro.ps1 — isolate why the bundled API sidecar fails to start.
#
# The Rust shell spawns the sidecar with `command.env_clear()` and then sets only
# its own allowlist of variables. This script launches the bundled node.exe plus
# the bundled api-runtime with exactly that allowlist, then repeats the launch
# with one extra variable per round, so it can show which variable the runtime
# actually needs.
#
# Expected result on Windows with the Node 22 build this repo ships:
#   none        -> abort, "Assertion failed: ncrypto::CSPRNG(nullptr, 0)"
#   SystemRoot  -> starts and prints "API listening on http://127.0.0.1:<port>"
#
# Exit code 0 when that pattern reproduces, 1 when it does not.
#
# Usage:
#   pwsh -NoProfile -File scripts/smoke/sidecar-env-repro.ps1 -ExtractDir <extracted portable dir>
param(
  [Parameter(Mandatory = $true)][string]$ExtractDir,
  [int]$Port = 4387
)

$ErrorActionPreference = 'Stop'

$nodePath = Join-Path $ExtractDir 'bin\node.exe'
$sidecarPath = Join-Path $ExtractDir 'bin\api-runtime\dist\index.cjs'
$sidecarDir = Join-Path $ExtractDir 'bin\api-runtime'

foreach ($required in @($nodePath, $sidecarPath)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Missing $required. Extract the portable zip first."
  }
}

$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ("tuari-sidecar-repro-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $scratch 'projects\default') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $scratch 'projects\default\attachments\invoices') -Force | Out-Null

$dbPath = Join-Path $scratch 'projects\default\tuari.sqlite'
$dbUrl = 'file:' + $dbPath.Replace('\', '/')

# The same allowlist the Rust shell sets, with a secret that passes the API's
# entropy gate so the "starts" case reaches the bind.
$baseEnv = [ordered]@{
  API_HOST                  = '127.0.0.1'
  API_PORT                  = [string]$Port
  ALLOWED_ORIGINS           = 'http://localhost:1420,http://127.0.0.1:1420,http://tauri.localhost,https://tauri.localhost,tauri://localhost'
  BETTER_AUTH_SECRET        = '4f3a9c1e7b2d8056af16e93c4d7b20185e6f9a3c1b7d4e8206f5a9c3d1e7b402'
  BETTER_AUTH_URL           = "http://127.0.0.1:$Port"
  AUTH_DB_PATH              = $dbPath
  APP_DB_PATH               = $dbPath
  APP_ATTACHMENTS_ROOT      = Join-Path $scratch 'projects\default\attachments\invoices'
  DATABASE_URL              = $dbUrl
  TUARI_CONFIG_FILE         = Join-Path $scratch 'config.json'
  TUARI_LICENSE_EDITION     = 'standard'
  TUARI_LICENSE_FEATURES    = ''
  TUARI_LICENSE_MAX_USERS   = '1'
  TUARI_LICENSE_CUSTOMER    = 'null'
  TUARI_LICENSE_EXPIRES_AT  = ''
  TUARI_LICENSE_STATUS      = 'trial'
}

$variants = @(
  @{ Name = 'none'; Extra = @{} },
  @{ Name = 'SystemRoot'; Extra = @{ SystemRoot = $env:SystemRoot } },
  @{ Name = 'windir'; Extra = @{ windir = $env:SystemRoot } },
  @{ Name = 'PATH'; Extra = @{ PATH = (Join-Path $env:SystemRoot 'system32') + ';' + $env:SystemRoot } },
  @{ Name = 'TEMP'; Extra = @{ TEMP = [System.IO.Path]::GetTempPath() } }
)

$results = [ordered]@{}

foreach ($variant in $variants) {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $nodePath
  $psi.Arguments = '"' + $sidecarPath + '"'
  $psi.WorkingDirectory = $sidecarDir
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.EnvironmentVariables.Clear()
  foreach ($key in $baseEnv.Keys) {
    $psi.EnvironmentVariables[$key] = $baseEnv[$key]
  }
  foreach ($key in $variant.Extra.Keys) {
    $psi.EnvironmentVariables[$key] = $variant.Extra[$key]
  }

  $process = [System.Diagnostics.Process]::Start($psi)
  $exited = $process.WaitForExit(8000)

  if (-not $exited) {
    $process.Kill()
    $process.WaitForExit()
    $verdict = 'STARTED'
  }
  else {
    $stderrText = $process.StandardError.ReadToEnd()
    if ($stderrText -match 'ncrypto::CSPRNG') {
      $verdict = 'ABORT_CSPRNG'
    }
    else {
      $firstLine = ($stderrText -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
      if (-not $firstLine) { $firstLine = "exit code $($process.ExitCode)" }
      $verdict = "EXITED: $firstLine"
    }
  }

  $results[$variant.Name] = $verdict
  Write-Output ("{0,-12} -> {1}" -f $variant.Name, $verdict)
}

Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue

$reproduced = ($results['none'] -eq 'ABORT_CSPRNG') -and ($results['SystemRoot'] -eq 'STARTED')
if ($reproduced) {
  Write-Output ''
  Write-Output 'REPRODUCED: the sidecar needs SystemRoot in its environment; env_clear() removes it.'
  exit 0
}

Write-Output ''
Write-Output 'NOT REPRODUCED: this node build started without SystemRoot or failed for another reason.'
exit 1
