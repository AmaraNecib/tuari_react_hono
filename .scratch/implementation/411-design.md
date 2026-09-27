# #411 — Expenses: a tab to record and manage spending

## Problem

Money that leaves the business for something that is not stock (a phone, fuel,
a repair) has no home. `payment` is money **in** (allocated to invoices); there
is no expense concept anywhere in the repo. The business keeps this on paper.

## Scope and decisions (from the grilling session, `.scratch/prototype/NOTES.md`)

One screen (**المصروفات**) in the shell's **المالية** group, combining the
prototype's A layout (filter bar + total strip + dense table) with B's three KPI
cards above the table and a **group by project** toggle over the same list. Not
two nav entries.

The record: `amount` · `expenseDate` · `whatFor` · optional responsible worker ·
optional seller · optional project · optional stock item · optional note. Every
field but the amount and date is optional; any combination is valid.

Rules enforced:

- **Tagging a project charges the whole amount to that project** — one record,
  no partial allocation.
- **An expense never writes stock.** `stockItemId` is a reference only; the
  expenses module has no inventory dependency.
- The **responsible worker** is the worker the money was handed to (an internal
  role, not a payee); the **seller** reuses the debts module's
  `external_counterparty` (`sellerId`), not a new party type.
- **Void, never delete** — the row stays visible and is excluded from totals.
- **Edits record who, when and an optional reason** on an `expense_revision`
  row, so the 50,000 → 45,000 correction survives.
- Cash the worker never returns is a debt, not an expense (out of scope).

## Public API

### Contracts (`packages/contracts/src/expenses.ts`, `expenses-contract.ts`)

- `amount` reuses `paymentAmountSchema` (positive, `Number.MAX_SAFE_INTEGER`
  bound) — one money rule, not a second one.
- `expenseSchema`, `expenseRevisionSchema`, `expenseWithRevisionsSchema`.
- `createExpenseInputSchema`, `updateExpenseInputSchema` (omitted field =
  untouched, explicit `null` = cleared, `reason` recorded on the revision),
  `voidExpenseInputSchema`, `expenseListInputSchema` / `expenseListOutputSchema`.
- List output carries the totals the screen needs: `totals` (total, count,
  tagged/untagged split, held-by-workers + worker count) and `groupsByProject`
  (projectId `null` = untagged, total, count).
- RPC: `expensesList`, `expensesGet`, `expensesCreate`, `expensesUpdate`,
  `expensesVoid`. Re-exported from `index.ts` and spread into `appContract`.

### API module (`apps/api/src/modules/expenses/`)

- `expenses.module.ts` — the deep service seam: validates the amount with the
  shared schema, computes totals/groups, enforces void-not-delete and
  voided-cannot-edit, records a revision inside the same transaction as the row
  update. Tagging is just `projectId` — the whole amount counts.
- `expenses.repository.ts` — the storage seam (`create`, `findById`, `list`,
  `update`, `voidExpense`, `createRevision`, `listRevisionsByExpenseId`,
  `runInTransaction`).
- `adapters/sqlite-expenses.repository.ts` — raw better-sqlite3 + the shared
  connection FIFO lock (`BEGIN IMMEDIATE`, nested-join aware), mirroring the
  payment repository.
- `adapters/in-memory-expenses.repository.ts` — the test double; mirrors the
  sqlite filter/order/void semantics and rolls the maps back when the
  transaction callback throws.
- Every mutation takes the existing `MutationAuditContext`; the composition root
  passes it from `withAudit`.

### Storage

- `apps/api/src/schema/expenses.ts` — Drizzle tables `expense` and
  `expense_revision`.
- `schema-definitions.ts` — idempotent `CREATE TABLE IF NOT EXISTS` for both plus
  the list-filter indexes; pinned by new assertions in
  `schema-definitions.test.ts`.
- **The optional references (`responsible_worker_id`, `seller_id`,
  `project_id`, `stock_item_id`) are plain TEXT with no foreign key**, mirroring
  `payment.counterparty_id`. They are soft cross-domain links; the service does
  not validate their existence, and this keeps the in-memory double honest (no
  DB-side rejection it cannot mirror).

### RBAC / licence

- New `expenses:create|read|update|delete` resource in `permissions.ts`.
  Bootstrap owners get `ALL_PERMISSIONS`, so the admin has them without a
  re-seed; the existing mutation licence middleware is not bypassed.
- Handlers: reads are `withPermission(expenses:read, withAuth(...))`; mutations
  are `withPermission(..., withAudit(...))`, so actor/timestamp/transaction and
  the writable-licence gate apply like every other mutation.

### Web (`apps/web/src/features/expenses/`)

- `expenses-queries.ts` — feature-scoped `expenses` workspace key (not part of
  the snapshot) + create/update/void mutations that invalidate it.
- `expenses-filters.ts` — pure filter-state → wire-filter builder (Algeria day
  boundaries, current-month default).
- `expenses-page.tsx` — KPI cards, filter bar (project · worker · date range),
  total strip, dense table, group-by-project toggle, add/edit/void dialogs.
- `expense-form-dialog.tsx` — add/edit form, optional selects, project-charge
  callout, edit reason.
- Wired as a lazy section in `home-view-page-content-detail-pages.tsx`, a route
  (`/expenses`), and a nav item **المصروفات** in the المالية group.
- All strings are i18n keys under `expenses.*` (Arabic resource; the repo has a
  single `ar` locale, not two).

## Tests

- `expenses.module.test.ts` — in-memory: create with every optional field and
  with none, invalid amount, totals split, group-by-project + deterministic
  ordering, filters, get + revisions, edit semantics (null clears, omitted
  untouched, no-op records no revision), void path (visible, excluded from
  totals, cannot void twice).
- `expenses.module.sqlite.test.ts` — the real adapter: round-trip, revision
  history, void persistence, transaction rollback when the revision write fails,
  and totals/groups parity with the in-memory adapter.
- `router.test.ts` — the wire gate for the money rule / blank text / non-uuid id
  through auth + permission + contract.
- `expenses-page.test.tsx` — render, KPI totals, total strip, table, filter
  wiring, group-by-project toggle, empty state.
- `expenses-filters.test.ts` — date-boundary and default-range logic.
- API coverage: `src/modules/expenses/**/*.ts` added to the 100%
  statements/branches/functions/lines include; measured 100%.

## Base / tier / risks

- Mode: remote; base ref `origin/develop`, base SHA `17911dc14211730bec6982707f518b4c84dafa19`.
- Review tier: Standard (new module + UI; the money rule is reused, not
  re-derived).
- Risks / constraints:
  - The expenses table is additive-only; existing databases pick it up on the
    next `ensureDatabaseSchema` run (no data migration needed).
  - `expense_revision` uses `ON DELETE RESTRICT`; expenses are never deleted, so
    this only guards a future hard-delete bug.
  - No E2E spec was added; the brief's test list is API + web unit tests, and the
    local E2E ports are shared/flaky in this batch. Flagged to the parent.
  - `sqlite-bootstrap.port.test.ts` (cross-connection write-lock contention) is
    a known pre-existing failure on this Windows host; reproduced on the base
    `develop` checkout.
