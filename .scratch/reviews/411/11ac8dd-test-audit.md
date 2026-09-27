# #411 — Test audit evidence

- Audited commit: `11ac8dd00ea704e99f0cd0b44fbd44bf3383cd49`
- Suites: `expenses.module.test.ts` (in-memory), `expenses.module.sqlite.test.ts`
  (real adapter), `router.test.ts` (wire), `expenses-page.test.tsx` (screen),
  `expenses-filters.test.ts` (pure), `tests/e2e/expenses.spec.ts` (browser).

## Coverage of the required behaviours

| Behaviour | Where pinned |
| --- | --- |
| Create with every optional field / with none / amount+date only | `expenses.module.test.ts` create describe |
| Amount bounds (0, negative, `MAX_SAFE_INTEGER + 1`) | service test + router wire test |
| Optional-field combinations on edit (omitted = untouched, `null` = cleared, all fields at once) | update describe |
| Value change records actor/timestamp/reason | `get` + update tests, sqlite revision-history test |
| No-op edit records no revision | update test |
| Void keeps the row in the list, excludes it from totals/groups, blocks re-void | in-memory + sqlite void tests, E2E |
| Rollback: row update reverts when the revision write fails | sqlite `runInTransaction` test |
| Tagging a project charges the whole amount | totals + group tests (in-memory and sqlite), E2E group card |
| Group ordering: totals desc, equal totals by id, untagged last | group tests incl. equal-total and untagged-oldest cases |
| Filters: project / worker / date range | list tests |
| An expense never writes stock | sqlite test seeds an item, asserts item + `inventory_movement` unchanged |
| Wire gate through auth + permission (money, blank text, non-uuid id, NOT_FOUND, read envelope) | `router.test.ts` |
| Screen render, KPI totals, total strip, table, filter wiring, group toggle, empty state | `expenses-page.test.tsx` |
| Date-boundary/default-range logic | `expenses-filters.test.ts` |
| Real-browser critical path: create with a project → row + strip → group → void leaves the total | `tests/e2e/expenses.spec.ts` |

## Meaningfulness checks

- Assertions are behavioural (totals, group contents, persisted status, revision
  rows), not mock-call counts.
- The sqlite suite runs the production adapter against the real schema, so the
  transaction/rollback and void guard are pinned against real SQL.
- The in-memory double mirrors the sqlite ordering and filter semantics; both
  suites assert the same totals/groups so a divergence fails one side.
- The E2E asserts the issue's literal void rule (row still visible, total
  dropped), which is what caught the initial wrong reading.
- Empty and error states are asserted (empty state in unit + E2E; NOT_FOUND read
  path at the wire).
- Coverage: `src/modules/expenses/**/*.ts` at 100% statements/branches/
  functions/lines.

## Residual gaps (accepted)

1. No concurrency test for two simultaneous updates of one expense. The shared
   connection FIFO lock serializes writers, and the revision write is in the same
   transaction as the row update, so the invariant is structural.
2. No assertion for a `projectId` + `responsibleWorkerId` + date-range filter
   combined in one call (each filter is independently covered).

No blocking gaps. Qualification: the full API suite's default-timeout run has
one pre-existing failure (`sqlite-bootstrap.port.test.ts`, cross-connection
write-lock contention) reproduced on base `develop`; with 30s hook/test timeouts
the whole suite is green (74 files, 1346 passed, 1 skipped).
