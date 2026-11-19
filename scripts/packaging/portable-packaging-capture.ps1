param(
  [Parameter(Mandatory = $true)][string]$DiagnosticsDirectory
)

. (Join-Path $PSScriptRoot 'portable-diagnostic-process.ps1')

function Invoke-PortablePackagingCapture {
  param(
    [Parameter(Mandatory = $true)][string]$DiagnosticsDirectory,
    [Parameter(Mandatory = $true)][scriptblock]$PackagingRunner,
    [Parameter(Mandatory = $true)][string]$WprPath,
    [int]$TimeoutSeconds = 15
  )

  $ErrorActionPreference = 'Continue'
  $diagnosticErrors = [System.Collections.Generic.List[string]]::new()
  $wprOwned = $false
  $packageExitCode = 1
  $diagnosticDirectoryReady = $false
  $wprStatusLog = Join-Path $DiagnosticsDirectory 'wpr-status.log'
  $wprStartLog = Join-Path $DiagnosticsDirectory 'wpr-start.log'
  $wprStopLog = Join-Path $DiagnosticsDirectory 'wpr-stop.log'
  $etlPath = Join-Path $DiagnosticsDirectory 'portable-rename.etl'
  $wprInstance = "tuari-portable-$([Guid]::NewGuid().ToString('N'))"

  try {
    New-Item -ItemType Directory -Path $DiagnosticsDirectory -Force -ErrorAction Stop | Out-Null
    $diagnosticDirectoryReady = $true
    $env:TUARI_PORTABLE_DIAGNOSTICS_DIR = $DiagnosticsDirectory
  } catch {
    $diagnosticErrors.Add("diagnostic directory unavailable: $($_.Exception.Message)")
  }

  if ($diagnosticDirectoryReady -and (Test-Path -LiteralPath $WprPath)) {
    $statusResult = Invoke-BoundedDiagnosticProcess -FilePath $WprPath -ArgumentList @('-status', '-instancename', $wprInstance) -TimeoutSeconds $TimeoutSeconds -LogPath $wprStatusLog
    if ($statusResult.Status -ne 'completed') {
      $diagnosticErrors.Add("wpr -status $($statusResult.Status): $($statusResult.Output)")
    } elseif ($statusResult.Output -match 'not recording|no recording') {
      $startResult = Invoke-BoundedDiagnosticProcess -FilePath $WprPath -ArgumentList @('-start', 'FileIO', '-start', 'Handle', '-filemode', '-recordtempto', $DiagnosticsDirectory, '-instancename', $wprInstance) -TimeoutSeconds $TimeoutSeconds -LogPath $wprStartLog
      if ($startResult.Status -eq 'completed') {
        $wprOwned = $true
      } elseif ($startResult.Status -eq 'timeout') {
        $diagnosticErrors.Add('wpr -start timed out; recording state is uncertain, so no stop was issued')
      } else {
        $diagnosticErrors.Add("wpr -start failed: $($startResult.Output)")
      }
    } else {
      $diagnosticErrors.Add('The unique WPR instance name is unexpectedly active; did not stop it')
    }
  } elseif ($diagnosticDirectoryReady) {
    $diagnosticErrors.Add('built-in wpr.exe is unavailable')
  }

  try {
    $packageExitCode = & $PackagingRunner
    if ($null -eq $packageExitCode) { $packageExitCode = 1 }
  } catch {
    $diagnosticErrors.Add("packaging process launch failed: $($_.Exception.Message)")
    $packageExitCode = 1
  } finally {
    if ($wprOwned) {
      $stopResult = Invoke-BoundedDiagnosticProcess -FilePath $WprPath -ArgumentList @('-stop', $etlPath, 'Tuari portable package diagnostic capture', '-instancename', $wprInstance) -TimeoutSeconds $TimeoutSeconds -LogPath $wprStopLog
      if ($stopResult.Status -eq 'timeout') {
        $diagnosticErrors.Add('wpr -stop timed out; recording state is uncertain after terminating the owned WPR subprocess')
      } elseif ($stopResult.Status -ne 'completed') {
        $diagnosticErrors.Add("wpr -stop failed: $($stopResult.Output)")
      }
    }

    if ($diagnosticErrors.Count -gt 0) {
      if ($diagnosticDirectoryReady) {
        $diagnosticErrors | Out-File -LiteralPath (Join-Path $DiagnosticsDirectory 'diagnostic-errors.log') -Encoding utf8 -Append
      }
      $diagnosticErrors | ForEach-Object { Write-Warning $_ }
    }
  }

  return [int]$packageExitCode
}

if ($MyInvocation.InvocationName -ne '.') {
  $wprPath = Join-Path $env:SystemRoot 'System32\wpr.exe'
  $packagingRunner = { & pnpm --filter @tuari/desktop portable:only 2>&1 | ForEach-Object { $_ | Out-Host }; $LASTEXITCODE }
  $packageExitCode = Invoke-PortablePackagingCapture -DiagnosticsDirectory $DiagnosticsDirectory -PackagingRunner $packagingRunner -WprPath $wprPath
  exit $packageExitCode
}
