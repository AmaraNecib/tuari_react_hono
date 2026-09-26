# Desktop packaging wisdom

## `env_clear()` on the sidecar child drops `SystemRoot`, and the bundled Node aborts without it (🔴 Major)

The first end-to-end launch of the built portable artifact exposed a defect that
no source test could catch. `spawn_api_process` in
`apps/desktop/src-tauri/src/lib.rs` spawns the sidecar with
`command.env_clear()` plus a small allowlist. The bundled Node 22.23.2 aborts
during `InitializeOncePerProcessInternal`:

```
Assertion failed: ncrypto::CSPRNG(nullptr, 0)
```

`Tuari.exe` then exits with code 101 after its 15 second API wait, and the app
never serves. The abort text lands in `<root>/data/logs/api-server.log`.

Isolation, run against the extracted bundle: launching `bin/node.exe` with
`bin/api-runtime/dist/index.cjs` and exactly the shell's allowlist reproduces the
abort. Adding `SystemRoot=C:\WINDOWS` makes it start and bind. `windir`, `PATH`,
and `TEMP` do not. `scripts/smoke/sidecar-env-repro.ps1` runs that matrix.

**Always**: when a desktop shell spawns a bundled runtime with a cleared
environment, restore the variables that runtime's own dependencies need. On
Windows, `SystemRoot` is load-bearing for the OpenSSL CSPRNG seeding Node runs at
startup. `env_clear()` is right for not leaking the parent's secrets, but it
cannot be the whole story for a child runtime.

## Tauri's `resource_dir()` carries the `\\?\` prefix, and Node cannot use it as the main script (🔴 Major)

The same launch hid a second blocker. With `SystemRoot` restored, the sidecar got
one step further and died in Node's CommonJS main-module resolution:

```
Error: EISDIR: illegal operation on a directory, lstat 'C:'
    at toRealPath (node:internal/modules/helpers:61:13)
    at Function._findPath (node:internal/modules/cjs/loader:760:22)
```

Tauri's `resource_dir()` returns a `\\?\`-prefixed path on Windows, and the
shell passed `runtime_dir/dist/index.cjs` through unmodified. The prefix is fine
for `CreateProcess` (the exe loads) but breaks `path.resolve` + `realpathSync` in
the loader for the script argument.

**Always**: strip the Windows extended-length prefix (`\\?\`) before handing a
Tauri path to a child process as a script argument. And when two startup
blockers stack, fix and re-run rather than declaring victory after the first one:
the CSPRNG abort in the first defect masked this one entirely.

## Legacy migration preserves mtime, so a file-existence check proves nothing (🟠 Major)

`ensure_runtime_files` migrates an allowlisted legacy database from
`Documents/Tuari` (or `%PUBLIC%\Documents\Tuari`) into the data dir with
`std::fs::copy`, which preserves the source timestamp. A "the app created the
database" assertion that only tests for the file passes on a migrated copy that
is months old, so the smoke test can go green while the sidecar never ran.

**Always**: when proving an app created state, compare the file mtime against the
run start, not just existence. Same rule for any check that a crashed process
could satisfy through a repair or migration path.
