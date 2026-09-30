# Outbound transfer item picker — the availability rule (#465)

**Issue**: #465 — the outbound transfer's item picker offers archived definitions and
needs an availability rule.
**Lane**: `fix-outbound-selector` (worktree `worktrees/fix-outbound-selector`)
**Branch**: `fix/outbound-selector`
**Base**: `fix/invoice-create` @ `651df4eb13579d12a2a922ee580225dc1d11b863` (#463, still open).
**Mode**: remote (parent owns push/PR; this lane never merges).
**Tier**: Standard.

## Why the base is stacked, not `develop`

The item-offer seam this issue extends — `packages/contracts/src/inventory-item-usage.ts`,
the usage-scoped `inventoryItemDefinitionOptions` read, and the SQL/JS equivalence test —
exists only on `fix/invoice-create` (#463), which is still an open PR. `origin/develop`
does not contain it. The lane therefore branched from `fix/invoice-create`'s head so the
diff is exactly this issue's change; the parent decides the final base/order when #463
lands. Reviewed diff vs `fix/invoice-create` @ `651df4eb`.

## Problem

`apps/web/src/features/inventory/outbound-transfer-create-page.tsx` still calls the
UNPAGED `useInventoryItemDefinitionsQuery()` and feeds every definition (including
archived ones) into `ItemListEditor`. The invoice picker and the expense selector were
moved onto the usage seam by #463; this is the last selection consumer on the old read.

Unlike the expense selector ("either kind, active only"), the outbound surface picks
items that are about to **leave** the business. The honest rule is availability: a
definition with no stock at the chosen source must not be offerable, and an archived
definition must not be either.

## Rule (contracts)

A new `InventoryItemUsage` member:

```ts
{ surface: "OUTBOUND_PICK", source:
    { locationType: "WAREHOUSE", warehouseId: string }
  | { locationType: "PROJECT",   projectId: string } }
```

`resolveItemOffer` resolves it to:

```ts
{ itemTypes: ["CONSUMABLE", "ASSET"], activeOnly: true, inStockAt: source }
```

### Does availability fit `{ itemTypes, activeOnly }`?

No. Those two fields describe facts about the definition alone; availability is a fact
about (definition, source). The filter therefore gains a field:

```ts
inStockAt?: InventoryItemOfferSource   // "only offer definitions holding stock here"
```

Adding the field obliges **both** evaluators, as the issue warns:

- **SQL** (`SqliteInventoryRepository.listItemDefinitionsPaged`) compiles `inStockAt` to
  `EXISTS(consumable balance at this source with quantity > 0) OR EXISTS(asset unit
  currently at this source whose entry references the definition)`.
- **JS** (`matchesItemOfferFilter`, the write-gate and equivalence evaluator) reads the
  candidate's stock locations.

`ItemOfferCandidate` gains `stockWarehouseIds?: readonly string[]` and
`stockProjectIds?: readonly string[]` — the locations where the definition currently
holds stock. A candidate with no recorded stock is not available anywhere.

### Semantics

- **Consumable**: a row in `inventory_consumable_balance` for that definition at the
  source with `quantity > 0`.
- **Asset**: an `inventory_asset_unit` currently at the source whose `inventory_entry`
  references the definition. (An asset's availability is its physical presence.)
- The SQL predicate checks both tables regardless of the definition's type, so a
  mis-typed row still matches on the same evidence the JS evaluator saw; the
  equivalence test pins this.

### Cursor scope

The paged read fingerprints filter + search into the cursor. `inStockAt` joins that
fingerprint, so a cursor produced for warehouse A is reset (not misused) when the page
switches to warehouse B.

## Web

- `outbound-transfer-create-page.tsx` stops calling `useInventoryItemDefinitionsQuery()`.
  It derives an `OUTBOUND_PICK` usage from `fromType`/`fromId` and renders the list
  editor only once a source is selected (the rule is undefined without a source).
- `ItemListEditor` (private to this page) now renders the existing `ItemOptionPicker`
  per row instead of a plain `<Select>` over the full catalog. That is the paged,
  filtered adapter: it owns search, the cursor chain, page accumulation and rendering a
  selected option that is not on the loaded page. Row state changes from
  `itemId: string` to `itemOption: InventoryItemDefinition | null`; the selected option
  object is the evidence the row holds, mirroring the invoice row.
- `itemUsageKey` in `inventory-hooks.ts` gains the `OUTBOUND_PICK` source. Without it,
  an outbound usage would key as `STOCK_REFERENCE` and share a cache entry with the
  expense selector.
- New i18n key `inventory.transfer.chooseSourceFirst` (Arabic). No new hard-coded UI
  text; the picker's strings come from the existing keys.
- When the source changes after rows exist, the rows keep their selected options and
  re-query against the new source; the server write gate rejects an unavailable row.
  Clearing rows on a source switch would discard typed quantities, so it is left alone
  and recorded as a decision.

## Tests

- `packages/contracts/src/inventory-item-usage.test.ts`: `resolveItemOffer` returns
  `inStockAt` for `OUTBOUND_PICK`; the JS evaluator accepts an active in-stock candidate,
  rejects no-stock, wrong-location and archived candidates; the zod schema carries the
  source.
- `apps/api/src/modules/inventory/item-offer-equivalence.test.ts`: `OUTBOUND_PICK`
  usages (warehouse and project) join the `USAGES` sweep, so SQL and JS must agree for
  every fixture; fixtures gain stock locations and the setup inserts the matching
  balance/asset rows. Explicit traps: an archived definition that HAS stock is still not
  offered; a definition with no stock at the source is not offered; an in-stock active
  one is; a cursor from a different source resets.
- `apps/web/src/features/inventory/outbound-transfer-create-page.test.tsx` (new): the
  page asks for `OUTBOUND_PICK` with the selected source, re-asks with the new source
  when it changes, and renders only the options the paged read returns.

Red/green: each new behaviour test is run against the pre-fix production files with the
implementation temporarily reverted; the ones that fail are listed in the handoff.

## Not in this batch

- The catalog page (shows archived definitions with a status column), the dashboard
  count, and the Ctrl+K search corpus stay on the unpaged read — they are not selection
  surfaces.
- `OutboundTransferCreatePageV2` / `MultiSourceItemPicker` pick from
  `useInventoryLocationContentsQuery`, which is already location-scoped; it is a
  different surface and is untouched.

## Risk / decision to surface to the parent

- **Pre-existing mismatch, not fixed here.** `createOutboundTransfer`'s own availability
  check looks up a consumable balance by `inventoryEntryId: item.itemId` (a definition
  id) and lists asset units by location without filtering by definition. That is a
  separate defect in the write path, out of this issue's scope; the picker rule is the
  read. Proposed follow-up: align the outbound write gate with the availability rule
  (or fix its lookups) in its own ticket. Not deferred silently.
