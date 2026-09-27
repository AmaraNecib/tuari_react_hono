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
  only the sign bound differs, because a free placement (0) is legal.
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
