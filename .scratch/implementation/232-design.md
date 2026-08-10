# #232 — Adapter-level transaction tests for the company persistence seam (hardening)

## Context

Issue #232 was filed from the #215 fold test-audit, asking for:
1. A rollback test (and async-rejection pin) for
   `SqliteCompanyRepository.withTransaction` in `sqlite-company.repository.test.ts`
2. Unit coverage of `WorkspaceMutationContext.createMutationAuditContext`
   unauthorized/authorized paths

PR #231's final test-only coverage round (`d31b36d`, merged 2026-08-03, one day
after the issue was filed) already shipped **both** acceptance criteria — verified
in code at `develop` HEAD `03ec349` (rollback test `sqlite-company.repository.test.ts:250`,
async pin `:296`; authorizer unit tests `workspace-mutation-context.test.ts:107/123/133`).

This branch therefore makes **no new acceptance-criterion work** — it adds two
hardening tests that close the residual gap between the company adapter seam and
the port-level pattern (`sqlite-recovery-key.port.test.ts`), per user request.

## Residual gap

`sqlite-recovery-key.port.test.ts` pins, beyond plain rollback:
- **Post-rollback usability** — "releases the lock": after a failed
  `withTransaction`, the next flow runs and commits normally.
- **Non-Error throw propagation** — the port pins the exact rethrow semantics.

The company adapter tests stop at "rollback + rethrow of an `Error` instance".
Two behaviors of `SqliteCompanyRepository.withTransaction`
(`return this.raw.transaction(callback)()`) are unpinned:

1. The connection is not left mid-transaction after a rollback (a follow-up
   `withTransaction` commits durably).
2. A callback that throws a **non-Error value** (e.g. a string) rolls back the
   transaction and propagates the thrown value unchanged (better-sqlite3
   rethrows whatever the callback threw).

## Public API

None — **test-only** change to `apps/api/src/modules/company/sqlite-company.repository.test.ts`.
Zero production-code changes, zero dependency changes.

## Planned tests (added to `SqliteCompanyRepository.withTransaction` describe)

1. `leaves the connection usable after a rollback` — run a failing
   `withTransaction` (multi-table write + throw), assert nothing persisted,
   then run a second `withTransaction` and assert it commits durably.
   Mirrors the port test "withTransaction rolls back partial writes and
   releases the lock".
2. `rolls back and propagates non-Error throws unchanged` — callback throws a
   string; capture-and-`toBe` identity pin (same style as the existing
   "rethrows the original error instance" test) + assert zero employees remain.

## Implementation risks

- **Nested transactions**: both new tests write via `repo.createEmployee`
  inside `withTransaction` — better-sqlite3 uses savepoints for the nested
  wrapper. The existing commit test already exercises this shape, so no new
  risk; the rollback assertion (`listEmployees()` length 0) is the observable
  proof that the outer ROLLBACK covered the nested savepoint commit.
- **Vitest `toThrow` with a string throw**: the WMC seam test already uses
  `expect(() => … throw "…" …).toThrow("…")` and passes; the new test prefers
  capture-and-`toBe` for identity, consistent with the sibling test.
- No flakiness surface: pure in-memory SQLite, no timers, no async.

## Deviations from architecture

None. The adapter seam is untouched; tests only pin existing behavior.
