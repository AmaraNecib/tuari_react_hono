# Release verification

Source tests prove the code compiles and behaves. They say nothing about the
artifact a customer installs. This document covers the artifact: how to build
it, how to run the smoke test that launches it, and what still needs a human.

## What runs today, and what it does not prove

| Gate | Proves | Runs in CI |
| --- | --- | --- |
| `pnpm test:api`, `pnpm test:web`, Rust tests | source behaviour | yes |
| `scripts/verify-release-assets.mjs` | the portable zip exists and contains `Tuari.exe`, and the signed update manifest verifies | yes, in the release workflow |
| `scripts/smoke/installer-smoke.mjs` | the built bundle launches, the sidecar starts, `/health` answers, and the app writes a schema-complete SQLite database | no, it needs a Windows desktop session |

The smoke test closes the gap between "the zip contains an exe" and "the exe
runs". It does not replace a human looking at the window.

Current status: the smoke test fails on a locally built artifact. See
"Defects found by the smoke test" at the end for the two blockers and the
verified fix recipe.

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

## Run the smoke test

```bash
node scripts/smoke/installer-smoke.mjs
```

Useful flags:

- `--zip <path>` picks a specific portable zip.
- `--installer <path>` picks a specific NSIS installer.
- `--extract-dir <path> --keep` reuses an already-extracted folder and leaves it
  on disk for inspection.
- `--timeout-ms <n>` raises the sidecar and health wait budget.
- `--health-port <n>` overrides the port, which is otherwise read from
  `apps/desktop/src-tauri/src/lib.rs` so the script cannot drift from the shell.

The script extracts to a fresh directory under the system temp dir, launches the
extracted `Tuari.exe`, waits for the sidecar and the health endpoint, inspects
the process environment and the data directory, then kills the app, kills the
sidecar, confirms the port is free, and removes the temp directory. It exits 0
only when every check passes and prints one line per check.

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
   `TUARI_LICENSE_STATUS` is `trial`.
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

## Defects found by the smoke test (2026-09-26)

The built artifact never starts its API. On a fresh extract, `Tuari.exe` spawns
the sidecar, the sidecar dies during Node startup, and the app exits with code
101 after its 15 second API wait. There are two independent causes, both in
`spawn_api_process` (`apps/desktop/src-tauri/src/lib.rs`).

### 1. `env_clear()` drops `SystemRoot`, so Node aborts in its CSPRNG check

The shell spawns the sidecar with `command.env_clear()` and then sets only its
own allowlist. That drops `SystemRoot`, and the bundled Node 22.23.2 aborts:

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

Fix: re-add `SystemRoot` for the sidecar child on Windows after `env_clear()`.
That keeps the clear-and-allowlist intent while giving the runtime the one
variable its OpenSSL seeding needs.

### 2. The sidecar path keeps the `\\?\` extended-length prefix

Tauri's `resource_dir()` returns a `\\?\`-prefixed path, and the shell passes
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
Fix: strip the `\\?\` prefix before passing the path as the argument.

### Verified fix recipe (not applied here)

Applying both fixes with a temporary local patch and rebuilding makes the smoke
test pass 22/22 with exit 0: sidecar running, `/health` returning
`{"status":"ok"}`, `TUARI_LICENSE_STATUS=trial`, a fresh database with 38 tables
written by this run, and clean shutdown. The patch was not committed, because it
changes the Rust shell and needs its own review, tests, and a `cargo clippy`
pass. The recipe is:

1. After `command.env_clear()`, set `SystemRoot` from the parent environment for
the sidecar child on Windows.
2. Pass the sidecar entry point as a plain `C:\...` path, without the `\\?\`
   prefix that `resource_dir()` carries.

Until both land, the smoke test fails six checks, all traceable to the sidecar
never starting: no sidecar process, no health response, an unobservable
environment, no database, no license handoff, and no schema to read. The bundle
layout, declared resources, installer binary, and cleanup checks pass.

## Other gaps the smoke test surfaced

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
