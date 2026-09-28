# 413 — Charge a price to a project when a stock unit is moved onto it

mode: remote
ticket: AmaraNecib/tuari_react_hono#413 (stock charge / عتاد مخصّص)
target ref: develop
declared base SHA: 17911dc14211730bec6982707f518b4c84dafa19 (local `develop` ref)
effective branch point: cacefb8d6b20473146ae681f02ef4c4c8f8a6337 (the worktree HEAD
at start; local `develop` was stale — `origin/develop` had advanced to c5334cc,
and the license commits between 17911dc and cacefb8 are pre-existing branch
context, not part of this lane)
review tier: High-assurance (financial calculation: money charged to a project)

## Settled rules (from `.scratch/prototype/NOTES.md` → "Stock charge")

- Moving a unit to a **project** asks for an amount; moving to a **warehouse**
  writes no charge.
- Default amount = the last amount charged for that unit, else `purchasePriceDzd`.
- UI shows the amount as a percentage of the purchase price (negative = cut,
  positive = above) and lets either field drive the other. Above purchase price
  warns, never blocks.
- The charge belongs to that **placement** (the transfer movement). A later move
  starts a new charge; the earlier project keeps its charge.
- A past charge stays editable; a correction records from → to, actor,
  timestamp, optional reason.

## Public surface

### Contracts (`@tuari/contracts`)

- `nonNegativePaymentAmountSchema` (payment.ts) — shares the single money rule
  constant `MAX_MONEY_DZD = Number.MAX_SAFE_INTEGER` with `paymentAmountSchema`;
  only the sign bound differs, because a free placement (0) is legal. This is the
  WRITE gate.
