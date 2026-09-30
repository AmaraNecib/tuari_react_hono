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
| `expenses/expense-form-dialog.tsx` | hook + effect set today on open | hook now supplies today |
| `inventory/transfer-item-dialog.tsx` | `getAlgeriaDateInputValue()` | already today |
| `inventory/inventory-invoice-create-page.tsx` | private UTC `getTodayDateValue()` | **fixed here** (#440) |
| `employees/add-salary-payment-dialog.tsx` | `getAlgeriaDateInputValue()` + full-salary proposal | already today |
| `employees/employee-details-page.tsx` | `getAlgeriaDateInputValue()` + full-salary amount, #420 follow | already today |

The one genuine date defect is #440: the invoice create page seeded and submitted
a UTC day, not the Algeria business day. Between 23:00–24:00 UTC that is one
calendar day behind.

## Single definition of "today"

`getAlgeriaDateInputValue(date = new Date())` in `apps/web/src/lib/algeria-time.ts`
already IS the app's canonical `yyyy-MM-dd` today (39 call sites). The brief asked
to put the extracted helper in `apps/web/src/lib/date-range.ts`; doing that as a
second `getTodayDateValue` would create exactly the second copy of one rule that
we must not have. Owner decision: keep the single definition in `algeria-time.ts`
(the timezone-aware home for a day) and delete the private UTC copy. `date-range.ts`
stays about *ranges* (inclusive instant bounds), not about *today*.

## Changes

- `inventory-invoice-create-page.tsx`: delete private `getTodayDateValue`; seed
  the invoice date and asset purchase dates with `getAlgeriaDateInputValue()`;
  submit with `toAlgeriaDayBoundaryIso(day, "start")`.
- `shared/use-form-amount.ts`: `useDateField` defaults its initial value to
  `getAlgeriaDateInputValue()`, so "a date field starts today" is stated once, in
  the type, instead of in every caller. Every call site (`employee-debt-panel`,
  `record-payment-dialog`, `add-salary-payment-dialog`, `expense-form-dialog`)
  drops the explicit argument. `add-salary-payment-dialog`'s full-salary amount
  proposal is untouched.
- `expenses-page.tsx`: the date filter opens EMPTY (`""`/`""`); an empty filter
  means "everything" and must not silently hide expenses older than a seeded
  range. `getDefaultExpenseDateRange` is deleted as dead code.

### Q1 decision (recorded, not implemented)

The debt payment amount stays EMPTY. The one-click "pay full" action is the only
explicit path to the full balance. Owner: "for now it's empty. Maybe in the
future we change it, if the owner of the app asks me." Do not prefill it, add a
hidden default, or add a setting.

## Tests (red/green)

- Invoice page: default shows the Algeria day at 23:30 UTC (red on base: showed
  the UTC day); picked invoice/purchase days submit the exact
  `toAlgeriaDayBoundaryIso(day, "start")` instant (red on base: bare UTC midnight);
  default stays editable.
- `useDateField`: `useDateField()` starts on today's Algeria day, not empty
  (red before the hook change).
- `expenses-page`: first render applies no date filter (`filters` is `{}`, both
  pickers show the placeholder) — red before the filter change (it seeded a
  current-month range).
- Single definition: `tests/web-hygiene.test.mjs` scans all non-test web source
  and fails if any file defines a private today helper, fabricates a UTC day, or
  passes an explicit date to `useDateField`.
- Regression: `date-picker-screens.test.tsx` and `expense-form-dialog.test.tsx`
  assert each listed create/record form opens on today.

## Filters left empty

`audit/audit-log-page.tsx` and `expenses/expenses-page.tsx` both start empty.
`debts/debt-cases-panel.tsx`, `debts/debt-ledger-panel.tsx`,
`debts/employee-debt-panel.tsx` are create/record forms, not filters, and all
default to today.
