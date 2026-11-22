$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
Set-Location -LiteralPath $root
$evidence = Join-Path $root ('.scratch/reviews/593-temp/native-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $evidence | Out-Null
$node = (Get-Command node).Source
$source = [IO.File]::ReadAllText((Join-Path $root 'apps/desktop/src-tauri/src/lib.rs'))
$start = $source.IndexOf('fn prepare_api_temp_directory(')
$end = $source.IndexOf('fn spawn_api_process(', $start)
$functions = $source.Substring($start, $end - $start)
$harness = @'
use std::path::{Path, PathBuf};
use std::fs::{create_dir_all, remove_file, OpenOptions};
use std::process::Command;
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let temp = prepare_api_temp_directory(Path::new(&args[1])).unwrap();
    for development in [true, false] {
        let mut command = Command::new(&args[2]);
        command.env("TUARI_TEST_SECRET", "must-not-cross");
        configure_api_child_environment(&mut command, development, &temp);
        // Match the existing API integration fixture's writable trial status.
        command.env("TUARI_LICENSE_STATUS", "trial");
        command.args(["node_modules/vitest/vitest.mjs", "run", "--config", &args[3]]);
        assert!(command.status().unwrap().success(), "opening probe failed, development={development}");
    }
}
'@
[IO.File]::WriteAllText((Join-Path $evidence 'probe.rs'), $functions + $harness)
$rootJs = $root.Replace('\', '/')
$config = "export default { test: { include: ['apps/desktop/src-tauri/tests/native-temp-opening.test.ts'], maxWorkers: 1, minWorkers: 1 }, resolve: { alias: { '@orpc/server': '$rootJs/apps/api/node_modules/@orpc/server/dist/index.mjs' } } };"
[IO.File]::WriteAllText((Join-Path $evidence 'vitest.config.mjs'), $config)
$ErrorActionPreference = 'Continue'
$begin = Get-Date
& rustc --edition 2021 (Join-Path $evidence 'probe.rs') -o (Join-Path $evidence 'probe.exe') 2>&1 | Out-File -Encoding utf8 (Join-Path $evidence 'compile.log')
if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $evidence 'compile.log'); exit $LASTEXITCODE }
& (Join-Path $evidence 'probe.exe') $evidence $node (Join-Path $evidence 'vitest.config.mjs') 2>&1 | Out-File -Encoding utf8 (Join-Path $evidence 'run.log')
$code = $LASTEXITCODE
"exit=$code elapsed=$((Get-Date)-$begin) evidence=$evidence" | Add-Content -Encoding utf8 (Join-Path $evidence 'run.log')
Get-Content (Join-Path $evidence 'run.log') -Tail 60
exit $code
