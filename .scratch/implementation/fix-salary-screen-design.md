# Salary screen — payment-amount default + table controls (items 5, 6, 7)

Lane: `fix-salary-screen` (owner manual-testing items 5, 6 and 7)
Base: `origin/develop` = `55b71181` (local `develop` is stale at `fdb5dda6`; used
`origin/develop` as the base).
Tier: Standard (UI + client-side logic, no authz/money-write change).

## What the screen actually is

`/salaries` renders `SalariesSection` (`apps/web/src/features/app-shell/salaries-section.tsx`).
It has two `RecordTabs`:

- `recent` — payment history table. Columns found: worker (name + role),
  payment date, days (with per-project split lines), expected amount, actual
  amount, note, actions. The payment row carries `periodType` and
  `employeePhone` at runtime but the table renders neither.
- `workers` — salaried workers. Columns found: worker (name + role), current
  salary (with period label), last payment date, actions. Workers carry
  `projectAssignments` (used to prefill the payment split) but the table does
  not render a project column.

Both tables rendered every row: no search, no filters, no pagination.

## Item 5 — amount defaults to the full salary

Finding: the default was already implemented by #420. `AddSalaryPaymentDialog`
computes `computeProposedSalaryAmount({ periodType, salaryAmountDzd, days })`
for the `actualAmount` input and lets a hand edit win; for a full period that is
exactly the worker's configured wage (the figure the employees screen shows).
`SalariesSection` passes `salaryAmountDzd`/`salaryPeriod` from live query data.

Remaining gap: the proposal is gated on `salaryPeriod !== null`. A worker whose
wage the app knows but whose period is unknown (legacy/null) gets an empty
amount field and the operator must retype the known wage. The form's day default
already treats an unknown period as a month (`defaultSalaryPaymentDays(null)`
documents this), so the amount default is made consistent with that: an unknown
period prorates as MONTHLY. No new business rule is invented — the days/amount
interaction stays "full salary for a full period, and the untouched amount
follows the days until the operator edits it".

Behaviour chosen (for the PR body): the amount defaults to the full salary
(prorated by days like #420); editing days updates an untouched amount and
leaves a hand-typed partial payment alone; an unknown period falls back to the
same month convention the day default already uses.

## Item 7 — search, filters, pagination

Reuse the app's existing primitives only:
`usePaginatedRows` + `TablePaginationControls` from
`apps/web/src/features/shared/table-primitives.tsx` and
`table-pagination-controls.tsx` (the brief's paths under `components/ui/` do not
exist; the real modules are under `features/shared/`, the same pair the invoices
and items pages import). Filters use the shared `AppShellFilterShell` + the
stock `Input`/`NativeSelect` controls; no second pagination UI.

- recent tab: search by worker (name + role; phone is not displayed so not
  matched), filters worker / project (payment split) / period (`periodType`).
- workers tab: search by worker (name + role), filters period / project
  (assignment window).
- Both window through `usePaginatedRows` with `resetPageDeps` on every
  search/filter value, and render `TablePaginationControls` whenever the source
  list is non-empty so the page-size control stays reachable at one page.

Columns/filters found (for the PR body): worker, date, days, expected, actual,
note on the history table; worker, salary, period, last payment on the workers
table. Filters therefore cover worker, project and period — the dimensions the
two tables display.

## Item 6 — free payments, no monthly balance (owner decision C)

Checked the API, not just the web: `WorkforceService.createSalaryPayment` has no
same-month guard, and the `employee_salary_payment` schema has only a non-unique
index on `(employee_id, payment_date)` — no unique constraint on worker/month.
The web screen adds no "already paid this month" check and no remaining/balance
figure. A month balance stays derivable later from the stored payment date,
worker, amount and the existing monthly wage, so nothing here blocks the future
per-user preference. Tests lock both halves: the service records a second
same-month payment, and the screen renders no derived remaining figure.

## Tests

- `add-salary-payment-dialog.test.tsx`: amount defaults to the full salary; an
  unknown period still defaults to the known wage; the amount stays editable and
  a partial value is submitted; a second same-worker/same-month payment is
  accepted by the form.
- `salaries-section.test.tsx`: pagination boundary (exactly one page), a shrink
  across a page boundary asserted on the first render, search/filter changes
  resetting to page 1 instead of an empty page, and no remaining/balance figure.
- `workforce.service-coverage.test.ts`: two salary payments for one worker in
  one month both persist.
- Red/green: the tests are written first and run against the base to capture the
  failing output (`.scratch/reviews/fix-salary-screen/`). Item 5's already-green
  parts (the #420 default and editability) are noted in the report; the
  null-period default is the genuinely red one.

## Risks / non-goals

- Client-side only; no API/query change. `recentPayments.periodType` is added to
  the prop type as optional so existing call sites/fixtures keep compiling.
- The employees-screen quick form and the detail-page dialog are untouched.
- No money math change: rows keep integer DZD through existing helpers.
