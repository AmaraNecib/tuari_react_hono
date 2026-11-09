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

**UI scope**: V2 sends definition IDs and a separate concrete balance/unit
`optionId` to the write gate. The picker uses the shared offer rule, hides
archived definitions, and distinguishes loading/error states from empty stock.
Render tests cover picker callbacks and the V2 submission mapping. Browser,
full-suite and build validation require parent scheduling under the CPU policy.

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

For legacy balances with more than six decimals, normalize each row. Do not sum
those rounded values into one IEEE-754 total. A large balance can erase small
positive rows even when guarded sequential deductions can represent them. Skip
normalized empty rows. Let the final normalized request remainder inside the
transaction decide whether allocation fulfilled the request. Test exact
fulfillment, shortage, and rollback of earlier items when a later allocation
fails.

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

## Accepted audit remediation

This local-only HIGH-ASSURANCE follow-up starts at
`73bfeb9a36fc4538207ad0c2a1ac56bdad6bad34`, preserving the first quantity fix.
The parent supplied the three original test-audit outputs for PR #477 and
approved the existing SQLite service and rendered picker seams. No public
contract, schema, dependency or global precision-helper change is needed.

The new production rule is local to outbound allocation. Before writing each
movement, calculate the normalized stock remainder and request remainder.
Both must be finite, nonnegative and strictly smaller than their previous
values. The normalized reverse difference of each must equal the consumed
quantity. Otherwise throw `BUSINESS_RULE` inside the existing transaction.
This checks the actual operation, not a public magnitude bound. For example,
`1e12 - 0.000001` cannot fund a movement; a representable deduction of `2` from
`1e12` remains supported. Existing six-decimal normalization still defines
legacy stock and normal fractional arithmetic.

Tests cover half-quantum/upward requests, invalid second-item prevalidation,
upward-rounded legacy rows, repeated fractional lines, and magnitude boundaries.
Real `CompanyService` and inventory repositories share one SQLite connection.
TEMP triggers observe the real OPENING/PAYMENT and earlier stock writes before
shortage, or force a failure immediately before transfer-item persistence after
the header exists. Raw before/after snapshots prove rollback. These additions
close proof gaps, not newly discovered debt transaction defects.

Picker tests record source-query arguments without losing concrete-row identity
and deduplication assertions. Exact fulfillment queries raw balances to establish
that consumed rows are deleted while upstream-excluded dust remains unchanged.
It does not claim that dust exercises the allocator's zero-row skip.

The implementation lane cannot spawn reviewers or use paid reviews. Parent-owned
fresh HIGH-ASSURANCE review and broader checks remain gates, not completed work.
Evidence for this follow-up lives in `.scratch/reviews/450/audit-remediation/`.

### Availability precision follow-up

This child starts from local remediation HEAD
`546be3e5a98627984218bf8474895036219835a7`, whose ancestry includes original PR
head `338cbde3c9b3a5645c98e86f9bdd70a15a41d6b6`.

The aggregate precheck rounds one `Number` sum of rounded rows. For
`[4294967296, ...Array(12).fill(0.000001)]`, it loses one micro and rejects
request `4294967296.000012`. Remove this lossy precheck. Guarded sequential
allocation checks each deduction. The final normalized request remainder throws
the existing insufficient-stock `BUSINESS_RULE` inside the transaction when
rows cannot fulfill the request.

Add two real-SQLite regressions. Successful fulfillment asserts that raw balance
rows are gone, the persisted transfer item is `4294967296.000012`, and all 13
movements have the expected entry IDs and quantities. The repository orders these
balances by `createdAt, id`. The shortage case uses `[8589934592, 0.000001]` for
request `8589934592.000002`. Both per-row guards pass, so the final remainder
guard must reject and roll back stock, movements, debt records, transfer headers,
and transfer items. This test covers existing protection, not another production
bug.

No global rounding helper, public magnitude bound, schema, or contract change.

## Current remediation decisions

This remote follow-up is based on local HEAD
`45a9138e201bc58e5598cb858f93d0782c7202b9`. Earlier sections record the scope
of prior implementation rounds; this section supersedes their statements that
no contract or shared quantity-helper change is needed.

### Picker identity and source states

`itemId` is the definition ID persisted on the outbound transfer item.
`optionId` identifies the selected concrete consumable balance or asset unit.
The contract keeps it optional for definition-level callers. When supplied,
the write gate restricts allocation to that row after rereading stock at the
source. Otherwise deterministic definition-level allocation remains available.
Concrete IDs are request selectors, not new persisted transfer-item fields.

V2 applies the shared outbound offer rule to active definitions. Definitions
and source-content requests must finish before the UI reports empty stock.
Either query failure shows an error; pending queries show a loading state.
Regression tests use the real Arabic resource and cover both states.

### Decimal balance changes

