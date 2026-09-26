# installer-smoke — design

- mode: local-only crew lane (parent owns push/PR; lane never pushes or merges)
- ticket: none; scope comes from the crew brief "prove the shipped desktop
  artifact actually runs"
- target ref: `test/installer-smoke` off `develop`
- base SHA: `9ef83ea448676dc5283fe07e08d14659c331697f`
- review tier: Standard (test script plus documentation)

## Problem

Every gate in the repository tests source. `verify-release-assets.mjs` checks
that the portable zip exists and contains `Tuari.exe`, and that the update
manifest verifies. Nothing ever launches the built application, so nothing
proves the bundle is complete, the sidecar starts, the API answers, or the
database is created.

## Deliverable

Two committed files plus this record:

- `scripts/smoke/installer-smoke.mjs`: extracts the portable zip to a temp
  directory, verifies the bundle layout against `tauri.conf.json`
  `bundle.resources`, launches `Tuari.exe`, waits for the sidecar process and
  `/health`, checks the data directory and license state, then shuts both
  processes down and cleans up.
- `scripts/smoke/windows-sidecar-probe.ps1`: enumerates the sidecar process by
  command-line identity and dumps its environment block. Windows only, because
  the environment read needs `NtQueryInformationProcess` plus
  `ReadProcessMemory`.
- `scripts/smoke/sidecar-env-repro.ps1`: launches the bundled sidecar with the
  Rust shell's exact environment allowlist, then again with one extra variable
  per round, to isolate which variable the runtime needs.
- `docs/release-verification.md`: how to build and verify the artifact, what the
  automated checks cover, and the manual remainder.

## Interfaces

- CLI: `--zip`, `--installer`, `--extract-dir`, `--keep`, `--timeout-ms`,
  `--health-port`. Defaults resolve the newest artifacts under
  `apps/desktop/src-tauri/target/release/bundle`.
- Exit code 0 when every check passes, 1 otherwise. One printed line per check.
- The probe script emits one JSON object: `{ sidecars, env, envError }`. It never
  throws, so a locked-down machine degrades to a reported failure instead of a
  crash.

## Dependencies and boundaries

- Reads `apps/desktop/src-tauri/tauri.conf.json` for the declared resources and
  `src/lib.rs` for `API_PORT`, so the script cannot drift from the shell.
- The probe's process match mirrors the Rust `is_api_sidecar_command_line`
  contract: extract directory plus `api-runtime` plus `index.cjs`.
- Never reads, writes, or logs license material or secret values.
  `BETTER_AUTH_SECRET` and `APP_DB_KEY` are reported as present or absent only.
- Writes nothing outside the temp extraction directory except the runtime
  secrets the app itself creates under the roaming app data directory.

## Tests

The smoke script is the test. It is run against a real local build and must
exit 0. It is self-cleaning and safe to re-run: each run uses a new temp
directory, resets the database files when `--extract-dir` is reused, neutralizes
the legacy-data migration by overriding `PUBLIC`, and kills the processes it
started in every exit path. On this build it fails, and the failure is the
defect described in `docs/release-verification.md`.

## Risks

- The environment read uses undocumented ntdll offsets. It is wrapped and
  reported, never assumed, and the runtime env is also inferred from the fresh
  data directory when the read fails.
- `node:sqlite` is experimental in Node 22. It is only used after the app has
  exited, to read `sqlite_master` from a checkpointed database.
- The NSIS installer is validated but not executed; installing is a manual step.

## Out of scope

- Driving the webview or the IPC bridge (needs a UI driver).
- A signed license, so the licensed and encrypted-database paths stay unverified.
- Wiring the script into CI. It needs a Windows desktop session; a follow-up can
  add it to the release workflow after the artifact is built.
