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

Fixed on the `test/installer-smoke` branch by re-setting `SystemRoot` from the
parent environment for the sidecar child on Windows after `env_clear()`.

**Always**: when a desktop shell spawns a bundled runtime with a cleared
environment, restore the variables that runtime's own dependencies need. On
Windows, `SystemRoot` is load-bearing for the OpenSSL CSPRNG seeding Node runs at
startup. `env_clear()` is right for not leaking the parent's secrets, but it
cannot be the whole story for a child runtime.

