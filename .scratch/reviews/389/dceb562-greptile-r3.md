# PR #389 review round 3 — Greptile 4/5 finding

- **Reviewed HEAD (round 3)**: `18cfe3f` (the round Greptile scored 4/5)
- **Fix commit**: `dceb562` (branch `feat/license-enforcement`, worktree `rev-389`)
- **Base**: local `develop` @ `7c7c833`
- **Lane**: `fix-license-enforcement`
- **Tier**: Standard (security-adjacent, local review + tests).

## Finding verdicts

### R3-1 — "Missing status permits writes" (P1, `license.ts:54-56`) — FIXED (real)

Greptile's premise is correct. Verified chain:

- `apps/desktop/src-tauri/src/license.rs:112-121` — `LicenseManager::initialize`
  returns `Err(RustCoreError::ClockTampered)` when the clock is tampered (and
  other errors for an invalid/unreadable `license.lic`).
- `apps/desktop/src-tauri/src/lib.rs:2052-2059` — the shell sets the
  `TUARI_LICENSE_*` env block **only** inside `if let Ok(manager) = ...`, but
  still spawns the sidecar afterward. `command.env_clear()` (line ~2022) means
  no ambient `TUARI_LICENSE_STATUS` survives.
- Pre-fix `apps/api/src/infrastructure/license.ts` mapped `undefined` →
  `trial`, so the sidecar launched fully writable exactly when license
  verification failed.

Fix: `parseLicenseStatus` maps missing/blank → `unknown` (refused). The writable
trial default now comes from the callers that need it: `apps/api/vitest.config.ts`
(`test.env`), `playwright.config.ts` (`sharedEnv`, E2E runs without the shell),
and `apps/api/.env.example` (`pnpm dev:api`). `docs/licensing-architecture.md`
§15.5 was updated to match the code.

### R2 historical inline comments — already fixed on `c2ce039`, re-verified

These comments (all timestamped 02:31Z, before the 4/5 round) are the round-2
findings addressed by commit `c2ce039`. Verified against the current source:

- `rpc-middleware.ts:111-112` "Post-expiry grace remains writable" → FALSE
  against HEAD: `mutationLicenseRefusalMessage("grace")` returns the read-only
  message and the mutation wrappers refuse it (test "tells the customer the
  grace window is read-only").
- `rpc-middleware.ts:86-88` "Direct writes bypass license checks" → FALSE
  against HEAD: the profile route gates in `AccountService.updateCurrentProfile`
  and the attachment route gates in `create-app.ts` (tests in
  `account.service.test.ts` and `create-app.test.ts`).
- `rpc-middleware.ts:111-112` "Unrecognized statuses allow writes" → FALSE
  against HEAD: `getLicenseInfo` validates against `LICENSE_STATUSES`; the
  helpers allow only `active`/`trial` (plus `grace` on reads).
- `rpc-middleware.ts:167` "License rejection precedes authentication" → FALSE
  against HEAD: the pre-auth wrapper checks were removed; the audit-context
  creators authenticate first (tests for `mutationAudit` and `withAudit`).

## Parent decision (out of scope for apps/api)

The root cause is in the shell: on `LicenseManager::initialize` failure it
launches the sidecar with no license env at all. The API-side fix closes the
bypass, but the shell could additionally emit `TUARI_LICENSE_STATUS=suspicious`
(tampered) / `unknown` (invalid) on init failure so the status is explicit.
That is a Rust-shell change outside this lane's scope.

## Tests added / changed

- `infrastructure/license.ts` consumers: missing and blank status → `unknown`
  (`license.test.ts`); the old "defaults to trial" test became a fail-closed
  test.
- `rpc/rpc-middleware.test.ts`: new "refuses a mutation when the status is
  missing (shell license init failed)"; the edition/feature gate `beforeEach`
  now sets `trial` explicitly.
- `apps/api/vitest.config.ts` `test.env` sets the suite-wide writable default.

## Commands

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/api exec vitest run src/infrastructure/license.test.ts src/rpc/rpc-middleware.test.ts` | 2 files / 65 passed, exit 0 |
| `pnpm --filter @tuari/api exec vitest run src/app/create-app.test.ts src/modules/account/account.service.test.ts src/rpc/router.test.ts src/config/config.test.ts` | 4 files / 165 passed, exit 0 |
| `pnpm typecheck` | 4 tasks successful, exit 0 |
| `pnpm lint` | 2 tasks successful, exit 0 |
| `npx playwright test --list` | config loads, 59 tests in 25 files, exit 0 |
| `pnpm --filter @tuari/api test` | 1287 passed, 1 skipped, 5 failed — all `Hook/Test timed out in 10-11s` in the known load-flaky files (sqlite-bootstrap/recovery-key/update-history) under sibling-lane CPU load; zero assertion errors |
| the 5 failing files run individually | `sqlite-bootstrap.port` 10/10, `sqlite-recovery-key.port` 4/4, `update-history.service` 11/11; `recovery-key.service` 24/24 with `--hookTimeout=60000` and 24/24 on a later default run |