- `storedMoneyDzdSchema` (payment.ts) — `z.number().nonnegative()`, the READ
  shape for a persisted DZD column. Deliberately unbounded by magnitude because
  the DDL only enforces `>= 0` and earlier versions accepted any non-negative
  REAL, so an existing row can sit above `MAX_MONEY_DZD` (#413 round 3).
- `inventoryAssetChargeSchema`, `inventoryAssetChargeRevisionSchema`,
  `inventoryAssetChargeDetailSchema`, `inventoryProjectChargesSchema`,
  `inventoryAssetChargeDefaultSchema`.
- `inventoryAssetTransferInputSchema.chargeAmountDzd` — optional; **omitted /
  null → server resolves the default**, explicit `0` → free placement.
- New procedures (inventory-contract.ts):
  `inventoryAssetChargesListByUnit`, `inventoryAssetChargesListByProject`
  (charges + total), `inventoryAssetChargesUpdate`, `inventoryAssetChargesVoid`,
  `inventoryAssetChargeDefault`.
- `inventoryAssetDetailSchema` gains `charges`, so the unit view renders history.

### Schema

- `inventory_asset_charge` (unit, project, movement reference, amount, status,
  void metadata, actor/timestamps).
- `inventory_asset_charge_revision` (charge, previous → new amount, reason,
  actor, created_at) — the "existing audit pattern" (`user_profile_history`,
  `debt_entry` void metadata) rather than a new invented shape; there is no
  expenses module in the tree yet.
- Drizzle tables in `apps/api/src/schema/inventory.ts`; idempotent DDL +
  indexes in `schema-definitions.ts`; pinned by a schema-definitions test.

### API module

New `AssetChargeService` + `AssetChargeRepository` port with sqlite and
in-memory adapters, kept separate from the large `InventoryRepository` so the
in-memory double stays small. The sqlite adapter uses the **shared
`connectionLock` + `runSyncTransaction`**, so the charge write joins the
transfer's open transaction as a SAVEPOINT (never absorbed by another flow).

`InventoryService.transferAsset(input.assetChargeService?)`:
destination project → create movement, then create the placement charge in the
same `withTransaction`; destination warehouse → movement only.

### Web

- `TransferItemDialog` asks for the amount when the destination is a project:
  prefill from `inventoryAssetChargeDefault`, amount ↔ percentage linkage,
  above-purchase-price warning, free (0) allowed.
- `AssetChargeHistory` renders the unit's charge chain, wired into the location
  contents asset rows (the unit's detail view).

## Tests

- default: first placement → purchase price; second → previous amount.
- percentage ↔ amount linkage (unit test of the derived helper).
- zero/blank → free placement, allowed.
- warehouse destination writes no charge.
- correction keeps from → to + reason; void hides from the total.
- per-project total sums only LIVE charges.
- schema-definitions table shape + contract exports.

## Risks / migration

- Additive tables only (`CREATE TABLE IF NOT EXISTS`), no column migration.
- Older UI/transfers that omit `chargeAmountDzd` resolve the default server-side,
  so no behavior regression for callers that never knew about charges.
- Money is REAL like every other DZD column; the schema bound mirrors the
  existing payment rule.

## Review round — PR #422 (10 findings)

Reviewed HEAD was `e74c377`; the fixes below were applied on top of it. Decisions
that a later reader would otherwise have to reverse-engineer:

1. **A unit created directly on a project is charged.** `createInvoiceGroup`
   now books the placement charge for an ASSET entry with a project destination
   in the same transaction as the purchase movement (default = purchase price,
   because a fresh unit has no prior charge). Warehouse purchases still write
   none. Pinned by `inventory-transfer-charge.test.ts`.
2. **One transfer entry point for assets.** The invoice-details screen no longer
   posts `inventoryAssetsTransfer` directly; it opens `TransferItemDialog`, so
   the operator can state the charge from every path. (The inline warehouse/
   project selects on that screen were also permanently disabled by a
   setter-less `transferSectionExpanded` flag; the shared dialog removes them.)
3. **Amount entry is three-valued.** `parseChargeAmountInput` distinguishes
   blank (`default`), a valid amount (`amount`, explicit `0` = free) and a
   non-blank invalid value (`invalid`). Invalid input is rejected with an
   inline error and blocks submit; it is never coerced to a free placement.
   `chargeAmountFromPercent` clamps at 0 so a >100% cut cannot synthesise a
   negative amount.
4. **The resolved default is validated.** `resolveDefault` parses its result
   with `inventoryAssetChargeDefaultSchema`, so a purchase price (or stored
   amount) above `MAX_MONEY_DZD` fails with a clear error instead of emitting a
   payload the wire contract rejects.
5. **A live default refetch never overwrites an edit.** The prefill effect only
   applies while the amount field is untouched (`amountTouched`); a correction
   landing in another tab updates only an untouched field.
6. **Project totals are rounded at the boundary** with the shared
   `roundMoney` helper (`../company/report.helpers`), the same one the report
   aggregators use, so `0.1 + 0.2` cannot drift.
7. **Revisions are inspectable.** `AssetChargeHistory` renders each revision's
   from → to amount, actor, timestamp and reason, instead of collapsing the
   whole chain to a "corrected" badge.
8. **Loading, error and empty are distinct.** The history shows a loading line,
   an error surface, or the genuine empty state — never an empty list standing
   in for a pending/failed query.
9. **The rollback test exercises rollback.** The in-memory transaction double
   snapshots the charge/revision/movement/location state and restores it on
   throw; a `failAfterCharge` hook inserts the charge and then fails. The test
   asserts the charge, revision, movement and location change are all gone. The
   invalid-amount case is kept as its own (pre-insert) test.
10. **Money records outlive a project delete.** `inventory_asset_charge.project_id`
    is `ON DELETE RESTRICT` (was CASCADE). Chosen over `SET NULL` because the
    column is NOT NULL and the project reference is part of the charge's
    identity, and over keeping a nulled row because a charge without a project
    is not a project charge. No project-delete path exists in the app today, so
    there is no behavior regression; a delete now fails loudly instead of
    destroying the record. Pinned by a schema-definitions test and a real
    sqlite FK test.

### Trade-offs / accepted

- `inventory_asset_charge.asset_unit_id` remains `ON DELETE CASCADE`: the chain
  belongs to the unit, and a charge for a deleted unit has no subject. Only the
  project FK (the finding) was changed.
- `purchasePriceDzd` in the default response shares the same contract bound and
  is validated by the same `inventoryAssetChargeDefaultSchema` parse. (Corrected
  by round 3: the echoed price uses the permissive stored shape; the resolved
  `amountDzd` keeps the bound.)

## Review round 2 — PR #422 (money-bound findings)

Round 1 (finding 4) validated the *resolved charge default* against
`MAX_MONEY_DZD` but left the invoice asset input and the asset entity schema on
an unbounded `z.number().nonnegative()`. That introduced TWO ceilings for the
same money field: a purchase price the invoice path accepted could make the
charge default (and therefore a direct-to-project purchase) fail, while the
same purchase into a warehouse succeeded. Greptile flagged this as "valid
purchase prices now fail" (P2), plus the symmetric aggregate leak "project
totals exceed contract bound" (P2).

One bound wins, and it is the contract's `MAX_MONEY_DZD`:

1. **The invoice asset price is bounded at the same ceiling.**
   `inventoryAssetUnitCreateInputSchema.purchasePriceDzd` and the entity/"storage"
   shape `inventoryAssetUnitSchema.purchasePriceDzd` both use
   `nonNegativePaymentAmountSchema` (the same `MAX_MONEY_DZD` rule as the charge
   contract). `InventoryService.createInvoiceGroup` also parses the price with
   that schema at the module seam, so the wire gate and the service cannot
   drift (the #289 defense-in-depth pattern) and a direct service call cannot
   store above-bound money. There is no evidence the invoice path needs a
   higher ceiling: `MAX_MONEY_DZD` is a *precision* bound
   (`Number.MAX_SAFE_INTEGER`), not a business limit, so the only values it
   rejects are ones whose arithmetic is already undefined.
2. **The project total has its own aggregate bound.** Individual charges are
   each allowed to reach `MAX_MONEY_DZD`, so their sum can exceed it and the
   `inventoryProjectChargesSchema.totalDzd` contract cannot represent it.
   `listByProject` now sums with an incremental guard and throws a typed
   `InventoryError("BUSINESS_RULE", …)` before rounding, instead of emitting a
   number outside the declared shape. A total that lands *exactly* on the bound
   is still representable and still returned.

Trade-off: bounding `inventoryAssetUnitSchema` means a legacy row whose price
already exceeds `MAX_SAFE_INTEGER` would no longer serialize. Accepted because
(a) the invoice input has always fed this path and the new gate stops any new
above-bound row, (b) `MAX_SAFE_INTEGER` is the point past which the stored
`number` is no longer an exact integer, and (c) the alternative (an unbounded
read schema next to a bounded write schema) is exactly the two-ceiling bug
being fixed.

## Review round 3 — PR #422 (read schema was over-tightened)

Round 2 closed the two-ceiling gap, but it bounded `inventoryAssetUnitSchema`
itself — a schema that is not only an input. Asset-detail, invoice-detail and
location-contents RESPONSES all embed it, and the database already holds asset
rows the old (unbounded) input accepted. Any such row would now fail output
validation and break the screen that merely displays it. The round-2 trade-off
above was wrong: a read path must never be the thing that fails on data the
system itself stored.

The fix separates the two concerns instead of picking one ceiling:

- **Write gates keep the bound.** `inventoryAssetUnitCreateInputSchema`,
  `inventoryAssetTransferInputSchema.chargeAmountDzd`,
  `inventoryAssetChargeUpdateInputSchema` and the
  `InventoryService.createInvoiceGroup` module seam all use
  `nonNegativePaymentAmountSchema`, so no new above-bound value can enter.
- **Read shapes are permissive.** Every persisted money column is read with
  `storedMoneyDzdSchema`: `inventoryAssetUnitSchema.purchasePriceDzd`,
  `inventoryAssetChargeSchema.amountDzd`,
  `inventoryAssetChargeRevisionSchema.previousAmountDzd`/`newAmountDzd`, and the
  echoed `inventoryAssetChargeDefaultSchema.purchasePriceDzd`. A legacy row
  always reads back.
- **Values the app USES keep the bound.** The resolved
  `inventoryAssetChargeDefaultSchema.amountDzd` and the computed
  `inventoryProjectChargesSchema.totalDzd` stay bounded, and the service refuses
  (`VALIDATION` / `BUSINESS_RULE`) rather than emitting an unrepresentable
  number. So a legacy above-bound price still reads back, but it can never be
  booked as a charge or summed into a total.

Tests: `index.test.ts` parses an above-bound stored asset through
`inventoryAssetUnitSchema`, `inventoryAssetDetailSchema`,
`inventoryInvoiceGroupDetailSchema` and `inventoryLocationContentsSchema`, keeps
the write gate refusal, and pins the default's readback-vs-use split;
`asset-charge.service.test.ts` resolves a default for a legacy above-bound price
when a valid last charge exists; `inventory-transfer-charge.test.ts` reads an
above-bound row back through `getLocationContents`.

## Debate round (high-assurance requirement)

The tier requires a debate and the PR had none. Two fresh-context reviewers (a
critic hunting wrong or unrepresentable numbers, a defender arguing the design)
read the branch diff. Synthesis and decisions:

- **Fixed: `roundMoney` corrupted totals above ~9.007e13.** `value * 100`
  overflows IEEE-754 integer precision, so the helper returned
  `MAX_SAFE_INTEGER - 2` for an input of `MAX_SAFE_INTEGER - 1`. The shared
  helper now returns large magnitudes unchanged, because at that magnitude the
  value has no representable cents. Pinned by `report.helpers.test.ts` and a
  near-bound project-total test. The same guard was added to the web copy used
  by the percentage linkage.
- **Fixed: a blank correction amount silently recorded a revision to 0.** The
  history editor used `Number(draftAmount)` and `Number("")` is 0. It now routes
  through the transfer dialog's three-valued `parseChargeAmountInput`, accepts
  only an explicit amount (0 is a free placement), and shows an inline error.
  Pinned by `asset-charge-history.test.tsx`.
- **Fixed: the client amount parser accepted over-bound values.** An amount
  above `MAX_MONEY_DZD`, including one derived from a huge percentage, now
  parses as invalid and blocks submit instead of failing at the wire. Pinned by
  `transfer-item-dialog.test.tsx`.
- **Dismissed: duplicate charge on a same-project re-placement.** `transferAsset`
  already refuses a transfer to the unit's current location with
  `BUSINESS_RULE` ("الأصل موجود بالفعل في هذا الموقع."). The critic missed the
  guard.
- **Reported to the parent, not fixed here: the invoice path still leaves
  consumable `unitPriceDzd`, `grossTotalDzd` and `paidAmountDzd` unbounded.**
  Those fields predate #413, do not feed a charge, and their output contract is
  deliberately unbounded, so this is a pre-existing money-rule gap rather than
  the two-ceiling bug. Proposed as a follow-up.
- **Accepted minors:** `ON DELETE RESTRICT` also blocks deleting a project whose
  only charges are VOIDED, but no project-delete path exists today; the void UI
  collects no reason unless the row was first opened for edit; `getLastChargeAmount`
  orders by insertion (rowid), not the movement's `occurredAt`; the in-memory
  adapter does not persist `voidedBy`; the correction/void pre-read sits outside
  the write transaction, which is unreachable with synchronous better-sqlite3.
