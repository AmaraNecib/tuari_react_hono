# Issue #335 — payment_allocation FK: remove ON DELETE CASCADE, fail loud on raw deletes

**Tier:** High-assurance (debt financials)
**Base:** `3c14490` (origin/develop) — branch `refactor/issue-335`
**Predecessor:** #289 (payment validation + atomic guarded delete, landed on develop via #339, commit `004e2e5`)

## Problem

`payment_allocation.payment_id` is declared `ON DELETE CASCADE`
(`schema-definitions.ts:647`). The payment module's guarded
`deleteIfUnallocated` port (issue #289) is now the **only** safe delete path —
it refuses allocated payments with `PaymentHasAllocationsError` and deletes
only payments with zero allocations. But any *raw* `DELETE FROM "payment"`
(admin script, another module, a mis-wired caller) silently cascade-deletes the
allocations while the invoice stays `PAID` and the debt entry stays booked →
financial inconsistency with no error.

## Decision — Option 1 (recommended): remove the CASCADE, FK becomes RESTRICT

- **FK `ON DELETE RESTRICT`** on `payment_allocation.payment_id`. A raw
  `DELETE FROM "payment"` on an allocated payment now throws
  `FOREIGN KEY constraint failed` loudly instead of silently cascading.
- **Guarded port unchanged in behavior** (issue #289 acceptance must hold):
  `deleteIfUnallocated` still returns `HAS_ALLOCATIONS` and deletes nothing for
  allocated payments, and `DELETED` for zero-allocation payments. Because the
  port only deletes when the in-transaction COUNT is 0, there are **no
  allocations to delete explicitly** — the "delete allocations explicitly"
  phrasing of the option applies to any *future* deliberate allocated-delete
  flow, which does not exist today. RESTRICT adds belt-and-braces: if the
  COUNT guard were ever bypassed, the DELETE now fails loudly rather than
  cascade-deleting.
- **Rejected — Option 2 (keep CASCADE + audit every raw delete path):** an
  audit is a paper guarantee; nothing stops a future raw delete. The DB-level
  constraint is the enforceable invariant for a financial module.

### Why not keep CASCADE and just audit

The whole point of #289's guarded port is that the *module* cannot be trusted
to be the only writer. A constraint that silently destroys financial links is
a footgun for every future caller; RESTRICT makes the danger visible at the
DB layer.

## Schema / migration changes

SQLite cannot `ALTER` an FK constraint, so:

1. **Fresh databases** — `schema-definitions.ts`:
   `payment_allocation_payment_id_fkey` → `ON DELETE RESTRICT` in the
   `CREATE TABLE IF NOT EXISTS "payment_allocation"` statement.
2. **Existing databases** — new idempotent migration
   `applyPaymentAllocationRestrictMigration` (pure, exported for tests, wired
   into `ensureDatabaseSchema` after the debt migrations, same pattern as
   `applyDebtAccountBalanceRename`):
   - skip if `app_schema_state` has the new key
     (`payment_allocation_restrict_fk_v1`);
   - if the live table's `sqlite_master` SQL already contains
     `ON DELETE RESTRICT` (fresh DB fast path), record the key and return;
   - otherwise rebuild the table: `PRAGMA foreign_keys = OFF` →
     transaction { rename table to `payment_allocation_legacy`, create the
     new RESTRICT table, copy rows, drop legacy, recreate the two indexes,
     record the state key } → `PRAGMA foreign_keys = ON` (finally).
3. **Drizzle declaration** — `apps/api/src/schema/payment.ts`:
   `references(() => payment.id, { onDelete: "restrict" })` so the ORM
   declaration matches the enforced schema (note: this drizzle table is not
   used for runtime queries; it is a declaration-consistency change).

`payment_allocation.invoice_id` FK (`ON DELETE CASCADE`) is **out of scope** —
the issue targets `payment_id` only; invoice deletion semantics are a separate
question (noted as a follow-up observation in risks).

## Files touched

| File | Change |
|---|---|
| `apps/api/src/infrastructure/database/schema-definitions.ts` | FK `CASCADE` → `RESTRICT` (fresh DB); export `paymentAllocationRestrictMigrationKey` |
| `apps/api/src/infrastructure/database/schema.ts` | new `applyPaymentAllocationRestrictMigration` (exported) + `runPaymentAllocationRestrictMigration` wrapper, wired into `ensureDatabaseSchema` |
| `apps/api/src/schema/payment.ts` | drizzle `onDelete: "cascade"` → `"restrict"` |
| `apps/api/src/infrastructure/database/schema-definitions.test.ts` | pin fresh-DB `payment_allocation` DDL has `ON DELETE RESTRICT` |
| `apps/api/src/infrastructure/database/schema-migrations.test.ts` | migration: legacy CASCADE → RESTRICT, data preserved, idempotent, raw delete fails after migration |
| `apps/api/src/modules/payment/adapters/payment.repository.test.ts` | **core acceptance test**: raw `DELETE FROM payment` on an allocated payment fails loudly; raw delete on an unallocated payment still works |

No changes to the guarded port (`deleteIfUnallocated`), the module, the RPC
handlers, or the contracts — behavior is preserved.

## Planned tests (TDD — failing first)

1. **Raw-delete regression (sqlite adapter, `payment.repository.test.ts`)** —
   the acceptance criterion: create payment + allocation, raw
   `DELETE FROM "payment"` must throw `FOREIGN KEY constraint failed` and leave
   both rows intact. Red on CASCADE (silently deletes), green on RESTRICT.
2. **Raw delete of an unallocated payment still succeeds** — RESTRICT must not
   over-block.
3. **Migration tests (`schema-migrations.test.ts`)** — legacy DB with CASCADE
   FK + rows → after `applyPaymentAllocationRestrictMigration`: `sqlite_master`
   shows `ON DELETE RESTRICT`, rows preserved, state key recorded; re-run is a
   no-op; fresh-DB fast path records the key without rebuilding; raw delete
   fails on the migrated DB.
4. **Schema-definitions pin** — `payment_allocation` CREATE TABLE declares
   `ON DELETE RESTRICT`, not `CASCADE`.
5. **Existing guarded-delete regressions stay green** — `deleteIfUnallocated`
   NOT_FOUND / HAS_ALLOCATIONS / DELETED (repository test), module sqlite
   "delete refuses a payment with allocations and leaves invoice/debt state
   intact", in-memory module tests, invoice-payment-workflow integration.

## Risks / notes

- **Migration ordering**: runs after the debt migrations in
  `ensureDatabaseSchema`; it only touches `payment_allocation` (created by
  schemaStatements on every startup), so ordering vs. other migrations is
  non-interacting.
- **`PRAGMA foreign_keys` toggling**: OFF is set outside the transaction and
  ON restored in `finally`, matching `runInvoiceDebtLinkageMigration` /
  `applyDebtAccountBalanceRename`. `app_schema_state` insert is inside the
  same transaction as the rebuild (atomic).
- **Index recreation**: renaming the legacy table carries its indexes along;
  they are dropped with the legacy table and recreated `IF NOT EXISTS` on the
  new table.
- **Out of scope observation**: `payment_allocation.invoice_id` still cascades
  on invoice delete — a sibling inconsistency (invoice deletion is not exposed
  today). Noted for a follow-up, not changed here (scope discipline).
- **Coverage**: `schema-definitions.ts` / `schema.ts` / migration tests are
  not under the 100% module include (they live in `infrastructure/`); the new
  branches are still pinned by the tests above.
- **No Rust Core / web changes** — API + contracts-adjacent (drizzle
  declaration) only.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test:api`
- Guard Phase 1 (pre-commit): contracts build, typecheck, lint, test:api,
  test:web.
