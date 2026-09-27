# Release verification

Source tests prove the code compiles and behaves. They say nothing about the
artifact a customer installs. This document covers the artifact: how to build
it, how to run the smoke test that launches it, and what still needs a human.

## What runs today, and what it does not prove

| Gate | Proves | Runs in CI |
| --- | --- | --- |
| `pnpm test:api`, `pnpm test:web`, Rust tests | source behaviour | yes |
| `scripts/verify-release-assets.mjs` | the portable zip exists and contains `Tuari.exe`, and the signed update manifest verifies | yes, in the release workflow |
| `scripts/smoke/installer-smoke.mjs` | the packaged **portable** build launches, the sidecar starts, `/health` answers, and the app writes a schema-complete SQLite database. The NSIS setup file is only checked for existence, a PE header and a hash — it is never executed | yes, at the publish gate (`beta.yml`, `release.yml`, `nightly.yml`) |

The smoke test closes the gap between "the zip contains an exe" and "the exe
runs". It launches the portable layout, which is the same app the installer
unpacks, but it does not run the installer itself and it does not replace a
human looking at the window.

Current status: the smoke test passes 22/22 with exit 0 on a locally built
artifact, and it runs at the publish gate. Two startup blockers it found are
fixed; the story and the remaining known gaps are at the end of this document.

## The publish gate

`beta.yml`, `release.yml`, and `nightly.yml` run this script automatically after
they build and stage the portable zip, and before they create the release. The
step extracts the same `tuari-<version>-<channel>-portable.zip` the release will
upload and passes the staged installer with `--installer`; it never rebuilds.
`ci.yml` does not run it, because the check needs a full desktop build.

The step fails the job on any non-zero exit, so a build whose packaged app cannot
start never reaches a release. The failure modes it reports:

- a staged artifact is missing or too small,
- the bundle is missing `Tuari.exe`, `bin/node.exe`, the `api-runtime` sidecar
  entry, the SQLite native binding, or a declared `bundle.resources` entry,
