# Design pass — outbound item picker availability (#465)

Design pass over this lane's finished diff (`fix/invoice-create` @ `651df4eb` → working
tree), as required by `docs/engineering-workflow.md` §5 and AGENTS.md. Reviewed through
`domain-modeling`, `codebase-design`, and `improve-codebase-architecture`.

## 1. domain-modeling

- The diff extends the existing vocabulary rather than inventing a parallel one:
  `InventoryItemUsage` (a surface asking for options), `InventoryItemOfferFilter` (the
  rule as data), and `ItemOfferCandidate` (the evidence). The new members are
  `OUTBOUND_PICK`, `InventoryItemOfferSource`, and `inStockAt` / `stockWarehouseIds` /
  `stockProjectIds`. The words are deliberate: **offer** for the read, **stock** for
  physical presence, **source** for the location the item leaves from.
- The rule is stated in exactly one place: `resolveItemOffer`'s `OUTBOUND_PICK` case.
  Both evaluators consume the object it returns; `inventory-item-usage.ts` documents why.
- `CONTEXT.md` in this repo is scoped to diagnostics/telemetry and has no inventory
  vocabulary (same finding as the #463 design pass), so no glossary edit is warranted
  here. The module doc-comment carries the terms.
- **Cross-reference finding (surface, not fix):** `createOutboundTransfer` does not read
  this rule. Its consumable check looks up a balance by `inventoryEntryId: item.itemId`
  (a _definition_ id) and its asset check lists units by location without filtering by
  definition, so the write path and the offer rule disagree about what "in stock" means.
  That is a pre-existing defect in the write path, outside this issue's scope; the diff
  does not make it worse. Follow-up proposed (see §3).

## 2. codebase-design

- The seam is real, not hypothetical: `InventoryItemOfferFilter` is data, with **two**
  evaluators that must agree — the SQL compiler (paged picker) and `matchesItemOfferFilter`
  (write gate + equivalence test). Adding `inStockAt` to both is exactly what the seam is
  for, and the equivalence suite enforces it.
- Deletion test on what the diff added:
  - `outboundPickUsage` — kept. It has a production caller (the page) and mirrors
    `invoiceLineUsage`; deleting it would inline a discriminated-union literal at the
    call site and lose the named constructor.
  - `isInStockAt` — kept. Small, but it names the rule and keeps the JS evaluator one
    boolean expression; inlining it would duplicate the location-type branch inside
    `matchesItemOfferFilter`.
  - `inventoryItemOfferSourceSchema` — kept. The source is a closed union, not a
    nullable pair, matching the schema's XOR destination rule.
  - `stockWarehouseIds` / `stockProjectIds` on `ItemOfferCandidate` — kept. They are the
    JS mirror of the SQL join; without them the JS evaluator cannot honour `inStockAt`.
- **Bug caught in this diff and fixed before review:** `itemUsageKey` returned
  `"STOCK_REFERENCE"` for every non-`INVOICE_LINE` usage. Left as-is, two different
  outbound sources — and the expense selector — would share one cache key/page chain.
  It is now an exhaustive switch over the union with a `never` default.
- **Kept with rationale:** `inStockAt` is optional, so existing usages are unaffected and
  the change is additive. The cost is that a future evaluator could forget the field;
  mitigated by the `never` check at the usage site and the equivalence trap test
  (a definition stocked at another location / nowhere must not be offered).
- The SQL predicate checks both tables (`inventory_consumable_balance`,
  `inventory_asset_unit`) regardless of definition type, mirroring the JS candidate,
  which also does not key availability on type. Keeping the two evaluators structurally
  identical is what makes the equivalence test meaningful.

## 3. improve-codebase-architecture — friction created, deepening opportunities

- **Friction this PR inherits (main finding).** The offer rule now expresses availability,
  but the outbound write gate keeps its own, different stock check (see §1). Two
  statements of one domain rule is the drift the seam exists to remove. Fixing it is a
  behaviour change to a write path with its own bugs and its own tests, so it is **not**
  in this PR's scope. **Proposed follow-up issue:** route `createOutboundTransfer`'s
  availability check through the same rule — which first needs a shared "stock locations
  for a definition" read so the JS candidate can be built without a fourth query shape.
- **Deepening opportunity (recorded, not built).** The availability SQL is written inline
  in `listItemDefinitionsPaged`. The shared read above ("where does definition X hold
  stock?") is the natural deep module once the write gate wants it too; building it now
  for a single caller would be a hypothetical seam.
- **Friction (accepted).** `ItemListEditor` is private to the outbound page and now
  composes `ItemOptionPicker` per row. It stays a presentational adapter; deleting it
  would move that JSX into the page with no other consumer to justify a shared
  abstraction.
- **Opportunity.** The v2 multi-source picker is a second selection surface that reads
  location contents directly. It already has availability semantics and is untouched; if
  the two surfaces are ever unified, this `inStockAt` filter is the interface they would
  meet at.

## Outcome

- Fixed in this PR: the `itemUsageKey` cache-key collision for `OUTBOUND_PICK`.
- Kept with rationale: `outboundPickUsage`, `isInStockAt`, the closed source union, the
  optional `inStockAt` field, the two-table SQL predicate.
- Deferred, with a proposed follow-up (parent decision required): align the outbound
  write gate's availability check with the offer rule.
- Nothing else found.
