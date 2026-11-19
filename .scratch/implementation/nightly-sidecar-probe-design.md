# Nightly sidecar process-probe correction

## Spec

Fix the Windows installer smoke's process identification failure without weakening the shipped-artifact, process ownership, same-user environment, encryption, database, licensing, or cleanup checks. Keep process discovery tied to the exact extracted runtime's `bin/api-runtime/dist/index.cjs`; never infer ownership from a shared port or a generic `node.exe` process. Distinguish an empty process result from a CIM/probe error in diagnostics.

## Base and scope

- Worktree: `D:/worktrees/tuari_react_hono/t3-d5877603-ebcc1d653b67f829`
- Base: `3f909c9c1ffc7e0676e55ad139822554a321e84` (integrates prior probe fix `36138aef` on `39f133ef`)
- Parent source tree: `D:/worktrees/tuari_react_hono/t3-412838f5-c2c7983838174217` (read-only)
- Verification: `focused-local / CI-final-enforced` (ruleset 26837184, strict active, no bypass)
- Review tier: bounded, owner-authorized Greptile plus light parent inspection; no delegated/local review lenses.

## Reachable risk

If Windows returns an 8.3 short-path alias in a process command line while the smoke passes the long path as `-ExtractDir`, the existing substring comparison misses the exact owned process. The smoke then cannot observe the child's environment or license handoff and may fail cleanup while the native module remains loaded. Separately, silently suppressed CIM failures can look like an empty process list. A fix that falls back to a port or process name could target unrelated user processes, so identity must remain exact to the runtime entry path.

## Evidence and hypothesis test

Hosted Nightly run `https://github.com/AmaraNecib/tuari_react_hono/actions/runs/44481070141`, job `135413143131`, failed at merged base `39f133efcaaac195113e072b18d50747825d5e58`: the API log, health response and fresh database/schema show the app ran, while the process/env/license probes found no PID; cleanup then hit EPERM unlinking the loaded SQLCipher binding. The preserved source log is the parent's `.scratch/sessions/nightly-44481070141.log` and is read-only.

A deterministic Windows reproduction starts a fixture Node process whose command line uses the actual short alias for a temporary root, then invokes the production PowerShell probe against both aliases. Before the fix, the exact process is missed for the long root (zero matches) and found for the short root (one match). This discriminates path alias mismatch from a general process start failure or JSON/CIM invocation failure. The probe and harness are smoke-test tooling only; this synthetic test is not proof of a passing native Nightly artifact run.

## Design and second proven cause

The first fix keeps the Windows process probe tied to the exact `bin/api-runtime/dist/index.cjs` path, accounts for Win32 short/long aliases, preserves the same-user PEB environment read, and reports CIM failures through `envError`. Its regression uses fixture processes and is registered in nightly, beta and release workflows.

The independent cleanup failure is a loaded native DLL: `installer-smoke.mjs` called `assertSqlcipherPrebuild` in its own Node process. The helper correctly selects the package's shipped prebuild, loads the actual binding, runs `SELECT 1`, and closes the database, but Windows keeps the `.node` DLL mapped until that process exits. The smoke's final extraction cleanup then gets `EPERM` deleting the binary.

Only the installer-smoke call now uses `sqlcipher-prebuild-subprocess.mjs`. The child calls the existing `assertSqlcipherPrebuild` unchanged, so package-selected shipped-prebuild resolution and actual binding load/query remain required. It reports the binary path on success; the parent surfaces stderr and the child's exit code on failure. The child exits before smoke cleanup. Other helper callers stay in-process. Do not weaken artifact/native/SQLCipher/environment/identity checks or production app behavior.

The focused Node test copies the real installed dependency into a disposable owned fixture, validates the copied native package in the subprocess, then deletes the fixture from the test process. Negative cases assert missing shipped prebuild and invalid package diagnostics fail closed. The test is registered beside the existing Windows process-probe test and before installer smoke in nightly, beta and release workflows. If dependencies are absent, the native-copy case skips explicitly; a skip is not native-lock proof.

## Changed interface/seam

The Windows process probe's external interface remains `{ sidecars, env, envError }`. The SQLCipher validation boundary for installer smoke moves from the main process to a short-lived child process; the existing native validation helper and all unrelated callers remain unchanged. This small subprocess adapter provides the resource-release behavior at the artifact-cleanup seam.

## Wisdom

Applied: desktop migration lesson (mtime is not process proof); the historical sidecar startup lessons (test the actual bundled runtime and do not replace artifact proof with source proof); SQLCipher lesson (load a real shipped prebuild, not a mock). The native-DLL lock is confirmed by the task's Windows log and mechanism, not a wisdom entry. No lesson candidate; this is a separate confirmed cause.
