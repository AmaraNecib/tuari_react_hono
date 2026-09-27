# #411 — Code review evidence

- Reviewed commit: `4197c1b253c2842cb801867644184b9d57ee8787`
- Base: `origin/develop` @ `17911dc14211730bec6982707f518b4c84dafa19`
- Tier: Standard
- Diff: `git diff 17911dc...4197c1b` (37 files, +~3400)

## Standards axis (repo conventions)

| Convention | Verdict |
| --- | --- |
| Contract module style (`payment.ts` / `payment-contract.ts`) | Follows the same shape; schemas in `expenses.ts`, `oc` router in `expenses-contract.ts`, re-exported from `index.ts` and spread into `appContract` (the #206 barrel lesson). |
| One money rule | `amount` reuses `paymentAmountSchema`; no second money definition. |
| Idempotent DDL + test | `CREATE TABLE IF NOT EXISTS` added to `schema-definitions.ts` and pinned by new assertions in `schema-definitions.test.ts`. |
| Module shape | Service + `ExpensesModule` interface + `ExpenseRepository` seam + sqlite/in-memory adapters, mirroring `payment`/`company`. |
| Audit context | Every mutation takes `MutationAuditContext`; handlers pass it from `withAudit`, so actor/timestamp/transaction are recorded. |
| Licence gate | Not bypassed: mutations go through `withAudit` (which calls `createAuditContextForUser` → `requireWritableLicense`). |
| RBAC | New `expenses:*` resource; bootstrap owners get it via `ALL_PERMISSIONS` (no re-seed needed). |
| Void, never delete | `status = 'VOIDED'`, row retained, excluded from totals; covered by tests. |
| Transaction discipline | `runInTransaction` uses the shared connection FIFO lock + `BEGIN IMMEDIATE` and joins an outer transaction (`db.inTransaction`), matching the #289/#348 lessons. |
| i18n | Every user-facing string is an `expenses.*` key; no hardcoded Arabic in components (the `ar` resource is the only locale in this repo). |
| Staging / artifacts | Explicit `git add`; regenerated `apps/desktop/src-tauri/bin/*` and `gen/schemas/*` restored to HEAD before commit. |
| Coverage gate | `src/modules/expenses/**/*.ts` added to the 100% include; measured 100/100/100/100. |

## Spec axis (issue #411 acceptance)

| Acceptance | Verdict |
| --- | --- |
| CRUD through RPC + service + repository, with audit fields | `expensesCreate/Update/Void/List/Get`; service + sqlite/in-memory repos; audit columns persisted. |
| Value changes recorded with actor, timestamp, optional reason | `expense_revision` row written inside the same transaction as the row update. |
| A project's expenses are queryable | `expensesList({ filters: { projectId } })`, pinned by a service test. |
| Tests: service/repository, optional-field combos, void path, tagging rule | Covered (see test audit). |
| Full i18n keys for Arabic RTL | `expenses.*` block added to `ar.ts`; screen is RTL. |
| Tagging a project charges the whole amount | `projectId` is a single reference; totals/groups count the whole amount; pinned. |
| Never writes stock | No inventory dependency; a sqlite test seeds an item and asserts it and `inventory_movement` are untouched. |
| Responsible worker vs seller | `responsibleWorkerId` (employee) and `sellerId` (existing `external_counterparty`) are distinct fields. |

## Findings

1. **Unpaginated list (known, accepted).** `expensesList` returns every filtered
   row plus server-computed totals/groups so the screen can group without a
   second round-trip. Fine for the MVP data size; a very large dataset would
   need server-side aggregation/pagination. Recorded as a known limitation, not
   a defect.
2. **ISO string date comparison (minor).** The sqlite/in-memory adapters compare
   `expense_date` as strings. Correct for the UTC boundary strings the web
   sends (`toAlgeriaDayBoundaryIso`), and consistent with the existing
   payment/invoice string comparisons, but a caller sending non-UTC offsets
   could misorder. No action for this issue.
3. **Blank optional text on a direct module call (minor).** The wire gate trims
   and rejects blank `whatFor`/`note`; the module stores what it is given, so a
   direct caller could persist `""`, which the output schema would then reject.
   The handler only passes wire-validated input, so this is defense-in-depth
   only. No action.
4. **No E2E spec (process note).** The lane brief scoped tests to API + web
   unit; flagged to the parent rather than adding an unrun Playwright spec.

No blocking findings. Verified each spec rule against the current code, not the
commit message.
