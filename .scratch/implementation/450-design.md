# #450 — the outbound write gate must enforce the picker's availability rule

**Issue**: #450 — `createOutboundTransfer` passes an item definition id where an
inventory entry id is expected, and lists asset units without narrowing to the
picked definition.

**Base**: `origin/develop` @ `073af118`. **Mode**: local-only (no remote PR in this lane).

**Dependencies**: none. Uses the existing `resolveItemOffer` / `matchesItemOfferFilter`
rule and `InventoryItemOfferSource` from `@tuari/contracts`; adds one repository read.

**Deviations from architecture**: none. The port/adapter split is kept — the read is a
`InventoryRepository` method implemented in `adapters/sqlite-inventory.repository.ts`.

**Playwright**: N/A. This is a backend write path with no UI change; the picker it must
agree with already has its own page tests from #465.

## The defect, confirmed

`createOutboundTransfer` (`apps/api/src/modules/inventory/inventory.service.ts`)
iterates `input.items`, whose `itemId` is a **definition** id (the wire contract,
the DB FK `inventory_outbound_transfer_item.item_id → inventory_item_definition.id`,
and the picker at `outbound-transfer-create-page.tsx` all agree on this). For a
CONSUMABLE it then:

1. calls `getConsumableBalanceByEntryAndLocation({ inventoryEntryId: item.itemId })`
   — a **definition** id in the **entry** id slot, and
2. creates the `OUTBOUND_SALE` movement with `inventoryEntryId: item.itemId` — same
   confusion.

For an ASSET it calls `listAssetUnitsByLocation({ warehouseId|projectId })` and
takes `.slice(0, quantity)` — an **unfiltered** read: the first `quantity` units at
the source regardless of definition.

Neither half is covered by a test today. The D8 tests (`inventory-debt-sign.test.ts`)
only ever transfer a single ASSET whose warehouse holds exactly one asset unit, so
the unfiltered slice picks the right one by accident; the consumable path was never
exercised. The consumable path throws `BUSINESS_RULE` on a lookup miss (the normal
case, since definition and entry ids are independent UUIDs); in the pathological
case where a definition id equals some unrelated entry's id, it silently decrements
that unrelated balance.

## Decision

The read side (#465) already states the rule once, as data:
`resolveItemOffer(outboundPickUsage(source))` → `{ itemTypes, activeOnly, inStockAt }`,
compiled to SQL by the paged picker and evaluated in JS by `matchesItemOfferFilter`.
The write gate must consult that same rule. It cannot do so today only because it
has no "where does definition X hold stock?" read — which is exactly the read the
issue asks for.

Add one repository read, `listItemStockAtSource({ itemDefinitionId, source })`,
returning the concrete rows that place a definition's stock at a source:

- `inventory_consumable_balance` rows for the definition at the source with
  `quantity > 0`;
- `inventory_asset_unit` rows physically at the source whose `inventory_entry`
  references the definition.

Both the picker's `inStockAt` predicate and this read are built from one private
`stockAtSourceWhere(source)` helper, so the warehouse/project column matching is
stated once.

The write gate then:

1. reads the definition (unchanged),
2. reads its stock at the source,
3. builds the `ItemOfferCandidate` from the rows it just read and runs
   `matchesItemOfferFilter(resolveItemOffer(outboundPickUsage(source)), candidate)`;
   rejecting when the picker would not have offered it (unknown, archived, or not
   present at the source),
4. mutates the rows the read returned.

That makes the picker and the gate two callers of one rule over one row set. A new
`inventory/outbound-transfer-availability.test.ts` drives the gate and the picker
over one fixture set and asserts they accept exactly the same definitions.

### Consuming a definition-level offer

The picker offers a **definition**, and a definition may hold stock in more than one
balance row at a source (one per purchase entry). The gate therefore consumes across
the source's balance rows in a deterministic order (`createdAt`, then `id`) and
creates one movement per consumed row — each with that row's real `inventoryEntryId`.
An asset item keeps one `OUTBOUND_SALE` movement per unit, mirroring `transferAsset`:
real `inventoryEntryId` plus `assetUnitId`, quantity 1. This removes the last place a
definition id could stand in for an entry id.

## Tests (red first)

`apps/api/src/modules/inventory/outbound-transfer-availability.test.ts`, over the
production schema:

1. a consumable transfer decrements its own definition's balance, **and** a
   definition id seeded to equal an unrelated entry's id is not the row it touches;
   the movement carries the real entry id.
2. an asset transfer moves only the picked definition's units, even when another
   definition's unit at the same source sorts first.
3. a definition whose stock is split across two balances at the source is consumed
   across both.
4. picker and write gate accept exactly the same definitions for a source
   (in-stock active consumable/asset accepted; elsewhere, archived, and empty
   rejected).

Each was run against the pre-fix implementation; results are in the handoff.

## Not in this change

- The inbound path does not share a helper with outbound. `transferConsumable`
  (`inventory.service.ts`) takes an `inventoryEntryId` and calls `getEntryById`
  before any balance write; `transferAsset` takes an `assetUnitId` and calls
  `getAssetUnitById`. Neither resolves a definition, so the outbound bug is not
  shared and there is nothing to fix there. Verified by reading both methods.
- Asset-unit identity in `OUTBOUND_SALE` movements for *reports* is unchanged in
  shape (still `OUTBOUND_SALE` from the source, no destination).
