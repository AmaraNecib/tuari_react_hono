# Design pass — outbound item picker availability (#465)

Design pass over this lane's finished diff (`origin/develop` @ `551948e4` → `dfdaad48`;
originally reviewed against the pre-rebase `fix/invoice-create` base), as required by
`docs/engineering-workflow.md` §5 and AGENTS.md. Reviewed through `domain-modeling`,
`codebase-design`, and `improve-codebase-architecture`.

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
- **Cross-reference finding (surfaced, deferred to #450).** `createOutboundTransfer` does
  not read this rule. Its consumable check passes an item definition id where an
  `inventoryEntryId` is expected, and its asset check lists units by location without
  filtering by definition, so the write path and the offer rule disagree about what "in
  stock" means. Parent decision: defer to **#450**, which fixes both halves with one
  shared read. Not fixed here, and the diff does not make it worse.

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
  statements of one domain rule is the drift the seam exists to remove. Parent decision:
  **deferred to #450** — one shared "where does definition X hold stock?" read, routed
  through by the picker and the write gate, with a test proving the two agree. Explicitly
  out of this PR's scope.
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
- Deferred to **#450** (parent decision): align the outbound write gate's availability
  check with the offer rule.
- Nothing else found.

## Addendum — aggressive local review of the finished diff (`918290aa`)

Re-ran the pass over the review fixes. Design outcomes:

- **The seam is now genuinely two-sided in tests.** `candidateOf` projects the
  JS candidate from the seeded `inventory_consumable_balance` /
  `inventory_asset_unit` rows instead of the fixture literal, so the equivalence
  suite compares the SQL predicate against a read of the same evidence rather
  than against a written expectation. Still no production builder — that is
  #450's shared read, and building it here for a test-only caller would be a
  hypothetical seam.
- **The page's source-change rule moved into the domain.** A pick is evidence
  about one source; the page now clears picks when the source changes, so the
  UI cannot present an out-of-stock item as chosen. This is the same invariant
  the offer rule states, applied to the selection the UI holds.
- **The write-gate claim was corrected, not remade.** `inventory-item-usage.ts`
  now says `OUTBOUND_PICK` availability is read-side only until #450 lands. The
  design doc says the same.
- **Kept after the schema check:** the one-column `EXISTS` and the `quantity > 0`
  clause. A zero/negative balance and a both-set location are both blocked by
  CHECK constraints, so the extra guards are defence-in-depth, not a parallel
  rule.
- **Accepted friction:** the `${locationType}:${id}` scope/key formatting is
  duplicated in the web hook and the repository; they serve different layers
  (React Query key vs server cursor scope) and cannot share a module cleanly.

## Addendum — Greptile stale-stock finding (`ad0ad988`)

The finding was a missing half of the read's contract: the `OUTBOUND_PICK`
filter made the options read a function of stock, but nothing told the read when
stock changed. Design outcomes:

- **The rule is stated once.** `invalidateStockDependentItemReads` names the
  invariant ("a stock change refreshes every item read whose answer depends on
  stock") and the four stock-changing mutations call it. Without it the same
  call plus comment would be copied four times, and one copy would eventually
  be dropped — which is exactly how the finding arose.
- **The seam is the existing prefix, not a new one.** The options read was
  already keyed under `inventoryItems` for this purpose (the comment on
  `useItemDefinitionOptionsQuery` predates the fix), so the invalidation is a
  prefix match with no new key or exported API.
- **Coarse by choice.** The invalidation refreshes every source and the catalog
  read, not only the two sources the mutation moved. A source-surgical
  invalidation would need a predicate over the encoded `itemUsageKey` and would
  couple each mutation to the key's internal shape; the over-fetch is
  operator-paced and accepted.
- **No hypothetical abstraction.** `invalidateStockDependentItemReads` is a
  wrapper, not a new module; the deletion test keeps it (four call sites depend
  on it), but it does not pretend to be more than a named rule.
