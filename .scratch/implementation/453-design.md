# #453 — Extract the per-tab salary table modules

Mode: **remote** (`AmaraNecib/tuari_react_hono`); lane does not push/PR.
Ticket: GitHub issue #453 (was auto-closed by PR #456, which only shipped the
salary screen; the extraction itself is the follow-up it filed).
Target ref: `origin/develop`.
Base SHA (pinned): `e526acec` (== `origin/develop` == lane HEAD at start; the
local `develop` ref is stale at `fdb5dda6`, so `origin/develop` is the pinned
base).
Review tier: **Standard** (UI/refactor, no authz/finance logic).

## Problem

`apps/web/src/features/app-shell/salaries-section.tsx` (~490 lines) owns two
independent table pipelines — payments history and salaried workers — each with
its own search, filters, pagination and empty state. Reading one concept means
reading both, and a change to one tab touches the file that implements the
other. The design pass on the salary-screen PR recorded this as finding A1 and
filed #453.

## Target shape

`SalariesSection` becomes a thin tab shell:

- owns only `activeTab` and the payment-dialog target state,
- renders `PageHeader` + `RecordTabs`,
- renders `SalaryPaymentsTable` on the payments tab and `SalariedWorkersTable`
  on the workers tab,
- keeps the single shared `AddSalaryPaymentDialog` and looks the live worker up
  from props (so a workspace refresh still re-derives the dialog proposal),
- passes `onAddPayment(employeeId, employeeName)` and `onEditSalary(employeeId)`
  down to the active table.

### New modules

| file | owns |
| --- | --- |
| `apps/web/src/features/app-shell/salary-payments-table.tsx` | payment-history filters (search, worker, project, period), filter predicate, `usePaginatedRows`, empty state, pagination bar |
| `apps/web/src/features/app-shell/salaried-workers-table.tsx` | worker-list filters (search, project, period), filter predicate, `usePaginatedRows`, empty state, pagination bar |
| `apps/web/src/features/app-shell/salary-table-primitives.tsx` | the display bits both tables share: `MoneyCell`, the period vocabulary (`SALARY_PERIOD_FILTER_VALUES`, `getSalaryPeriodLabelKey`), and the identical filter fields (search / project / period) |

Public interfaces (the test surface):

```ts
export type SalaryPaymentRow = { /* the current recentPayments item shape */ }
export function SalaryPaymentsTable(props: {
  payments: SalaryPaymentRow[]
  projects: Array<{ id: string; name: string }>
  onAddPayment: (employeeId: string, employeeName: string) => void
  onEditSalary: (employeeId: string) => void
}): JSX.Element

export type SalariedWorkerRow = { /* the current workers item shape */ }
export function SalariedWorkersTable(props: {
  workers: SalariedWorkerRow[]
  projects: Array<{ id: string; name: string }>
  onAddPayment: (employeeId: string, employeeName: string) => void
  onEditSalary: (employeeId: string) => void
}): JSX.Element
```

### What stays shared, and why

- `usePaginatedRows` + `TablePaginationControls` — this is **not** a second
  pagination implementation. Both tables cross the same seam, exactly as before.
- The single `AddSalaryPaymentDialog` stays in the shell: one dialog, opened by
  either table, driven by the shell's live worker lookup. Deleting it would
  reintroduce the stale-proposal bug the dialog's lookup was built to avoid.
- `MoneyCell` and the period vocabulary move to the shared primitives module
  because both tables use them verbatim; leaving them in the shell would force a
  sideways import table→shell.
- The identical filter *fields* (search / project / period) move to the shared
  primitives module; each table still owns its own filter *state*, predicate and
  which fields it shows (the payment table's worker filter stays local to it).
  Deleting the shared fields would duplicate the period option set and the
  label mapping across two files — drift, not locality.

## Dependencies / boundaries

- Types come from `@tuari/contracts` (`SalaryPeriodType`,
  `SalaryProjectAssignmentWindow`, `SalaryProjectDaySplit`).
- Money stays integer-DZD through `allocateSalaryAmountByDays` /
  `roundMoneyToCents`; no float maths is added.
- No new i18n key: every label reuses an existing `salaries.*` /
  `detailPages.salary.*` key. Arabic comes from i18n only; no hard-coded UI text.
- Colour stays on semantic tokens (`text-ink`, `text-ink-2/3/4`, `border-line`);
  no colour literals are introduced.

## Tests

- `salary-payments-table.test.tsx` — new; module-level. Owns: project-split
  rendering + share reconciliation, pagination + search reset, project filter,
  empty state. Red pre-fix (module absent); green after extraction.
- `salaried-workers-table.test.tsx` — new; module-level. Owns: wage + period
  label rendering, period filter + page reset, empty state, `onAddPayment`.
- `salaries-section.test.tsx` — **unchanged**; the tab shell must keep the same
  observable surface (this is the refactor's equivalence check).

Red/green evidence: each new module test is run before the module exists to
record the red, then after the extraction to record the green; a targeted
mutation (drop the filter from `resetPageDeps` / drop a predicate clause) is used
to prove the new tests have teeth rather than passing vacuously.

## Risks

- The shell test's `getAllByRole("combobox")`/`getByRole("table")` queries only
  ever see one table at a time (tabs are conditionally rendered), so extraction
  does not change what they match.
- `home-view-page-content-sections.tsx` lazy-imports `SalariesSection` by name;
  the shell export stays identical, so no consumer changes.
- E2E `tests/e2e/salaries.spec.ts` depends on column order and row roles; the
  extraction preserves both.

## Definition of done

- `pnpm typecheck`, `pnpm lint`, and the web suite pass with
  `VITEST_MAX_WORKERS=2`.
- `salaries-section.test.tsx` passes unchanged; one new test file per module.
- Dead code from the move (the two inline pipelines, the local `MoneyCell`, the
  inline period helpers) is deleted, not left behind.
- Design pass recorded in `.scratch/reviews/453/design-pass.md`.
