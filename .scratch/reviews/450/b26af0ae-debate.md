# #450 — debate (adversarial review)

- **Reviewed code HEAD**: `b26af0ae` (supersedes the `e37e2561` review round)
- **Base**: `origin/develop` @ `073af118`
- **Method**: fresh-context critic + defender sub-agents over `git diff 073af118...b26af0ae`,
  run against `e37e2561` and re-dispositioned here. Raw transcripts:
  `.scratch/sessions/450-review/{debate-critic,debate-defender}.md` (gitignored).

The critic found **no 8–10 blocker**. The defender confirmed both halves of #450 are
fixed. Findings and dispositions:

| # | Critic finding (severity) | Disposition | Evidence |
|---|---|---|---|
| F1 | The JS rule check is tautological on the source axis: the read is already source-scoped, so `isInStockAt` cannot fail for a row it returned (6). | **Dismissed** (false alarm per defender). | The parity test rejects `c-elsewhere` (stock only at `prj-1`) and `c-empty`; it fails pre-fix. Emptiness is the discriminator; the source filter is shared with the picker via `stockAtSourceWhere`. |
| F2 | Gate can accept then throw for a type-mismatched row (CONSUMABLE definition with only asset units) (5). | **Dismissed** (unreachable via the service). | `createInvoiceGroup` enforces `matchesItemOfferFilter(resolveItemOffer(invoiceLineUsage(kind)), definition)` before any entry row exists (`inventory.service.ts:429,453`), so kind-mismatched entries/balances cannot be created through the service. The #465 both-tables rule is deliberate; mis-typed rows exist only in the raw-SQL equivalence fixtures. |
| F3 | Fractional `quantity` (contract has no `.int()`) now reaches the balance path (5). | **Dismissed**. | A consumable's unit is arbitrary (kg), so fractional consumption is valid. For assets the misleading "unavailable" message on `1.5` is unchanged from `073af118`: the old branch was `listAssetUnitsByLocation(...).slice(0, item.quantity)` + `assets.length < item.quantity`, identical truncation. Pre-existing contract-wide question, not introduced here. |
| F4 | Consumption/movement policy is scope creep: consumables newest-… assets newest-touched first, N movements, changed report valuation (5). | **Partially fixed, rest dismissed**. | Asset ordering (`updatedAt DESC`) is inherited from the pre-fix `listAssetUnitsByLocation`, so it is not a new policy. The per-unit movement shape is now pinned by a test (one movement per unit, `assetUnitId`, other definitions untouched). Documented in `450-design.md`. |
| F5 | Stale JSDoc in `inventory-item-usage.ts` claims the write path does not consult the rule yet (3). | **Fixed**. | Doc updated in `b26af0ae`. |
| F6 | Design doc's "inbound is correct" claim has no evidence (3). | **Fixed**. | Design doc now names `transferConsumable`/`transferAsset` and states they resolve entry/asset ids and never a definition. |
| F7 | Rollback of a partially-mutated multi-item transfer untested (3). | **Fixed**. | New test: item 1 valid + item 2 unavailable → throws, item 1 balance unchanged, no movements, no transfer row. |
| F8 | Archived definitions are now hard-rejected on the write path (3). | **Dismissed** (specified). | The picker's `OUTBOUND_PICK` rule is `activeOnly` (#465, `465-design.md` §Semantics); the gate must match it. Pinned by the parity test (`c-archived` rejected). |
| F9 | Dead null-guards in the candidate flatMaps (2). | **Dismissed**. | The balance/asset location columns are typed nullable, so the guards keep the projection type-safe; the keys are named in `listItemStockAtSource`'s WHERE. |
| F10 | Duplicated note literal \(+\) re-derived `from*` location; the candidate builds rows inline (2). | **Fixed**. | `outboundFromLocation(source)` + one `note` derived once; the projection is the named `itemOfferCandidate` helper. |

## Defender highlights (confidence)

- One source predicate, two callers — `stockAtSourceWhere` feeds the picker's EXISTS and
  `listItemStockAtSource` (9/10).
- The gate runs the rule as data, not a copy (9/10).
- The two id spaces are un-confusable: movements carry `balance.inventoryEntryId`, assets
  carry `asset.inventoryEntryId` + `assetUnitId`; the collision test seeds `def-a` == entry
  `def-a` (10/10).
- Asset narrowing is real: the join filters `inventory_entry.item_definition_id` (9/10).
- Multi-balance consumption is earned by the domain (one definition, many purchase entries) (8/10).
- Failure modes are safe: availability rejects before mutation; shortfall throws before
  mutation; rollback now pinned (8/10).

## Outcome

Two real code/test gaps fixed (F7, plus the non-positive-quantity gap that the test-audit
raised), six documentation/structure cleanups fixed, four critic findings dismissed with
the evidence above. No blocker.
