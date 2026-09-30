# 440 — A form opens with the sensible default already filled in (date = today)

Base SHA: `5d0629be768a75689c081249843af4a79d045230` (== `origin/develop`)
Tier: Standard

## The owner's rule

A form that creates or records something opens with every field the app already
knows filled in: the date to today, the amount to the full/expected figure where
computable, the single candidate for a warehouse/project/person, the most common
type where the choice is genuinely obvious. A filter stays empty. A default is a
starting point, never a constraint, and never silently overwrites typed input.

## What the brief assumed vs. what the checkout shows

The brief measured "17 date-picker files; exactly ONE defaults its date to
today". That measurement is stale. On this base (== `origin/develop`) the
create/record forms already seed their date from the app's canonical helper
`getAlgeriaDateInputValue()` in `apps/web/src/lib/algeria-time.ts`:

| Form | Date default on base | Verdict |
| --- | --- | --- |
| `debts/debt-create-page.tsx` | `getAlgeriaDateInputValue()` | already today |
| `debts/record-payment-dialog.tsx` | `getAlgeriaDateInputValue()` | already today |
| `expenses/expense-form-dialog.tsx` | empty state + effect sets today on open | **fixed here** (seed on first render) |
| `inventory/transfer-item-dialog.tsx` | `getAlgeriaDateInputValue()` | already today |
| `inventory/inventory-invoice-create-page.tsx` | private UTC `getTodayDateValue()` | **fixed here** (#440) |
| `employees/add-salary-payment-dialog.tsx` | `getAlgeriaDateInputValue()` + full-salary proposal | already today; owned by another lane |
| `employees/employee-details-page.tsx` | `getAlgeriaDateInputValue()` + full-salary amount, #420 follow | already today |

The one genuine defect is #440: the invoice create page seeded and submitted a
UTC day, not the Algeria business day. Between 23:00–24:00 UTC that is one
calendar day behind.

## Single definition of "today"

`getAlgeriaDateInputValue(date = new Date())` in `apps/web/src/lib/algeria-time.ts`
already IS the app's canonical `yyyy-MM-dd` today (39 call sites). The brief asked
to put the extracted helper in `apps/web/src/lib/date-range.ts`; doing that as a
second `getTodayDateValue` would create exactly the second copy of one rule that
we must not have. Decision: keep the single definition in `algeria-time.ts`
(the timezone-aware home for a day) and delete the private UTC copy. `date-range.ts`
stays about *ranges* (inclusive instant bounds), not about *today*.

## Changes

- `inventory-invoice-create-page.tsx`: delete private `getTodayDateValue`; seed
  the invoice date and asset purchase dates with `getAlgeriaDateInputValue()`;
  submit with `toAlgeriaDayBoundaryIso(day, "start")`.
- `expense-form-dialog.tsx`: `useDateField(getAlgeriaDateInputValue())` so a new
  expense is filled on the first render instead of empty-then-effect.

## Tests (red/green)

- Invoice page: default shows the Algeria day at 23:30 UTC (red on base: showed
  the UTC day); picked invoice/purchase days submit the exact
  `toAlgeriaDayBoundaryIso(day, "start")` instant (red on base: bare UTC midnight);
  default stays editable.
- Single definition: `tests/web-hygiene.test.mjs` scans all non-test web source
  and fails if any file defines a private today helper or fabricates a UTC day.
- Regression: `date-picker-screens.test.tsx` and `expense-form-dialog.test.tsx`
  assert each listed create/record form opens on today.

## Candidates deliberately NOT implemented (owner decision)

- `debts/record-payment-dialog.tsx` amount: default to the full outstanding
  balance? It already has a one-click "pay full" action; defaulting the value
  could silently change a partial-payment workflow.
- `expenses/expenses-page.tsx` date filter: currently seeds a default range, but
  rule #2 says a filter stays empty ("everything"). Needs a product call.

## Filters deliberately left empty / alone

`audit/audit-log-page.tsx` starts `startDate=""`/`endDate=""` (correct).
`debts/debt-cases-panel.tsx`, `debts/debt-ledger-panel.tsx`,
`debts/employee-debt-panel.tsx` are **create/record forms**, not filters; all
already default to today. `expenses/expenses-page.tsx` is a filter but seeds a
range (see above).
