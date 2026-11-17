# #543 sidecar environment regression

Base: `0a9f35c9ec651cde05a562a84f46fa2367b10beb`
Worktree: `D:/worktrees/tuari_react_hono/t3-10315b64-9d0d7d38fb87b824`
Mode: `focused-local / CI-final-enforced`
Tier: High-assurance, inherited from the startup correction.
Scope: Rust API-child environment configuration in `apps/desktop/src-tauri/src/lib.rs`.

## Finding

The existing tests reconstructed their own `Command` setup. They did not exercise the environment configuration used by `spawn_api_process`, so they could not detect a missing or misordered production `PATH` assignment.

## Design

`configure_api_child_environment` owns the real command environment setup. `spawn_api_process` calls it after preparing the same API, auth, database, config, license, and secret values it already supplied. The helper clears inherited variables first, adds the curated values, keeps inherited `PATH` only in debug builds, and restores `SystemRoot` when the Windows caller supplies it.

The debug and release test cases call that helper and launch an environment probe. They verify retained curated values, one debug `PATH`, no release `PATH`, and removal of stale `NODE_OPTIONS` and parent-secret values. The Windows Node lookup test also calls the same helper. This protects the order and actual caller path rather than a test-only copy.

No desktop runtime behavior is intended to change. The license environment and optional `APP_DB_KEY` retain their existing conditions and override order. No ambient environment or `NODE_OPTIONS` is forwarded. The seam remains private to `lib.rs`; no separate module or public interface is needed.

## Proof and limits

The focused Rust test command was attempted before adding the helper, but Cargo failed while linking dependencies before it compiled this crate or reached the expected red assertion. Drive D had only 2.4 MB free; MSVC reported `LNK1180` and Rust reported OS error 112. The failed attempt is preserved in the heavy-run output. No alternate target directory or cleanup was used. Focused test execution and Clippy remain blocked until disk capacity is available.

Existing #543 reviews carry forward except for this test-adequacy finding. No new review fanout was run in this worker. The normal desktop verifier remains independent in the parent tree and must finish before integration.
