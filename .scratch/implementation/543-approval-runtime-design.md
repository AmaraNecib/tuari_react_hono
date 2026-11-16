# Approval runtime error propagation

## Scope and state

- Worktree: `D:/worktrees/tuari_react_hono/feat-issue-427-independ-2565729f7d01eaa8`
- Branch: `feat/issue-427-independent`
- Base: `0fdaff8fe76771c12a32bbe7bdd93f6c6935656f`
- Starting HEAD: `4accb8d3831d584f651e2aa73c3cadce5f504ae6`
- Verification mode: focused-local / CI-final-enforced, supplied by parent.
- Risk: a raw SQLite exception was being mistaken for a successful approval result and masked by output validation.
- Local change: unmapped errors from the normal exact-earnings RPC now throw; the router keeps its existing `ExactDebtError`, validation, and busy-lock mappings. A regression test covers a synthetic unknown error with a `SQLITE_ERROR` code.
- No interface or schema changed. The router's error handling behavior is the only changed seam.

## Evidence

The red test showed the active earnings router returning the synthetic coded error as a procedure value. `exactSalaryMonthlyApprovalResultSchema` then replaced it with a `ZodError` reporting missing `currency`, `totalAmount`, and `months`, plus an unexpected `code`. After the change, the same test receives the original error object.

The normal application root regression and the focused router test pass. Existing root assertions still cover mapped invalid-input and missing-project errors.

One normal Tauri UI recovery of request `c05f2c3c-1960-4b16-8399-5897939c30b4` still failed. The API now logged the original exception:

- Name: `SqliteError`
- Message: `unable to open database file`
- Stack: `factory.ts:116` through `SqliteExactWorkforceRepository.saveEarning`, at the `INSERT INTO employee_salary_earning` call.
- The logger does not record the native SQLite `error.code` property, so that field was not captured.

A separate native-service run against a coherent clone of the configured database, with only `PATH` and `SystemRoot` in the child environment, approved 62,500.00 and read back one earning with project costs 25,000.00 and 37,500.00. The clone copied the configured database and its WAL/SHM sidecars while the application was stopped, then was removed. This falsifies the claim that the omitted `TEMP`, `TMP`, `USERPROFILE`, or `LOCALAPPDATA` variables alone cause the failure. Read-only inspection of the configured database found `integrity_check=ok`, zero earnings, zero segments, zero receipt for the request, and no earnings segments for either project. The insert trigger's EXPLAIN program had no temp-file opcodes. The TEMP/TMP hypothesis is not a basis for changing Rust environment policy.

The configured-file `SqliteError` remains unresolved. No successful approval is claimed. The durable intent, request ID, configured database, keys, backups, paused files, and unrelated changes were not changed.

## Verification

- Red: `pnpm --filter @tuari/api exec vitest run src/rpc/workforce-exact-earnings-router.test.ts` failed with `ZodError` instead of the original coded error.
- Green: `pnpm --filter @tuari/api exec vitest run src/rpc/workforce-exact-earnings-router.test.ts src/app/normal-exact-root.test.ts` passed, 2 files and 8 tests, 9.28 seconds.
- Typecheck: `pnpm --filter @tuari/api typecheck` passed.
- Lint: `pnpm --filter @tuari/api exec eslint src/rpc/workforce-exact-earnings-router.ts src/rpc/workforce-exact-earnings-router.test.ts` passed.
- `git diff --check` passed.
- Actual Tauri run used `heavy_run` and the installed Local/pnpm route. Stage 1 exited 1 after the normal UI recovery timed out at 120 seconds. The runner closed its owned process tree and reported all app ports closed.
- Read-only configured-database diagnostics and raw logs are under `.scratch/reviews/543/approval-runtime-01/`.

## Handoff boundary

This commit fixes the error-masking bug and preserves the original cause in API logging. It does not fix the configured database's `unable to open database file` failure. Do not treat this as completed monthly earnings approval or retry the configured request again in this lane. No guessed temp-directory workaround, schema change, license bypass, or database mutation is included.
