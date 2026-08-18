# Issue #175 — M7 Production Hardening: DB migration execution + recovery/rollback failure-mode tests

## Mode, base, tier

- `mode: local-only` (GitHub repository unavailable; source of truth is the current
  checkout + cached `origin/develop` ref).
- `ticket: #175` — "M7 — Production Hardening: E2E tests, recovery/rollback coverage,
  performance profiling, security review". This lane covers **DB migration execution
  tests (success + failure/rollback)** and **recovery/rollback failure-mode tests**.
  It is a PART of the milestone; E2E/profiling/security are other lanes.
- `branch: feature/issue-175-migration-recovery`
- `target ref`: `origin/develop` (cached); resolved base SHA `6be3497` (= HEAD before
  this change).
- `review tier`: **Standard** (production DB code + tests → Guard Phase 1 → quality
  check → test-audit → code-review → Guard Phase 2 → local Greptile → Guard Phase 3).
  Not High-assurance (no authz/licensing/crypto/financial calc introduced by this lane).

## Scope

Add honest DB-migration **failure-mode / recovery** tests. The pre-existing coverage
(`migration-runner.test.ts`, `schema-migrations.test.ts`, `schema-definitions.test.ts`)
already covers, for BOTH the generic `runMigrations` runner AND each individual
`ensureDatabaseSchema` migration function:
- happy-path execution + state-key recording,
- idempotency (state key guards re-run),
- unknown-key skip / no-op paths,
- generic-runner full-batch rollback on SQL syntax error.

**Missing (the gap this lane closes):** no test verifies the recovery invariant for the
individual `ensureDatabaseSchema` migration functions — that when a migration fails
**partway through its own transaction**, (a) every earlier DDL/DML statement is rolled
back so the schema is left unchanged, and (b) the `app_schema_state` row for that key is
**NOT** recorded, so the next startup's `ensureDatabaseSchema` re-attempts the migration
(no premature key = no permanent skip on a half-applied schema).

This is the recovery/rollback failure mode named in the brief. It is currently
unpinned by any test; a regression that recorded the key before the DDL committed, or
that failed to roll back partial DDL, would go unnoticed.

## Changed contract / files

- **New test file only**: `apps/api/src/infrastructure/database/migration-recovery.test.ts`.
  No production code change is required at the seams audited; the recovery invariant
  already holds in the real `BetterSqlite3Executor` savepoint semantics (verified by
  probe). Tests LOCK IN the invariant rather than drive a code change.
- No change to public APIs, contracts, packages, or the schema.

## Failure injection strategy (honest, real executor)

Each migration function records its key as the **last** statement inside a savepoint
transaction (`BetterSqlite3Executor.$transaction`). To force a realistic mid-transaction
failure we inject a SQLite `BEFORE INSERT` trigger on `app_schema_state` that aborts
the FIRST key-insert (`RAISE(ABORT, 'injected migration failure')`) while the real
savepoint is still open, so the whole transaction (including the preceding DDL) must
roll back. This exercises the **real** production executor rollback path — no throwing
test double at the seam — and the DB itself is a realistic legacy DB (normal
`app_schema_state` shape).

Verified by probe: `ALTER TABLE RENAME COLUMN`, `DROP/CREATE INDEX`, and a full
rename→create→copy→drop table rebuild are all rolled back by `ROLLBACK TO SAVEPOINT`,
and the key is left unrecorded.

## Planned tests (final — 6 tests in `migration-recovery.test.ts`)

For each of the four state-key migrations, assert on failure:
1. `applyDebtAccountBalanceRename` — `current_balance_dzd` still present,
   `current_balance` absent, key unrecorded, **plus a same-DB next-startup retry**
   (drop the injected trigger, re-run on the same database → rename + key applied).
2. `applyDebtAccountDirectionMigration` — legacy single-column unique index NOT dropped,
   composite index NOT created, key unrecorded.
3. `applyPaymentAllocationRestrictMigration` — table rebuild fully reverted (no
   `payment_allocation_legacy` leftover, `payment_allocation` keeps legacy CASCADE,
   rows preserved), key unrecorded.
4. `applyRbacThreeRoleMigration` — deleted legacy roles/permissions RESTORED,
   employees back on the legacy role, key unrecorded, **plus a same-DB retry** that
   drops the legacy roles and records the key exactly once.

Note: an `applyEmployeeUserLinkMigration` failure-mode test was drafted and DROPPED:
SQLite accepts `ALTER TABLE ADD COLUMN ... REFERENCES` to a non-existent table without
throwing, and that migration records no state key — there is no recovery/state-key
invariant to pin, so a forced failure would be artificial. Documented rather than kept.

Coverage boundary (explicit): the failing statement IS the state-key insert, so
"key not recorded" follows from the failure point; the genuinely independent
rollback check is that earlier DDL/DML (rename, index swap, table rebuild, role
deletion) did not survive. The file header states this asymmetry.

## Implementation risks / migration concerns

- The injected `test_fail_first_state_insert` trigger is confined to the test DB and
  never touches production; it only makes the natural last-statement failure
  deterministic and is dropped before a same-DB retry.
- SQLite savepoint DDL-rollback is relied upon; it is confirmed by probe and is
  well-defined SQLite behavior.
- No new production seam is introduced; the tests import the same `BetterSqlite3Executor`
  the existing suites use, so rollback semantics are identical to production.

## Verification

```bash
pnpm --filter @tuari/contracts build   # (pre-existing root test:api contract build)
pnpm --filter @tuari/api test          # includes the new file
pnpm --filter @tuari/api typecheck
pnpm --filter @tuari/api lint
```

Then local Greptile (`cli-review` / greptile CLI) scoped to this change set.

## Deferred / out of scope (for parent)

- E2E migration tests, performance profiling, security review — other #175 M-lanes.
- The `update_history` / update-delivery recovery path (`SqliteUpdateHistoryPort`,
  `modules/update/*`) is a separate module and out of the DB-schema-migration scope;
  documented to the parent rather than touched here.
