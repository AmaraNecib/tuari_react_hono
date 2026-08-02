# Test audit evidence — issue #196 (BootstrapPort)

**Head SHA:** `7dd2025` (post-test-audit-fix HEAD)
**Base SHA:** `80d4926`
**Tier:** High-assurance

## Process

Three parallel sub-agents (`reviewer`): Edge Case Hunter, Coverage Analyst,
Quality Reviewer. All read both changed test files + source files. Baseline:
old service test at `80d4926` was compared for lost coverage.

## Edge Case Hunter

- 🔴 Blank/whitespace phone → **dismissed**: unreachable at the service boundary
  (`AuthBootstrapInput.phone` is Zod-validated `algerianPhoneSchema` at the
  route). Pre-existing; noted in PR as a hardening candidate for the parent
  #191 track.
- 🔴 Empty password → **dismissed**: `AuthBootstrapInput.password` is
  `z.string().min(8).max(128)` at the route; service never sees an empty
  password in production. Pre-existing.
- 🟠 Phone not trimmed while name is → **dismissed**: padded phones fail the
  route regex; unreachable.
- 🟠 Setup-key normalization asymmetry → **dismissed as false alarm**:
  verified both sides are normalized — config trims `BOOTSTRAP_SETUP_KEY`
  (`env.ts:38`, `config/index.ts:170`), input trimmed by zod + service.
- 🟠 Port non-unique error path (ROLLBACK + rethrow) untested → **FIXED** —
  new adapter test: NOT NULL violation → rejects, bootstrap-state row rolled
  back, connection usable (fresh `BEGIN IMMEDIATE` succeeds).
- 🟠 SQLITE_BUSY cross-connection race untested → **FIXED** — new file-backed
  two-connection test (timeout 0): connection B's `BEGIN IMMEDIATE` rejects
  with `/database is locked/`, proving the documented propagate-not-conflict
  behavior.
- 🟠 NULL `user_id` state-row fallback untested → **FIXED** — new adapter test.
- 🟡 advisory items (empty name, 10k-char name, multiple state rows, ghost
  state owner) — pre-existing edge semantics, documented in PR.

## Coverage Analyst

- Acceptance criteria 1–8 all hold (1–7 verified by inspection + `tsc` exit 0;
  8 via 11/11→33/33 passing tests with scenarios preserved).
- **FIXED — duplicate conflict tests**: the two service tests
  ("refuses bootstrap…" / "returns a conflict…concurrently") were functionally
  identical after the port normalized both triggers; merged into one.
- **FIXED — conflict result shape never asserted**: merged test now asserts the
  full shape (code `CONFLICT`, Arabic message, `fieldErrors [{field:"phone"}]`).
- **FIXED — constructor mismatched-connection guard untested**: new adapter
  test (the guard added in `6747a42` is the highest-risk line).
- **FIXED — `requiresSetupKey: true` branch untested**: new service test.
- **FIXED — success-path `version` field untested**: new service test.
- **FIXED — `isBootstrapOwner` service delegation untested**: new service test.
- COMMIT-on-conflict not pinned: **not observable** at the DB level (both
  COMMIT and ROLLBACK leave a clean connection); preserved by code inspection.
- Lost coverage vs old test: none net — transaction-statement mocks replaced by
  stronger real-SQLite behavioral checks; `isBootstrapOwner` coverage is a net
  gain (old test never covered it).

## Quality Reviewer

- Grade: **B → A** after fixes. Adapter suite was already A-quality (real DB,
  state-verifying assertions, rollback verification, isolation via fresh
  `:memory:` per test, `mockClear` vs `mockReset` correct, no missing awaits).
- **FIXED — setup duplication**: extracted `createService()` + `BOOTSTRAP_INPUT`.
- **FIXED — stale test name** "inside a transaction" (transaction moved to the
  adapter) → "creates the first auth user with phone credentials via the port".
- **FIXED — untested trim**: new service test feeds padded name, asserts the
  port receives the trimmed value.
- `as never` confined to the pre-existing auth-instance convention; raw-row
  casts in the adapter test are legitimate for the better-sqlite3 driver.

## Result

Service suite: 9 tests. Adapter suite: 10 tests (incl. atomic creation,
two conflict pre-checks, UNIQUE-race rollback, constructor guard, non-unique
rollback, cross-connection BUSY, isBootstrapOwner state-wins / earliest-user /
NULL-state fallback). All 33 auth tests pass; full API suite 614/614 green.

## Post-evidence delta (head )

Rebased onto develop @ f362858 (CI hosted-runner migration — workflow file came from develop, not part of the PR diff).
Commits after the review round: dcb8c77 (empty re-trigger commit, no files), 3506e8b (test-only: raise createAppDependencies cold-start describe timeout 20000 -> 60000ms per .agents/wisdom/testing.md — mitigates the documented wiring-test cold-start flake that surfaced under the pre-push hook).
No production code changed since the reviews. Greptile: 5/5, no actionable findings.
