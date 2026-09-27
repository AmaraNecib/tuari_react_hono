# #411 — Test audit evidence

- Audited commit: `bb64cb03d91bd51062bd90453869cc306d5accc0`
- Suites: `expenses.module.test.ts` (in-memory), `expenses.module.sqlite.test.ts`
  (real adapter), `router.test.ts` (wire), `expenses-page.test.tsx` (screen),
  `expenses-filters.test.ts` (pure).

## Coverage of the required behaviours

| Behaviour | Where pinned |
| --- | --- |
| Create with every optional field / with none / amount+date only | `expenses.module.test.ts` create describe |
| Amount bounds (0, negative, `MAX_SAFE_INTEGER + 1`) | service test + router wire test |
| Optional-field combinations on edit (omitted = untouched, `null` = cleared, all fields at once) | update describe |
| Value change records actor/timestamp/reason | `get` + update tests, sqlite revision-history test |
| No-op edit records no revision | update test |
| Void keeps the row, excludes it from totals, blocks re-void | in-memory + sqlite void tests |
| Rollback: row update reverts when the revision write fails | sqlite `runInTransaction` test |
| Tagging a project charges the whole amount | totals + group tests (in-memory and sqlite) |
| Group ordering: totals desc, equal totals by id, untagged last | group tests incl. equal-total and untagged-oldest cases |
| Filters: project / worker / date range / includeVoided | list + void tests |
| An expense never writes stock | sqlite test seeds an item, asserts item + `inventory_movement` unchanged |
| Wire gate through auth + permission (money, blank text, non-uuid id, NOT_FOUND, read envelope) | `router.test.ts` |
| Screen render, KPI totals, total strip, table, filter wiring, group toggle, empty state | `expenses-page.test.tsx` |
| Date-boundary/default-range logic | `expenses-filters.test.ts` |

## Meaningfulness checks

- Assertions are behavioural (totals, group contents, persisted status, revision
  rows), not mock-call counts.
- The sqlite suite runs the production adapter against the real schema, so the
  transaction/rollback and void guard are pinned against real SQL.
- The in-memory double mirrors the sqlite ordering and filter semantics; the two
  suites assert the same totals/groups so a divergence fails one side.
- Empty and error states are asserted (`query.isError` path exists; the empty
  state is asserted; the NOT_FOUND read path is asserted at the wire).
- Coverage: `src/modules/expenses/**/*.ts` at 100% statements/branches/
  functions/lines (`vitest run src/modules/expenses --coverage
  --coverage.include="src/modules/expenses/**/*.ts"`).

## Residual gaps (accepted)

1. No concurrency test for two simultaneous updates of one expense. The shared
   connection FIFO lock serializes writers, and the revision write is in the same
   transaction as the row update, so the invariant is structural; a deterministic
   concurrency test would add little here.
2. `includeVoided` combined with a project filter is not asserted together
   (both filters are independently covered).
3. No E2E spec (see code-review evidence, process note).

No blocking gaps. The "all tests pass" claim is qualified: the full API suite
has one pre-existing failure (`sqlite-bootstrap.port.test.ts`, cross-connection
write-lock contention) reproduced on the base `develop` checkout.