Preserve stored values already on the six-decimal grid. Decimal addition and
subtraction avoid scaled-float corruption of large balances. Before writing,
check finite results and both the decimal difference and actual Number delta
at storage precision. Reject unrepresentable changes inside the transaction.
This adds no public magnitude ceiling. Legacy sub-quantum normalization remains
part of outbound allocation.

Inbound consumable transfers also use decimal addition/subtraction and guarded
deltas. Tests cover exact large-balance movement and rollback when a destination
cannot represent an addition. Asset transfer identity semantics are unchanged.

A Luna design review of this dirty tree found no actionable design defect.
It is a design lens only, not independent debate, test-audit, code-review, or
full guard evidence. The architecture-improvement skill was unavailable.
Current-SHA evidence and remaining validation are required before publication.

## Final audit coverage corrections

The final audit found two missing regression scenarios, not a production defect.
The picker now tests pending and failed source-content requests as well as the
definition query, with status/alert assertions and no empty-stock message. The
SQLite write-gate tests reject missing, foreign-source and wrong-kind concrete
selectors for consumables and assets; exact before/after snapshots cover stock,
assets, debt rows, movements and transfer rows. No production code changed.

Fresh verification passed 68 focused API tests, 7 focused web tests, the full
API suite (1,756 passed, 3 skipped) and full web suite (970 passed). Typecheck
passed all four tasks; full lint reported 1,702 warnings and zero errors. Logs
and commands are in .scratch/reviews/450/audit-fixes-20261102/. Fixed-head
independent review and hosted gates still follow this test-only commit.

The next edge review requested one additional case: the selected consumable
balance holds 7, a sibling holds 4, and the request is 8. The concrete selector
must not fall back to sibling stock. That test now expects BUSINESS_RULE and
compares the full write snapshot, including the selected row's partial-write
rollback. This is a coverage addition; existing production already rejects it.
The focused file passes 69 tests. Fresh contracts build, typecheck, lint, full
API with 1,757 passed and 3 skipped, and full web with 970 passed all pass.
Logs are in .scratch/reviews/450/selected-shortage-20261102/.

## Hosted precision corrections after integration

The current hosted review exposed two reachable arithmetic defects on legacy and
large stock values. Inbound transfers now compare the raw source quantity for
shortage first, then normalize old sub-quantum floating noise before validating
six-decimal source and destination changes. This keeps a true `0.4999996` source
short of a `0.5` request while allowing a legacy `0.49999999999999994` balance
to move `0.2` without rejecting a representable result. Outbound allocation
uses `subtractQuantity` for both the stock remainder and request remainder;
binary subtraction at `4294967296.1 - 1` can select the wrong representable
Number and trip the existing guard.

The red-first regressions use the real SQLite inventory service. They cover
noisy legacy rows at both ends of an inbound transfer and a large outbound
balance, with movement quantities checked against stored balances. Existing
shortage rollback, conservation, unrepresentable-deduction and selected-source
no-sibling tests remain unchanged. No tolerance was widened, and no global
rounding extraction or public magnitude bound was added.

## Not in this change

- Inbound transfers do not acquire definition-based selection. Consumables still
  take an `inventoryEntryId`; assets still take an `assetUnitId`. The inbound
  arithmetic changes above do not change either public identity contract.
- Asset-unit identity in `OUTBOUND_SALE` movements for *reports* is unchanged in
  shape (still `OUTBOUND_SALE` from the source, no destination).

## Integration with current develop

This integration starts from preserved commit
`587c6e872292288057572e232636c7d8ee7f7327`. The preserved commit's parent is
`19284f46a78c8ab47a5cb803d2a3c135420c8e6b`; the published PR #477 head
`aab149fde4ace78767befccd927bddea8425e330` is its ancestor. The branch also
merges fetched `origin/develop` at
`4917fd2cc733be63e21cf3e61d57a9ed7627b7e9`.

The selected `optionId` remains authoritative. If that concrete balance cannot
fulfill the requested quantity, the service throws `BUSINESS_RULE` and the
transaction rolls back. It does not consume a sibling balance. The regression
asserts the selected-shortage failure and a full before/after write snapshot.
Existing precision, selected-entry identity, shared picker/write availability,
web selection and create-envelope behavior remain in scope. No #478 money bound
was added.

The merges retained develop's auth, driver, dependency and CI updates. Routine
conflicts were resolved by keeping its runtime-staging implementation and tests,
adding the encrypted snapshot byte-preservation assertion, and combining the
E2E selector with the fork-PR guard. The obsolete architecture wisdom file was
kept deleted to match develop's migrated wisdom layout. Historical 450 design
and ignored reports were read where present; their prior full API/web totals are
not current proof.

Current focused proof is recorded in
`.scratch/reviews/450/integration-2852279a/`. Contracts build and the focused
contracts, API, web, typecheck and package-lint checks passed after the frozen
integration source was committed. The branch has not received independent
reviews; the parent owns the three HIGH-ASSURANCE lenses.
