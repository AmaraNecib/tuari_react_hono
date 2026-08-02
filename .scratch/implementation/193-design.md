# Design — issue #193: extract InventoryRepository interface from implementation

**Tier:** Standard (structural refactor of production code; no authz/security/RBAC changes)
**Base:** `develop` @ `80d4926f029c3facee7dd17eb28da174c6e01f3b` (merge-base == HEAD)
**Branch:** `refactor/issue-193-extract-inventory-repository`

## Scope

Pure file split of `apps/api/src/modules/inventory/inventory.repository.ts`:

1. `modules/inventory/inventory.repository.ts` — keeps only the
   `InventoryRepository` interface (the port).
2. `modules/inventory/adapters/sqlite-inventory.repository.ts` — receives the
   Drizzle implementation (row-mapper functions, `DrizzleInventoryRepository`
   class, `createInventoryRepository` factory).
3. Update every importer of the implementation to the new adapter path.

**No behavior changes. No interface changes.** Mirrors the existing
invoice-module split (`modules/invoice/invoice.repository.ts` = port,
`modules/invoice/adapters/invoice.repository.ts` = Drizzle adapter) and the
workforce adapters (`modules/workforce/adapters/*.repository.ts`).

## Public API (unchanged)

- `InventoryRepository` interface — identical member list, signatures, and
  JSDoc. Lives in `modules/inventory/inventory.repository.ts`.
- `createInventoryRepository(rawDb: BetterSqliteDatabase): InventoryRepository`
  — factory, now exported from the adapter file.
- `DrizzleInventoryRepository` class — kept exported (nothing external imports
  it today; exporting matches the invoice adapter's exported class pattern).
- Row-mapper functions (`mapItemDefinition`, `mapInvoiceGroup`, …) and
  `resolveLocationLabelByIds` — module-private in the adapter, as today.

## Dependencies

- Adapter imports `type { InventoryRepository }` from
  `../inventory.repository` (the port file).
- Adapter keeps its existing imports: `drizzle-orm`, `BetterSQLite3Database`,
  `BetterSqliteDatabase`, `schema`, `createDrizzleFromSqlite`,
  `normalizeAuditContext`, `createAlgeriaTimestamp`, `MutationAuditContext`,
  `./inventory.types`.
- Port file imports only types: `./inventory.types` + `MutationAuditContext`
  from `../company/company.types`.

## Import updates

| File | Change |
|---|---|
| `app/dependencies.ts` | `createInventoryRepository` import → `../modules/inventory/adapters/sqlite-inventory.repository` |
| `modules/inventory/inventory.service.ts` | No change — already imports the interface only |
| `tests/integration/inventory-transfer-workflow.test.ts` | Split: `createInventoryRepository` from adapter, `type InventoryRepository` from port |

## Planned tests

No new tests. Acceptance criterion: **all existing tests pass unchanged** —
the interface and factory signatures are identical, so the integration test
(`inventory-transfer-workflow.test.ts`) exercises the adapter through the same
seam. Local verification: `pnpm --filter @tuari/contracts build`,
`pnpm typecheck`, `pnpm lint`, `pnpm test:api`.

## Implementation risks

- **Stale imports** — the split is only correct if every reference to the
  implementation path is updated. Mitigation: grep for `inventory.repository`
  and `createInventoryRepository` after the move; typecheck catches residue.
- **Import cycles** — none: port file imports only types; adapter imports the
  port; nothing imports the adapter from the port.
- **Doc-comment duplication** — the current file carries duplicate interface
  and class JSDoc blocks; dedupe as part of the move (comment-only change).
