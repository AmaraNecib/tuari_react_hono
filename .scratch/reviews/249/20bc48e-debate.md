# Debate — Issue #249 (high-assurance)

- Base: `bb49ec29335adb1564ba69bc7f1d91a2e9f43b33`
- Head at time of review: `47d8915` (pre-fix-commit) → final head `47d8915` + debate-fix commit
- Reviewer tier: High-assurance (financially-adjacent payment/account modules)
- Scope: vitest coverage 100% for payment + account; tests; `DrizzleAccountRepository.withTransaction` async-callback bug fix

## Summary

Two parallel sub-agents (critic + defender) reviewed `git diff <base>...HEAD -- apps/`
plus the design doc and the established transaction patterns (sqlite-recovery-key.port,
sqlite-bootstrap.port). 10 critic findings, all defended point-by-point.

## Critic findings and disposition

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | 8 | Cross-module lock independence on the shared connection (account/payment/recovery-key/bootstrap each hold txns behind per-module locks; account tx holds BEGIN IMMEDIATE across bcrypt verify) | **Deferred → #288**. Pre-existing architecture-wide condition (all modules do this; the old account code threw on every call, so the fix is strictly better). Connection-wide lock is an architecture change, out of scope for a coverage issue. |
| 2 | 6 | `**/adapters/**` carve-out excludes the real payment transaction code; account's adapter (no adapters/ dir) is forced to 100% | **Documented**. Adapters-excluded is *decided policy* in #248; account has no adapters dir. Payment sqlite adapter zero-test gap tracked in #288. |
| 3 | 6 | Concurrency semantics of the FIFO lock least tested (no overlap/FIFO-order test) | **FIXED** — added "serializes overlapping transactions through the FIFO lock" test. |
| 4 | 5 | Nested-join atomicity: failed inner run leaves partial writes; outer may COMMIT them | **Dismissed** — join semantics match the established recovery-key pattern verbatim; the outer transaction owns atomicity (documented in the code comment). |
| 5 | 5 | Payment adapter uses deferred `BEGIN`, not `BEGIN IMMEDIATE` → double-allocation risk | **Deferred → #288** (pre-existing payment adapter code, unchanged by this PR). |
| 6 | 4 | Unguarded ROLLBACK in catch masks the original error if COMMIT fails | **FIXED** — ROLLBACK wrapped in try/catch so the original error surfaces. |
| 7 | 4 | Third hand-rolled copy of the FIFO lock primitive | **Deferred → #288** (extract shared primitive). |
| 8 | 3 | Nested-join path is speculative (no production flow wraps account calls in an outer tx) | **Dismissed** — defensive, consistent with recovery-key/bootstrap pattern; prevents accidental double-BEGIN on the shared connection. |
| 9 | 2 | `payment.module.ts:186` `result!` non-null assertion can return null | Pre-existing; noted, not changed (behavior preserved — payment module untouched by design). |
| 10 | 2 | No validation rejects negative allocation amounts | Pre-existing; noted as possible follow-up, out of scope for a coverage issue. |

## Defender highlights (accepted)

- `withTransaction` fix (raw-connection BEGIN IMMEDIATE/COMMIT/ROLLBACK + FIFO lock +
  nested join) is the #195 codified pattern (wisdom: architecture.md) — confidence 9.
- Payment's silent-undefined cursor behavior kept (vs invoice's throwing decodeCursor):
  read-only listing, benign failure mode, no API contract change under a coverage PR — confidence 8.
- Drizzle integration tests are the only honest way to cover the real adapter; in-memory
  SQLite + full schema DDL mirrors sqlite-bootstrap.port.test.ts — confidence 9.

## Follow-up issue created

- **#288** — API: harden shared-connection transaction model (connection-wide lock,
  BEGIN IMMEDIATE for payment adapter, payment adapter tx tests, shared lock primitive).

## Post-debate verification

- `pnpm exec vitest run --coverage` (apps/api): 49 files / 728 tests, 100/100/100/100.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:web` all green.

## Post-evidence delta (47d8915 → 20bc48e)

- `8626e9b` (debate fixes): guarded ROLLBACK; FIFO serialization test.
- `ff02d2d` (test-audit fixes): strengthened cursor fallback tests (2 payments,
  both asserted); whitespace-password, missing-id, name-boundary, verify-called,
  lock-release-after-failure, timestamp-only-update tests; removed dead helper.
- `20bc48e` (code-review fix): string/null sortValue cursor tests now pin the
  decode outcome (cursor row skipped).
- Re-verified after all commits: 49 files / 734 tests, 100/100/100/100.
