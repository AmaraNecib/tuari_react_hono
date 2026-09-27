# #411 — Test audit evidence (PR #419 review round)

- Audited commit: `9b71a63eda49c3fe6beae1eba0efd105caf5dbec`
- Suites: `expenses.module.test.ts` (in-memory), `expenses.module.sqlite.test.ts`
  (real adapter), `router.test.ts` (wire + async error mapping),
  `expenses-page.test.tsx` (screen), `expense-form-dialog.test.tsx` (form),
  `date-picker.test.ts` (adapters), `expenses-filters.test.ts` (pure),
  `tests/e2e/expenses.spec.ts` (browser).

## New regression coverage from the review round

| Fix | Where pinned |
| --- | --- |
| A write cannot join a foreign open transaction | sqlite: outer `runInTransaction` held open, `create` rejects with `FifoLockBusyError`, row absent after the outer rollback |
| Edit re-reads/validates under the lock; edit-after-void rejected | `expenses.module.test.ts` "refuses to edit a voided expense" (now under lock); repo `UPDATE` guarded by `status = 'LIVE'` |
| DatePicker `yyyy-MM-dd` ↔ `dd/MM/yyyy` | `date-picker.test.ts` round-trip + empty passthrough; form test asserts the prefilled date renders and submits
  `2026-09-30T23:00:00.000Z` |
| Local-day display | `expenses-page.test.tsx`: `2026-09-30T23:00Z` renders the Algeria day and never `2026-09-30` |
| Voided rows offer no Edit | page test (`within(row)` no Edit button + note) and the E2E row |
| Rejected submit handled | form test: dialog stays open, `onOpenChange` not called, no unhandled rejection |
| `stockItemId` collected/submitted | form test asserts the payload carries it |
| Revision captures which fields changed | in-memory test (project move → `["projectId"]`, amounts unchanged) and sqlite test (project/date/worker/seller set) |
| Fractional amounts | page test renders `0.1 دج` |
| Offset-safe range filter | sqlite test: `+01:00` row included, same-wall-clock UTC row excluded |
| Async domain error → ORPC code | `router.test.ts`: async `ExpenseNotFoundError` maps to `NOT_FOUND` |

## Coverage of the required behaviours (original set, still green)

| Behaviour | Where pinned |
| --- | --- |
| Create with every optional field / with none / amount+date only | in-memory create describe |
| Amount bounds | service test + router wire test |
| Optional-field edit matrix | update describe |
| Value change records actor/timestamp/reason | get + update tests, sqlite revision history |
| No-op edit records no revision | update test |
| Void keeps the row, excludes totals/groups, blocks re-void | in-memory + sqlite + E2E |
| Rollback when the revision write fails | sqlite transaction test |
| Tagging charges the whole amount / group ordering | totals + group tests, E2E group card |
| Filters project/worker/date | list tests |
| Never writes stock | sqlite test |
| Screen render/KPI/strip/table/group/empty | `expenses-page.test.tsx` |
| Date-boundary/default-range logic | `expenses-filters.test.ts` |
| Real-browser critical path (date prefilled, create, group, void leaves totals, no Edit on voided) | `tests/e2e/expenses.spec.ts` |

## Meaningfulness checks

- The lock regression is behavioural: it proves the refusal AND that the refused
  write leaves no row behind a rolled-back transaction.
- The offset-range regression uses a real row plus a same-wall-clock UTC row, so
  a text comparison fails the test (the previous code would have included both).
- The async-error test drives the real router middleware + handler; it fails on
  the pre-fix code (raw domain error → 500 instead of `NOT_FOUND`).
- The date assertions use the pinned Africa/Algiers formatter, so they are not
  host-TZ dependent.
- Coverage: `src/modules/expenses/**/*.ts` at 100% statements/branches/
  functions/lines.

## Residual gaps (accepted)

1. No two-thread test of concurrent SQLite writers beyond the held-transaction
   lock test; the FIFO lock serializes them and the held-transaction test pins
   the corruption path the finding named.
2. No E2E step that opens the calendar and clicks a specific day; the form test
   pins the adapter and the E2E pins the prefilled value + successful submit.

Qualification: the full API suite's default-timeout run has known pre-existing
Windows-host hook timeouts (`sqlite-bootstrap.port.test.ts`,
`sqlite-recovery-key.port.test.ts`, `update-history.service.test.ts`); with 30s
hook/test timeouts the whole suite is green (74 files, 1351 passed, 1 skipped).
