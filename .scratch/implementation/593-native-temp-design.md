# Native writable temporary directory

Worktree: `D:/worktrees/tuari_react_hono/t3-2ecdc675-21afd037d8275a6c`.
Base: `f862ffad9f026d07e01c1c1a266ff673c7b31d5d`.
Tier: High-assurance. Mode: focused-local / CI-final-pending. Local-only worker; publication, independent review and acceptance belong to the parent.

## Evidence and scope

The parent's `.scratch/video/593/diagnosis/causal-result.md` and `causal-run2.log` show the live native pending opening failed at debt_command INSERT with SQLITE_CANTOPEN, then committed after a grouped TEMP/TMP/SQLITE_TMPDIR writable-directory intervention. Neither the individual variable nor failing filename was isolated. Earlier standalone probes passed. Do not treat a synthetic passing harness as a reproduced failing native baseline.

Recovered the failed worker's intended change by inspecting its uncommitted diff and design without editing its tree. Retained its three-variable allowlist and app-owned runtime location. Replaced its fixed `.write-probe` with an exclusive process/time/counter probe, a real byte write, close and owned-probe removal. An interrupted fixed probe must not permanently block startup.

## Interface and ownership

`prepare_api_temp_directory(runtime_dir)` creates and verifies the app-owned `runtime/temp`, rejects a final symlink/non-directory, canonicalizes the path and returns bounded operation/OS errors before API spawn. It does not claim protection against a hostile same-user filesystem race or introduce a new ACL policy. Existing app-data ownership is unchanged.

`configure_api_child_environment` retains env_clear, Windows SystemRoot and development-only PATH. TEMP, TMP and SQLITE_TMPDIR are explicit in both modes. No parent secrets, finance SQL, schema, dependencies or broad environment inheritance change.

Vocabulary: runtime temporary directory is a native startup resource, not finance state. No domain term changed. The private helper owns filesystem probing; the child-environment seam owns its allowlist. The deletion test puts that complexity back in startup, not multiple callers. Parent architecture/security review remains required.

## Focused proof

Tests were added to unchanged implementation first. Expected red was compilation failure for missing helper and three-argument environment interface (cargo exit 101, 8.56 seconds). This is interface-red, not a claim of reproducing SQLITE_CANTOPEN.

Three new Rust tests cover writable creation/reuse, preservation of an unrelated stale probe, invalid-file refusal, explicit environment values and actual child writes/secret exclusion in both modes. Two existing process tests retain development Node lookup and release PATH/secret exclusion. All five pass. Clippy exits zero with existing warnings outside changed code. Formatting was limited to changed regions; unrelated rustfmt traversal edits were reverted.

The narrow PowerShell harness extracts the actual Rust helper/environment functions, compiles a standalone launcher and invokes Node/Vitest under those cleared environments. Existing frozen dependencies and a required contracts build are used. It sets the existing API integration fixture's explicit trial status, not a production license bypass. Each mode creates a fresh synthetic database, authenticates through the real router, reviews 2000 wages/300 advance, replays the identical request and independently verifies 200000/30000 minor units, two sources and four debt commands after close. Both modes pass. A first harness attempt failed at license gating before the opening because the fixture status was omitted; that failed evidence is preserved.

This is a fresh application-root/RPC integration, not a packaged release build or WebView test. Release-like means the release allowlist branch with absolute Node, not an optimized release executable. Original demo process/database were untouched. Parent must still run fresh native A/B acceptance, obtain independent startup/security review and record the full native walkthrough. Owner acceptance and merge remain prohibited/pending.

Applied lesson: env_clear requires explicit runtime dependency variables, including SystemRoot; do not restore arbitrary parent inheritance. Candidate lesson for parent: use uniquely owned writable probes so interrupted startup cannot poison future startups.