- `Tuari.exe` exits before the sidecar appears (the exit-101 class from #404),
- the sidecar never starts, never binds the port, or `/health` never returns
  `{"status":"ok"}`,
- the database is missing, carries a legacy mtime, or lacks an expected table,
- the license handoff is not `trial` on a fresh install.

A red installer-smoke step means the artifact is not safe to publish. Read the
failed check in the job log; it names the artifact, the path, or the process
exit code. `verify-release-assets.mjs` passing is not a substitute: it only
proves the zip contains an exe.

The gate needs an interactive Windows session and a same-user, non-elevated
process read for the sidecar environment check. GitHub-hosted `windows-latest`
runners provide both. If the runner lacks a desktop session or the process read
is blocked, the run fails on a named check rather than passing quietly; that is
an infrastructure failure, not proof the installer is broken.

## Build the artifacts

From the repository root, on Windows:

```bash
pnpm install --frozen-lockfile
pnpm --filter @tuari/contracts build
pnpm --filter @tuari/desktop build
pnpm --filter @tuari/desktop portable:only
```

`@tuari/desktop build` runs `build-sidecar.mjs` first. That script builds the
API, copies `dist/` plus the `better-sqlite3` (or `better-sqlite3-sqlcipher`)
native binding into `apps/desktop/src-tauri/bin/api-runtime`, and copies the
current Node binary to `apps/desktop/src-tauri/bin/node.exe`. Tauri then compiles
the Rust shell and runs `pnpm --filter @tuari/web build` for the frontend.

Outputs:

- NSIS installer: `apps/desktop/src-tauri/target/release/bundle/nsis/Tuari_<version>_x64-setup.exe`
- Portable folder: `apps/desktop/src-tauri/target/release/bundle/portable/Tuari-portable/`
- Portable zip: `apps/desktop/src-tauri/target/release/bundle/portable/Tuari-portable.zip`

The portable folder layout is what `installer-smoke.mjs` asserts against:

```
Tuari-portable/
  Tuari.exe
  bin/
    node.exe
    api-runtime/
      package.json
      dist/index.cjs
      node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

The smoke script adds one file of its own to a directory it extracts into:
`.tuari-smoke-extract`, which records the zip it came from and marks the
directory as safe for the script to reset. A portable folder produced by
`portable:only` does not contain it.

## Run the smoke test

```bash
node scripts/smoke/installer-smoke.mjs
```

Useful flags:

- `--zip <path>` picks a specific portable zip.
- `--installer <path>` picks a specific NSIS installer.
- `--extract-dir <path>` reuses a smoke-owned directory instead of a fresh
  temp one. The script writes a `.tuari-smoke-extract` marker into every
  directory it creates, and it refuses to touch a non-empty directory that has
  no marker, even with `--force`.
- `--force` resets a non-empty smoke-owned extract directory (the marker is
  present) by deleting `Tuari.exe`, `bin/`, and `data/` inside it before
  extracting again. It never deletes anything outside that directory.
- `--keep` keeps the extract directory for inspection.
- `--timeout-ms <n>` raises the sidecar and health wait budget.
- `--health-port <n>` overrides the port, which is otherwise read from
  `apps/desktop/src-tauri/src/lib.rs` so the script cannot drift from the shell.

The script extracts to a fresh directory under the system temp dir by default,
launches the extracted `Tuari.exe`, waits for the sidecar and the health
endpoint, inspects the process environment and the data directory, then kills
the app, kills the sidecar, confirms the port is free, and removes the temp
directory. It exits 0 only when every check passes and prints one line per
check.

Preflight runs before anything is launched. If the API port is already in use
the script prints the port owner (pid, image name, command line), records the
failure, aborts, and exits non-zero without starting `Tuari.exe`. That matters
because the shell cleans up stale sidecars by command-line match, so a launch
while another instance owns the port could kill that instance's sidecar. The
extract directory is still cleaned up on the abort path.

The script spawns `Tuari.exe` with `PUBLIC` pointed at a directory that does not
exist. The shell's legacy migration sources its old data from
`%PUBLIC%\Documents\Tuari`, so this makes the migration a no-op and keeps the
first-run checks honest. The database check also compares the file mtime against
the run start, so a future shell change cannot turn a migrated database into a
false pass.

Running it touches one thing outside the temp directory: the Rust shell stores
its runtime secrets under the roaming app data directory (see "Where the app
puts its state" below). A smoke run creates or reuses those secrets exactly like
a normal launch, and never deletes them.

## Checks the smoke test performs

1. Portable zip and NSIS installer exist, are non-empty, and the installer is a
   real PE (`MZ`). Both get a SHA-256 line.
2. The zip contains `Tuari.exe`, `bin/node.exe`, and
   `bin/api-runtime/dist/index.cjs`.
3. A bundled SQLite native binding is present in `bin/api-runtime/node_modules`.
4. Every entry in `tauri.conf.json` `bundle.resources` exists in the extracted
   bundle.
5. Port 4318 is free, then `Tuari.exe` starts and a
   `node.exe ... api-runtime/dist/index.cjs` child appears.
6. The sidecar's environment block holds `API_HOST`, `API_PORT`, `APP_DB_PATH`,
   and a non-empty `BETTER_AUTH_SECRET`. `BETTER_AUTH_SECRET` and `APP_DB_KEY`
   values are never printed.
7. `GET http://127.0.0.1:4318/health` returns `{"status":"ok"}`.
8. `<extract>/data/projects/default/tuari.sqlite` exists with a valid SQLite
   header and an mtime at or after this run's launch, so a legacy database the
   shell migrated in cannot pass as a fresh one. `<extract>/data/clock-tracker.json`
   exists.
9. No `license.lic` exists, so the app ran the no-license path, and
   `TUARI_LICENSE_STATUS` is exactly `trial`. The check reports the observed
   value and edition when it differs, so an `active` handoff on a fresh install
   fails instead of passing.
10. After shutdown, the database opens and holds `user`, `session`, `account`,
    `app_bootstrap_state`, and `employee`.

Check 6 reads the child process environment directly (PowerShell plus
`NtQueryInformationProcess` and `ReadProcessMemory`). The Rust shell spawns the
sidecar with `env_clear()` and a small allowlist, and nothing else exposes that
environment, so this is the only way to observe the handoff. If the read is
blocked the script reports it as a failed check rather than guessing.

## Where the app puts its state

Two different roots, which is easy to get wrong:

- Data and logs follow the executable. The shell checks for
  `bin/node.exe` and `bin/api-runtime/dist/index.cjs` next to the exe
  (`has_portable_runtime_layout`). When both exist it uses `<exe_dir>/data` and
  otherwise `%APPDATA%\com.tuari.desktop\Tuari`. The portable bundle and the
  NSIS install both ship that layout, so both write to the install directory,
  not to `%APPDATA%`.
  - Database: `<root>/data/projects/default/tuari.sqlite`
  - Logs: `<root>/data/logs/api-server.log`
  - Clock tracker and license: `<root>/data/clock-tracker.json` and
    `<root>/data/license.lic`
- Runtime secrets do not follow the executable. `resolve_private_runtime_dir`
  uses the OS app data directory, so they live under
  `%APPDATA%\com.tuari.desktop\runtime\secrets` when the OS keyring is
  unavailable, or in the Windows credential store under
  `com.tuari.desktop.secrets` when it is.

The smoke test relies on the first rule to keep the run hermetic.

## License handoff

The sidecar never reads `license.lic`. The Rust shell reads and verifies it, then
passes a parsed subset as environment variables:
`TUARI_LICENSE_EDITION`, `TUARI_LICENSE_FEATURES`, `TUARI_LICENSE_MAX_USERS`,
`TUARI_LICENSE_CUSTOMER`, `TUARI_LICENSE_EXPIRES_AT`, and `TUARI_LICENSE_STATUS`.
With no license file and a fresh clock tracker the status is `Grace`, which the
shell serializes as `trial`. The API defaults to `trial` when the variable is
absent.

`APP_DB_KEY` is only passed when the active license carries the `encrypted_db`
feature.

## What the smoke test cannot do

Automating these would need a UI driver and a signed license, so they stay
manual:

- The WebView2 render. The script proves the process and the API it talks to, not
  that the login screen appears. Open the app and check the splashscreen hands
  off to the main window, then sign in.
- The install and first-run flow of the NSIS installer itself. The script only
  validates the installer binary. Installing writes to
  `%LOCALAPPDATA%\Programs` and registers an uninstaller, which is not something
  a test should do unattended.
- The desktop IPC bridge (`desktop_api_request`, `activate_license`,
  `check_for_updates`). These need the webview.
- The encrypted-database path. It needs a license with `encrypted_db` and a
  build that includes the `better-sqlite3-sqlcipher` native binding.
- Update download, signature verification, and restart.
- Codesigning and notarisation. The local build is unsigned.

## Defects found and fixed by the smoke test (2026-09-26)

The built artifact never started its API. On a fresh extract, `Tuari.exe` spawned
the sidecar, the sidecar died during Node startup, and the app exited with code
101 after its 15 second API wait. There were two independent causes, both in
`spawn_api_process` (`apps/desktop/src-tauri/src/lib.rs`). Both are fixed; the
fix commit predates the doc update that replaced this section.

### 1. `env_clear()` drops `SystemRoot`, so Node aborts in its CSPRNG check

The shell spawns the sidecar with `command.env_clear()` and then sets only its
own allowlist. That dropped `SystemRoot`, and the bundled Node 22.23.2 aborted:

```
#  <extract>\bin\node.exe[5148]: ... node::InitializeOncePerProcessInternal
#  Assertion failed: ncrypto::CSPRNG(nullptr, 0)
```

`scripts/smoke/sidecar-env-repro.ps1` starts the bundled sidecar with exactly the
shell's allowlist and then adds one variable per round:

```powershell
pwsh -NoProfile -File scripts/smoke/sidecar-env-repro.ps1 -ExtractDir <extracted portable dir>
```

| Variables added to the shell allowlist | Result |
| --- | --- |
| none | abort, `Assertion failed: ncrypto::CSPRNG(nullptr, 0)` |
| `SystemRoot=C:\WINDOWS` | starts, `API listening on http://127.0.0.1:4318` |
| `windir=C:\WINDOWS` | abort |
| `PATH=C:\WINDOWS\system32;C:\WINDOWS` | abort |
| `TEMP=<temp dir>` | abort |

Fixed with the smallest set that works: `SystemRoot` alone is re-set from the
parent environment for the sidecar child on Windows, after `env_clear()`. That
keeps the clear-and-allowlist intent while giving the runtime the one variable
its OpenSSL seeding needs. The code comment names the abort it prevents, and the
repro script is the artifact-level proof.

### 2. The sidecar path kept the `\\?\` extended-length prefix

Tauri's `resource_dir()` returns a `\\?\`-prefixed path, and the shell passed
`runtime_dir/dist/index.cjs` straight to `node.exe`. Node's CommonJS main-module
resolution cannot handle that prefix:

```
Error: EISDIR: illegal operation on a directory, lstat 'C:'
    at toRealPath (node:internal/modules/helpers:61:13)
    at Function._findPath (node:internal/modules/cjs/loader:760:22)
    at resolveMainPath (node:internal/modules/cjs/loader:39:23)
```

Reproduction, against the extracted bundle. Same environment, same node binary,
only the argument differs:

| Main-script argument | Result |
| --- | --- |
| `C:\...\bin\api-runtime\dist\index.cjs` | starts, binds the port |
| `\\?\C:\...\bin\api-runtime\dist\index.cjs` | exits with the `EISDIR` above |

Defect 1 hid this one: the process aborted before module resolution ever ran.
Fixed by extracting the prefix strip into a pure helper,
`strip_windows_extended_path_prefix`, with a unit test covering a verbatim drive
path, a verbatim UNC path, and an already-plain path. The helper is a no-op on
POSIX and on plain Windows paths.

### Result after both fixes

`node scripts/smoke/installer-smoke.mjs` exits 0 with 22/22 checks: sidecar
running, `GET /health` returning `{"status":"ok"}`, `TUARI_LICENSE_STATUS=trial`,
`TUARI_LICENSE_EDITION=standard`, `APP_DB_KEY` absent, a fresh 38-table database
written by this run, and clean shutdown. `cargo test` and
`cargo clippy --lib -- -D warnings` are green on the fix commit.

## Known gaps

These are real but out of scope for the smoke-test lane. They are reported to the
parent as separate issues.

- The sidecar build falls back to plain `better-sqlite3` when the
  `better-sqlite3-sqlcipher` native binding is not present, and it prints a
  warning rather than failing. The portable artifact then ships without
  encryption support, so a customer with the `encrypted_db` feature would get
  `APP_DB_KEY` set and a driver that cannot use it. The build should fail, or at
  least the packaging step should record which driver was bundled.
- `cleanup_stale_api_processes` kills any `node.exe` whose command line contains
  `api-runtime` and `index.cjs`, regardless of install path. Launching the
  portable build kills a running installed build's sidecar.
- The shell migrates a legacy database from `Documents/Tuari` into the data dir
  with `std::fs::copy`, which preserves the source mtime. That is deliberate
  product behaviour, but it means a first-run check must neutralize the source
  (the smoke test overrides `PUBLIC`) or compare mtimes.
