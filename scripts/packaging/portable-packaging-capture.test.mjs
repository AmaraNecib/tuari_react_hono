import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const diagnosticsScript = path.join(repoRoot, "apps/desktop/scripts/portable-rename-diagnostics.ps1");
const captureScript = path.join(repoRoot, "scripts/packaging/portable-packaging-capture.ps1");
const processHelper = path.join(repoRoot, "scripts/packaging/portable-diagnostic-process.ps1");
const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";

test("Restart Manager preserves signed FILETIME halves and projects only returned entries", { skip: !existsSync(diagnosticsScript) || (process.platform !== "win32" && !existsSync("/usr/bin/pwsh")) }, t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tuari-rm-projection-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const existingFile = path.join(root, "resource.txt");
  writeFileSync(existingFile, "resource");
  const base64 = Buffer.from(existingFile, "utf8").toString("base64");
  const script = path.join(root, "run.ps1");
  writeFileSync(script, `
    $ErrorActionPreference = 'Stop'
    . '${diagnosticsScript.replaceAll("'", "''")}' -Candidate $args[0] -Final $args[0] -ResourcesBase64 '${base64}' -ProbeOwners | Out-Null
    $value = New-Object System.Runtime.InteropServices.ComTypes.FILETIME
    $value.dwHighDateTime = 0x01D5C036
    $value.dwLowDateTime = -2147483648
    $actual = [TuariRestartManager]::FileTimeUtc($value).ToString('o')
    if ($actual -ne '2020-01-01T00:00:38.5548288Z') { throw "FILETIME mismatch: $actual" }
    $allocated = New-Object 'TuariRestartManager+RM_PROCESS_INFO[]' 3
    $returned = [TuariRestartManager]::ReturnedEntries($allocated, 0)
    if ($returned.Length -ne 0) { throw "Returned-count projection emitted $($returned.Length) default entries" }
    'PASS FILETIME negative-low and returned-count projection'
  `);
  const result = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, existingFile], { encoding: "utf8", timeout: 20_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS FILETIME negative-low and returned-count projection/);
});

test("capture keeps packaging exit and reaches evidence handling after diagnostic timeout or failure", { skip: process.platform !== "win32" }, t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tuari-capture-contract-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const script = path.join(root, "run.ps1");
  writeFileSync(script, `
    $ErrorActionPreference = 'Stop'
    . '${captureScript.replaceAll("'", "''")}' -DiagnosticsDirectory $args[0]
    function Invoke-BoundedDiagnosticProcess {
      param($FilePath, $ArgumentList, $TimeoutSeconds, $LogPath)
      $phase = $ArgumentList[0]
      $status = if ($phase -eq '-status') { 'completed' } elseif ($phase -eq '-start' -and $env:CASE -eq 'timeout') { 'timeout' } elseif ($phase -eq '-start' -and $env:CASE -eq 'nonzero') { 'failed' } else { 'completed' }
      $output = if ($phase -eq '-status') { 'not recording' } else { '' }
      [pscustomobject]@{ Status = $status; ExitCode = if ($status -eq 'failed') { 7 } else { 0 }; ProcessId = 99; Output = $output } | ConvertTo-Json -Compress | Out-File -LiteralPath $LogPath -Append
      return [pscustomobject]@{ Status = $status; ExitCode = if ($status -eq 'failed') { 7 } else { 0 }; ProcessId = 99; Output = $output }
    }
    foreach ($case in @('timeout', 'nonzero', 'success')) {
      $env:CASE = $case
      $dir = Join-Path $args[0] $case
      $marker = Join-Path $dir 'evidence-handled.txt'
      $runner = { New-Item -ItemType Directory -Path $dir -Force | Out-Null; 'evidence handled' | Out-File -LiteralPath $marker; 23 }.GetNewClosure()
      $code = Invoke-PortablePackagingCapture -DiagnosticsDirectory $dir -PackagingRunner $runner -WprPath (Join-Path $PSHOME 'powershell.exe') -TimeoutSeconds 1
      if ($code -ne 23) { throw "package exit changed for $($case): $code" }
      if (-not (Test-Path -LiteralPath $marker)) { throw "later evidence handling did not run for $case" }
      if ($case -eq 'timeout' -and -not (Select-String -LiteralPath (Join-Path $dir 'diagnostic-errors.log') -Pattern 'recording state is uncertain' -Quiet)) { throw 'start timeout uncertainty was not logged' }
      if ($case -eq 'nonzero' -and -not (Select-String -LiteralPath (Join-Path $dir 'diagnostic-errors.log') -Pattern 'wpr -start failed' -Quiet)) { throw 'nonzero start was not logged' }
      if ($case -eq 'success' -and -not (Test-Path -LiteralPath (Join-Path $dir 'wpr-stop.log'))) { throw 'successful diagnostics did not stop the owned trace' }
    }
    'PASS timeout, nonzero and successful diagnostics preserve package exit 23'
  `);
  const result = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, root], { encoding: "utf8", timeout: 20_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS timeout, nonzero and successful diagnostics preserve package exit 23/);
});

test("bounded diagnostic runner terminates only its stalled owned process", { skip: process.platform !== "win32" }, t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tuari bounded-command-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const stalled = path.join(root, "stalled.ps1");
  const testScript = path.join(root, "run.ps1");
  writeFileSync(stalled, "Start-Sleep -Seconds 15\n");
  writeFileSync(testScript, `
    $ErrorActionPreference = 'Stop'
    . '${processHelper.replaceAll("'", "''")}'
    $result = Invoke-BoundedDiagnosticProcess -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '${stalled.replaceAll("'", "''")}') -TimeoutSeconds 1 -LogPath '${path.join(root, "timeout.log").replaceAll("'", "''")}'
    try {
      if ($result.Status -ne 'timeout' -or -not (Test-Path '${path.join(root, "timeout.log").replaceAll("'", "''")}')) { throw "Expected timeout result, got $($result.Status)" }
      'PASS owned process timeout'
    } finally {
      if ($result.ProcessId) {
        $owned = Get-Process -Id $result.ProcessId -ErrorAction SilentlyContinue
        if ($owned) { $owned.Kill(); [void]$owned.WaitForExit(5000); $owned.Dispose() }
      }
    }
  `);
  const result = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", testScript], { encoding: "utf8", timeout: 25_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS owned process timeout/);
});
