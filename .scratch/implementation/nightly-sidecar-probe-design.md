# Nightly sidecar process-probe correction

## Spec

Fix the Windows installer smoke's process identification failure without weakening the shipped-artifact, process ownership, same-user environment, encryption, database, licensing, or cleanup checks. Keep process discovery tied to the exact extracted runtime's `bin/api-runtime/dist/index.cjs`; never infer ownership from a shared port or a generic `node.exe` process. Distinguish an empty process result from a CIM/probe error in diagnostics.

## Base and scope

- Worktree: `D:/worktrees/tuari_react_hono/t3-abf99936-7c2451f2ba3a0efc`
- Base: `39f133efcaaac195113e072b18d50747825d5e58` (`origin/develop`, supplied)
- Parent branch: `fix/nightly-sidecar-process-probe`
- Verification: `focused-local / CI-final-enforced` (parent inspected ruleset 26837184, strict acceptance app 15368, no bypass)
- Review tier: bounded, owner-authorized Greptile plus light parent inspection; no delegated/local review lenses.

## Reachable risk

If Windows returns an 8.3 short-path alias in a process command line while the smoke passes the long path as `-ExtractDir`, the existing substring comparison misses the exact owned process. The smoke then cannot observe the child's environment or license handoff and may fail cleanup while the native module remains loaded. Separately, silently suppressed CIM failures can look like an empty process list. A fix that falls back to a port or process name could target unrelated user processes, so identity must remain exact to the runtime entry path.

## Evidence and hypothesis test

Hosted Nightly run `https://github.com/AmaraNecib/tuari_react_hono/actions/runs/44481070141`, job `135413143131`, failed at merged base `39f133efcaaac195113e072b18d50747825d5e58`: the API log, health response and fresh database/schema show the app ran, while the process/env/license probes found no PID; cleanup then hit EPERM unlinking the loaded SQLCipher binding. The preserved source log is the parent's `.scratch/sessions/nightly-44481070141.log` and is read-only.

A deterministic Windows reproduction starts a fixture Node process whose command line uses the actual short alias for a temporary root, then invokes the production PowerShell probe against both aliases. Before the fix, the exact process is missed for the long root (zero matches) and found for the short root (one match). This discriminates path alias mismatch from a general process start failure or JSON/CIM invocation failure. The probe and harness are smoke-test tooling only; this synthetic test is not proof of a passing native Nightly artifact run.

## Design

At the existing PowerShell inspection seam, compare the command line against the supplied root in its original, Win32-resolved short, and Win32-resolved long forms. Match the complete `bin/api-runtime/dist/index.cjs` entry path and retain both layout markers. Keep the same-user PEB environment read unchanged. Let CIM enumeration failures reach the existing structured `envError` response rather than suppressing them. In the Node smoke, include a probe error in the failed process-discovery diagnostic and avoid wording that asserts the sidecar never started when inspection itself failed.

A Windows-only focused regression runs the actual probe against fixture processes using opposite path spellings, verifies their exact PIDs, rejects a parent-root prefix match, and terminates only the fixture PIDs. CI registers this test before the actual installer smoke in nightly, beta, and release artifact workflows. Do not weaken artifact/native/SQLCipher/environment/identity checks or production app behavior.

## Changed interface/seam

The process probe's external interface remains `{ sidecars, env, envError }`. The implementation changes only path-spelling equivalence and error reporting. The installer smoke continues consuming this structured result; no architecture seam moves.

## Wisdom

Applied: desktop migration lesson (mtime is not process proof); the two historical sidecar startup lessons (keep testing the actual bundled runtime path and do not replace artifact proof with source proof); PowerShell-by-file lesson (all Windows PowerShell runs use saved `.ps1` files); Windows native binding lock lesson (cleanup must follow process termination). No lesson candidate; this is a new environment-specific alias diagnosis, not yet a repeated pattern.
