# Record one unmodified portable packaging attempt on an isolated Windows runner.
param(
  [Parameter(Mandatory = $true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $repo
if (Test-Path -LiteralPath $OutputDirectory) { throw "Refusing to overwrite diagnostics: $OutputDirectory" }
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$record = [ordered]@{
  startedUtc = [DateTime]::UtcNow.ToString('o')
  sourceSha = (& git rev-parse HEAD)
  runnerOs = [Environment]::OSVersion.VersionString
  traceStarted = $false
  packagingExitCode = $null
  traceStopExitCode = $null
  error = $null
  outcome = 'not started'
}
$traceOwned = $false
$exitCode = 1
$portableRoot = Join-Path $repo 'apps\desktop\src-tauri\target\release\bundle\portable'
function Save-Snapshot([string]$Name) {
  Get-CimInstance Win32_Process -ErrorAction Continue |
    Select-Object ProcessId, ParentProcessId, Name, ExecutablePath |
    ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $OutputDirectory "$Name-processes.json")
  $paths = @($portableRoot, (Join-Path $portableRoot '.tmp-Tuari-portable'), (Join-Path $portableRoot 'Tuari-portable'), (Join-Path $portableRoot 'Tuari-portable.zip'))
  $items = foreach ($item in $paths) {
    if (Test-Path -LiteralPath $item) {
      Get-Item -LiteralPath $item | Select-Object FullName, Attributes, Length, CreationTimeUtc, LastWriteTimeUtc
    } else { [pscustomobject]@{ FullName = $item; Missing = $true } }
  }
  $items | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $OutputDirectory "$Name-files.json")
}
try {
  $wpr = (Get-Command wpr.exe -ErrorAction Stop).Source
  & $wpr -profiles *> (Join-Path $OutputDirectory 'profiles.log')
  if ($LASTEXITCODE -ne 0) { throw "WPR profile discovery failed with exit $LASTEXITCODE" }
  Save-Snapshot 'before'
  # No cancel: a failed start must not stop another recorder's session.
  & $wpr -start FileIO -start Minifilter -start Handle -filemode *> (Join-Path $OutputDirectory 'trace-start.log')
  if ($LASTEXITCODE -ne 0) { throw "WPR start failed with exit $LASTEXITCODE; packaging was not run." }
  $traceOwned = $true
  $record.traceStarted = $true
  & cmd.exe /d /c 'pnpm --filter @tuari/desktop portable:only' *> (Join-Path $OutputDirectory 'packaging.log')
  $record.packagingExitCode = $LASTEXITCODE
  $exitCode = $LASTEXITCODE
  $record.outcome = if ($exitCode -eq 0) { 'packaging passed; failure not reproduced' } else { 'packaging failed; inspect trace and packaging.log' }
} catch {
  $record.error = $_.Exception.Message
  $record.outcome = 'diagnostic setup or execution failed'
  $_ | Out-String | Set-Content -LiteralPath (Join-Path $OutputDirectory 'wrapper-error.log')
} finally {
  if ($traceOwned) {
    & $wpr -stop (Join-Path $OutputDirectory 'packaging.etl') *> (Join-Path $OutputDirectory 'trace-stop.log')
    $record.traceStopExitCode = $LASTEXITCODE
    if ($LASTEXITCODE -ne 0 -and $exitCode -eq 0) { $exitCode = 1 }
  }
  try { Save-Snapshot 'after' } catch {
    $_ | Out-String | Set-Content -LiteralPath (Join-Path $OutputDirectory 'snapshot-error.log')
    if ($exitCode -eq 0) { $exitCode = 1 }
  }
  $record.endedUtc = [DateTime]::UtcNow.ToString('o')
  $record.exitCode = $exitCode
  $record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'result.json')
  $record | ConvertTo-Json -Depth 4 | Write-Output
}
exit $exitCode
