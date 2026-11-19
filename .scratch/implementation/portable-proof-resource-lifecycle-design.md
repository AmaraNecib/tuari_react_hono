# Portable proof resource lifecycle

## Scope and evidence

Worktree: `D:/worktrees/tuari_react_hono/t3-0d20285d-cf8d6e18f5438527`.
Base: `4bf5df10d044356ab07bcd69e807ddbbcf88f7e9` (`fix/portable-proof-resource-lifecycle`, prepared from the requested parent revision).
Mode: `focused-local / CI-final-enforced`. Review depth: owner-selected light parent inspection plus one Greptile review after parent publication. No local review sessions, publication, or hosted-gate claims in this worker lane.

The captured Nightly 44607296640 failure report records a fresh destination absent and the candidate present before each attempted publication. Its Restart Manager query reports packaging PID 8468 holding the candidate's `better-sqlite3-multiple-ciphers/prebuilds/win32-x64.node` at the failed rename. This confirms the packaging process held that native DLL. It does not prove the DLL was the only handle blocking the directory rename. The full ETL was not decoded and WPR stop timed out.

## Diagnosis and module choice

`build-portable.mjs` previously imported `runProof` and executed it in the packager. The proof calls `assertSqlcipherPrebuild` and performs runtime probes; closing individual databases does not unload the native addon from the long-lived packager. The direct candidate copy was otherwise verified before rename, and ZIP creation followed the rename.

The chosen seam is one small process adapter: `runPortableProofProcess(scriptPath, { runtimeDir, nodeExe })`. It invokes the existing complete proof CLI in a child and resolves only on its `close` event with exit status zero. Errors, nonzero status and signal termination reject publication. No timeout truncates the proof's existing health and backup budgets. The packaging process never loads the candidate native addon. It retains rename diagnostics, retry behavior, root entries, Shell identity and ZIP selection unchanged.

The lifecycle test checks a distinct proof PID and requires the adapter's close-completion log before candidate publication/archive. Its fixture runs the CLI child and holds it at a barrier until the test releases it. This proves process separation and close ordering, not Windows native-handle ownership. On this Linux worker, Windows Restart Manager and Explorer Shell behavior cannot be proven; the existing Windows tests remain required in CI.

## Verification boundaries

The historical 2fbecc5c rename red was invalid because its destination already existed. Do not cite it as evidence. A correct absent-destination rename can succeed on the developer laptop even when a DLL is mapped. The new test asserts lifecycle, not an assumed rename failure.

No dependencies, tool downloads, version changes, stable release/tag changes, or changes outside packaging source/tests/design are authorized. Parent owns current-head CI acceptance, Greptile 5/5, findings, publication and Nightly monitoring.
