# #450 — verification evidence

- **Issue**: #450
- **Branch**: `fix/450-outbound-entry-id`
- **Reviewed code HEAD**: `e37e2561`
- **Base**: `origin/develop` @ `073af118`
- **Design**: `.scratch/implementation/450-design.md`

## What changed

`createOutboundTransfer` now resolves the picked **definition** to the stock rows
that hold it at the transfer's source, instead of passing the definition id where
an entry id was expected and listing assets unfiltered.

- `InventoryRepository.listItemStockAtSource({ itemDefinitionId, source })` —
  new read returning the balance rows and asset units that place the definition's
  stock at the source. The picker's `inStockAt` SQL and this read share one
  `stockAtSourceWhere(source)` predicate.
- The write gate evaluates `resolveItemOffer(outboundPickUsage(source))` through
  `matchesItemOfferFilter` against the rows it just read, so the picker and the
  gate accept the same set.
- Consumable stock is consumed across every balance at the source (oldest first);
  one `OUTBOUND_SALE` movement per balance, each naming its real `inventoryEntryId`.
- Asset items move only the picked definition's units; one movement per unit with
  `assetUnitId`, mirroring `transferAsset`.
- Contract comment on `outboundTransferItemInputSchema.itemId` states it is a
  definition id.

Files: `inventory.service.ts`, `inventory.types.ts`, `inventory.repository.ts`,
`adapters/sqlite-inventory.repository.ts`, `outbound-transfer-availability.test.ts`
(new), `rpc/handlers/reports.test.ts` (stale comment), `packages/contracts/src/inventory.ts`.

## Red — new tests against the pre-fix code

`outbound-transfer-availability.test.ts` run with the production files reverted
(`git stash` of the source changes): **4 failed / 4**.

```
FAIL  > decrements the balance of the picked definition, not an entry that shares its id
      AssertionError: expected 100 to be 90
FAIL  > consumes a definition's stock across every balance at the source
      InventoryError: الكمية المطلوبة من def-split غير متوفرة.
FAIL  > moves only the picked definition's asset units, not the first units at the source
      AssertionError: expected 'wh-1' to be null
FAIL  > agrees with the paged picker for a warehouse source
      AssertionError: expected [ 'a-instock' ] to deeply equal [ 'a-instock', 'c-instock' ]
Test Files  1 failed (1)
Tests       4 failed (4)
```

Each failure is the defect, not a fixture artefact:

- test 1 seeds definition `def-a` and an unrelated entry whose id is also `def-a`;
  the old code found that entry's balance and left the picked definition's balance
  at 100 (expected 90).
- test 2's split balance (30 + 70) missed the entry lookup entirely.
- test 3's old code moved the first unit at the source by `updatedAt`, which was the
  other definition's unit.
- test 4's old gate accepted the asset but not the in-stock consumable.

## Green — same tests on `e37e2561`

```
pnpm --filter @tuari/api exec vitest run \
  src/modules/inventory/outbound-transfer-availability.test.ts \
  src/modules/inventory/item-offer-equivalence.test.ts \
  src/modules/inventory/inventory-debt-sign.test.ts
→ Test Files 3 passed (3); Tests 28 passed (28)
```

Targeted real-sqlite inventory suite (10 files, includes the transfer↔charge,
debt-sign, equivalence, storage and integration files):

```
pnpm --filter @tuari/api exec vitest run src/modules/inventory \
  src/tests/integration/inventory-transfer-workflow.test.ts \
  src/rpc/handlers/reports.test.ts
→ Test Files 10 passed (10); Tests 128 passed (128)
```

## Static checks

```
pnpm typecheck   → exit 0 (4 tasks successful)
pnpm lint        → exit 0 (eslint api + web; unslop PASS)
```

## Full API suite — pre-existing flakiness, not this diff

`pnpm --filter @tuari/api test` fails 15–20 tests in `auth/`, `backup/` and
`update/` with `Hook timed out in 10000ms` / SQLite lock contention. None is in a
file this diff touches. Reproduced on the base with the fix stashed:

```
# git stash <the 4 source files + reports.test.ts>, then:
vitest run src/modules/update/update-history.service.test.ts
→ Test Files 1 failed (1); Tests 1 failed | 10 passed
   Error: Hook timed out in 10000ms.
```

Same hook timeout without the change, so the failures are environmental
(machine/DB contention), not caused by this branch.

## Risks

- Consumable outbound was previously always broken (lookup miss); multi-balance
  consumption and per-balance movements are new behaviour with no pre-existing
  contract. Covered by tests 1–2.
- Asset outbound movement granularity changed from one movement per item row to one
  per unit, matching `transferAsset`. No existing test asserted the old shape; the
  MOVEMENT report test seeds its outbound movement directly.

## Next

Parent owns push/PR. Not done here: push, PR, merge.
