# PR #543: Preserve the sidecar's SQLite temp directory

## Scope and risk

Worktree: `D:/worktrees/tuari_react_hono/feat-issue-427-independ-2565729f7d01eaa8`

Base: `943b019716687a1eb0defc6002ffc80d5e3f5e5f`

Verification mode: focused-local / CI-final-pending. Review tier: high-assurance, because a reachable Windows payroll approval write fails before persistence. This changes no payroll contract or transaction behavior.

## Diagnosis

`spawn_api_process` clears the inherited process environment to keep arbitrary parent variables, secrets, and `NODE_OPTIONS` out of the API child. On Windows this also removed `TEMP`, `TMP`, `USERPROFILE`, and `LOCALAPPDATA`. SQLite needs a usable temporary directory to create a savepoint subjournal during nested transaction writes. The operation fails with `SQLITE_CANTOPEN` when none is available.

The earlier Node probes were false negatives. Node/libuv's `spawnSync` adds `TEMP` and `USERPROFILE` to the spawned process even when the supplied environment omits them. The confirmed probe explicitly deletes `TEMP`, `TMP`, `USERPROFILE`, and `LOCALAPPDATA` in the child before loading SQLite. On a disposable database, the normal environment and a TEMP-only environment both pass the nested-savepoint write; the truly cleared environment fails with `SQLITE_CANTOPEN`. It does not read or write the owner's live database.

The runtime log at `C:/Users/sensei57/AppData/Roaming/com.tuari.desktop/Tuari/logs/api-server.log`, line 200 onward, records all four variables absent at the live failure. This is diagnostic evidence, not proof that the live application now works.

## Change and seam

`ApiChildEnvironment` now receives the OS-selected temp path from `std::env::temp_dir()`. `configure_api_child_environment` adds that one path as both `TEMP` and `TMP` after `env_clear()`. The rest of the curated environment remains unchanged: the fix does not restore `USERPROFILE`, `LOCALAPPDATA`, parent secrets, or `NODE_OPTIONS`.

The existing sidecar environment test runs the allowlist for both debug and release configurations. It now asserts both temp variables equal the supplied directory and retains the checks that `NODE_OPTIONS` and an unrelated parent secret do not leak. This tests the existing internal seam; no new adapter or public interface was added. Architecture: no seam moved.

The temporary `[DEBUG-543-configured]` catch-and-log instrumentation in `apps/api/src/infrastructure/database/factory.ts` was removed, restoring the committed implementation. A Windows-only API regression test starts fresh Node children, deletes all four variables before loading better-sqlite3, and proves the cleared-environment savepoint fails while TEMP-only succeeds.

## Proof

- Scratch probe at `temp-probe.cjs`: normal PASS; cleared env fails with `SQLITE_CANTOPEN`; TEMP-only PASS. It creates a fresh disposable database for each mode. Logs: `.scratch/reviews/543/cantopen-diagnosis-02/impl-temp-probe-01.log` and `impl-temp-probe-02.log`.
- Durable API regression: `node_modules/.bin/vitest run apps/api/src/infrastructure/database/sqlite-temp-env.regression.test.ts` passed, 1 test. Log: `.scratch/reviews/543/cantopen-diagnosis-02/sqlite-regression-03.log`.
- Rust regression: first run failed at the new missing-TEMP assertion before the implementation; after the fix, the focused test passed for debug and release allowlist configurations. Logs: `rust-env-red-01.log` and `rust-env-green-01.log` under the same evidence directory.
- `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib --tests` passed with existing warnings; see `rust-clippy-01.log`. API TypeScript typecheck passed; see `api-typecheck-02.log`.
- Formatting check: `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check` reports broad pre-existing rustfmt differences across the Tauri crate and other Rust files. No whole-file formatting was applied to avoid unrelated churn. ESLint is not installed in the worktree, and the global `pnpm` shim points to a missing `pnpm.cjs`. `git diff --check` passes.

## Boundaries

No app launch, approval request, UI recovery, credential access, config/key change, dependency change, or live database write was performed. No full suite/build or hosted acceptance is claimed. Parent review and CI-final acceptance remain pending. Live approval and persistence remain unverified.
