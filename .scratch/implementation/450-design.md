# #450 — the outbound write gate must enforce the picker's availability rule

**Issue**: #450 — `createOutboundTransfer` passes an item definition id where an
inventory entry id is expected, and lists asset units without narrowing to the
picked definition.

**Base**: PR #477 head `338cbde3c9b3a5645c98e86f9bdd70a15a41d6b6`, verified against fetched `origin/fix/450-outbound-entry-id`.
**Mode**: bounded implementation child, local commit only. Parent owns independent reviews and publication.
**Tier**: HIGH-ASSURANCE, quantity allocation affects business and financial invariants.

**Dependencies**: none. Uses the existing `resolveItemOffer` / `matchesItemOfferFilter`
rule and `InventoryItemOfferSource` from `@tuari/contracts`; adds one repository read.

**Deviations from architecture**: none. The port/adapter split is kept — the read is a
`InventoryRepository` method implemented in `adapters/sqlite-inventory.repository.ts`.

**UI scope**: the PR also corrects V2 picker definition IDs, keeps concrete
balance/unit `optionId` for deduplication, and returns the create-result envelope.
Render tests cover the V2 picker callback and existing outbound create page.
No new UX is introduced by this follow-up. Browser/full-suite/build validation
is deferred to parent scheduling under the aggregate CPU policy.

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

## Quantity consistency follow-up

Normalize the outbound item array once without mutating the caller. Both stock
consumption and persisted transfer items use it, preserving optional price fields.
The create envelope returns only a transfer header, with no quantity field. Assert
persisted item quantity, movement quantity and remaining balance through the real
SQLite service seam. Item rows have no repository read API, so that assertion uses
one SQL read linked to the returned transfer ID; no response shape change is needed.

For legacy balances with more than six decimals, availability must sum the same
per-balance rounded quantities allocation uses. Deduct from those quantities,
skip normalized empty rows and reject a surviving normalized remainder inside the
transaction. Test the reported `[1.0000014, 1.0000014]` shortage, exact normalized
fulfillment, and rollback of earlier items when a later allocation fails.

The agreed seams are the real SQLite outbound service/repository, existing quantity
helper tests, and the V2 picker's rendered controls plus `onItemsChange` callback.
Quantity regressions must fail on the pinned PR production code. The missing
picker test is a coverage gap, not itself a production bug; its baseline can pass.

Out of scope by parent decision: rounding extraction #480, shared-link fleet
changes #491, and fractional UI changes. The V2 picker starts every selection at
quantity 1, clamps edits with `Math.max(1, quantity)`, and renders `min="1"` without
a fractional step. Stock below one starts above its maximum, and ordinary
fractional selections cannot be entered reliably. Proposed separate follow-up:
consumable-aware min/step/default quantity with render tests; preserve integer
asset controls. It does not block this lane's server precision fix or require a
lane reorder. Parent already excluded this UX change.

## Not in this change

- The inbound path does not share a helper with outbound. `transferConsumable`
  (`inventory.service.ts`) takes an `inventoryEntryId` and calls `getEntryById`
  before any balance write; `transferAsset` takes an `assetUnitId` and calls
  `getAssetUnitById`. Neither resolves a definition, so the outbound bug is not
  shared and there is nothing to fix there. Verified by reading both methods.
- Asset-unit identity in `OUTBOUND_SALE` movements for *reports* is unchanged in
  shape (still `OUTBOUND_SALE` from the source, no destination).
