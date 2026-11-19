function Invoke-BoundedDiagnosticProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList,
    [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
    [Parameter(Mandatory = $true)][string]$LogPath
  )

  $process = $null
  try {
    $stdoutPath = "$LogPath.stdout"
    $stderrPath = "$LogPath.stderr"
    $quotedArguments = @($ArgumentList | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' })
    $process = Start-Process -FilePath $FilePath -ArgumentList $quotedArguments -PassThru -NoNewWindow `
      -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -ErrorAction Stop
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      $process.Kill()
      if (-not $process.WaitForExit(5000)) {
        "TIMEOUT after ${TimeoutSeconds}s; owned PID $($process.Id) did not exit within 5s after termination" |
          Out-File -LiteralPath $LogPath -Encoding utf8
        return [pscustomobject]@{ Status = 'timeout'; ExitCode = $null; ProcessId = $process.Id; Output = '' }
      }
      $output = @(
        if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw }
        if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw }
      ) -join "`n"
      "TIMEOUT after ${TimeoutSeconds}s; terminated owned PID $($process.Id)" | Out-File -LiteralPath $LogPath -Encoding utf8
      return [pscustomobject]@{ Status = 'timeout'; ExitCode = $null; ProcessId = $process.Id; Output = $output }
    }
    $output = @(
      if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw }
      if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw }
    ) -join "`n"
    $output | Out-File -LiteralPath $LogPath -Encoding utf8
    return [pscustomobject]@{ Status = if ($process.ExitCode -eq 0) { 'completed' } else { 'failed' }; ExitCode = $process.ExitCode; ProcessId = $process.Id; Output = $output }
  } catch {
    $message = "LAUNCH ERROR: $($_.Exception.Message)"
    $message | Out-File -LiteralPath $LogPath -Encoding utf8
    return [pscustomobject]@{ Status = 'failed'; ExitCode = $null; ProcessId = $null; Output = $message }
  } finally {
    if ($process) { $process.Dispose() }
  }
}
