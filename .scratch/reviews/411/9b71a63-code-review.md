# #411 — Code review evidence (PR #419 review round)

- Reviewed commit: `9b71a63eda49c3fe6beae1eba0efd105caf5dbec`
- Base: `origin/develop` @ `52796e1545fd4b3e69eda793ff70e10ea7e50cb6`
- Tier: Standard (parent decision)
- Prior evidence: `11ac8dd-*` (superseded by this round)
- Diff: `git diff 52796e1...9b71a63`

## What this round addressed

Hosted Greptile scored the previous head 0/5 with 11 findings. Each was verified
against the code, then fixed or, for finding 11, fixed at the owning boundary.

| # | Finding | Resolution |
| --- | --- | --- |
| 1 | `create`/`voidExpense` write without the FIFO lock | `runSyncTransaction` around every sync write site (create, update, void, revision). A foreign open transaction now raises `FifoLockBusyError` instead of absorbing + rolling back the write. Regression: sqlite test holds a transaction open and asserts the create is refused and leaves no row. |
| 2 | Edit path reads/computes before the lock | Whole read-modify-write moved inside `repo.runInTransaction`; revision is computed from the locked row; voided rows rejected; repo `UPDATE` also guarded by `status = 'LIVE'`. |
| 3 | Form feeds `yyyy-MM-dd` to a `dd/MM/yyyy` picker | `toDatePickerValue`/`fromDatePickerValue` adapters in `date-picker.tsx`; form + filter bar use them. |
| 4 | UTC `slice(0, 10)` display | `formatAlgeriaDate` (Africa/Algiers pinned) for both list renderings. |
| 5 | Edit offered on voided rows | Edit + void only on LIVE rows; voided rows show a short note. |
| 6 | `void handleSubmit()` drops the rejection | `await` inside try/catch; toast still fires, dialog stays open, no unhandled rejection. |
| 7 | `stockItemId` never collected | Optional stock-item select; page receives `stockItems` from `useInventoryItemDefinitionsQuery`. |
| 8 | Revision records only amounts | `expense_revision.changed_fields` JSON array + `expenseRevisionSchema.changedFields`; additive ALTER, default `'[]'`. |
| 9 | Whole-dinar formatter vs fractional schema | Formatter now shows up to 2 decimals. |
| 10 | Range predicates compare text | `toUtcInstant` normalizes stored dates and filter bounds; SQLite lexicographic compare is now instant compare. |
| 11 | `withAudit` cannot map async failures | Verified real (`return handler(...)` inside `try`). Fixed locally in `rpc/handlers/expenses.ts` (`withMappedExpenseErrors`) to avoid changing the shared middleware for every handler. |

## Standards axis (repo conventions)

| Convention | Verdict |
| --- | --- |
| One money rule | `amount` still reuses `paymentAmountSchema`; the display now matches its fractional range. |
| Sync-writer discipline | Every expense write uses `runSyncTransaction`, matching company/inventory (#322/#348). |
| Transaction discipline | Writes join an outer transaction (savepoint) and hold `BEGIN IMMEDIATE` when outermost. |
| Idempotent DDL | New `changed_fields` column in `CREATE TABLE` + additive `ALTER` for existing DBs. |
| Audit context | Mutations still take `MutationAuditContext` from `withAudit`. |
| i18n | New strings are `expenses.*` keys. |
| Staging / artifacts | Explicit `git add`; regenerated `playwright-report/index.html` restored to HEAD. |
| Coverage gate | `src/modules/expenses/**/*.ts` measured at 100% statements/branches/functions/lines. |

## Spec axis (issue #411 acceptance)

| Acceptance | Verdict |
| --- | --- |
| CRUD + audit fields | Unchanged; still covered. |
| Value changes recorded | Now records which fields changed, including project/date/worker/seller. |
| Tagging charges the whole amount | Unchanged. |
| Void stays visible, excluded from totals, cannot edit | Unchanged + Edit hidden in the UI. |
| Never writes stock | Unchanged; stock item is a reference only. |

## Findings

1. **Unpaginated list (known, accepted).** Server-computed totals/groups over the
   filtered rows; fine for the MVP dataset.
2. **Shared `withAudit` async gap (reported, out of this PR).** Payment/invoice
   async handlers pass resolvers to `withAudit` that never run because the
   helper does not await. The expenses handler is fixed locally; the shared fix
   (or per-handler fixes there) is a parent decision, not silently deferred here.
3. **Blank optional text on a direct module call (minor).** Wire gate rejects
   blank; direct callers are trusted. Defense-in-depth only.

No blocking findings.
