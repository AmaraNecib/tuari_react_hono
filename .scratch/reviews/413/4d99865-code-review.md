# #413 stock charge — PR #422 review-round code review

- mode: remote
- base ref: `develop` (fetched; `origin/develop` = `183d2226ec50dab56a45d25fde6f72f319d5a267`)
- reviewed code HEAD: `4d998654d9a77c2a06d078ce18f196c3006b91e2`
- previous reviewed HEAD: `e74c377` (my prior code head `f69630d` plus two docs commits)
- tier: High-assurance (financial calculation)
- review performed: lane self-review against the 10 findings from the PR #422
  review. Hosted Greptile re-review is requested by the parent on the pushed
  head; no CLI Greptile run in this lane.

## Findings → fixes

| # | Finding | Fix | Pinning test |
| --- | --- | --- | --- |
| 1 | A unit created directly on a project via the invoice path was never charged | `InventoryService.createInvoiceGroup` books `createPlacementCharge` for an ASSET entry with a project destination, same transaction as the purchase movement; warehouse writes none | `inventory-transfer-charge.test.ts` "charges the purchase price for an asset created directly on a project" + "writes no charge for an asset created on a warehouse" |
| 2 | The invoice-screen transfer never asked for/sent `chargeAmountDzd` | the invoice details page now opens `TransferItemDialog` for asset transfers (the dialog owns the charge fields); the permanently-disabled inline selects are gone | `inventory-invoice-details-page.test.tsx` "routes an asset transfer through the charge-aware dialog (#413)" |
| 3 | `-5` coerced to `0` (a free placement) | `parseChargeAmountInput` is three-valued (`default` / `amount` / `invalid`); invalid blocks submit and renders an error; blank = server default, explicit `0` = free; `chargeAmountFromPercent` clamps at 0 | `transfer-item-dialog.test.tsx` pure-helper + "rejects an invalid amount instead of booking a free placement" + explicit-zero/cleared-field tests |
| 4 | A purchase price above `MAX_MONEY_DZD` used as the default was not validated | `resolveDefault` parses its result with `inventoryAssetChargeDefaultSchema` (the exact contract bound) and throws a clear validation error | `asset-charge.service.test.ts` "fails clearly when the resolved default is above the shared money bound" |
| 5 | A default refetch overwrote the operator's edit | the prefill effect is gated on `amountTouched` | covered by the dialog component tests (touched field is not clobbered; prefill still applies on open) |
| 6 | Project totals added fractional amounts without normalization | `listByProject` rounds with the shared `roundMoney` from `../company/report.helpers` | `asset-charge.service.test.ts` "rounds the project total at the money boundary (0.1 + 0.2 = 0.3)" |
| 7 | Every revision collapsed to a "corrected" badge | the history renders each revision's from → to amount, actor, timestamp and reason | `asset-charge-history.test.tsx` "shows each correction's from → to amount, actor, time and reason" |
| 8 | Loading/failed history rendered as an empty list | distinct loading / error / genuinely-empty states | `asset-charge-history.test.tsx` loading + load-error tests |
| 9 | The rollback test could not exercise rollback | the in-memory transaction double snapshots charge/revision/movement/location and restores on throw; a `failAfterCharge` hook inserts then fails | `inventory-transfer-charge.test.ts` "rolls the charge back with the transfer when a later step fails" (asserts charge, revision, movement and location all gone) |
| 10 | Deleting a project cascaded into deleting its charges and revisions | `inventory_asset_charge.project_id` is `ON DELETE RESTRICT`; a project delete now fails instead of destroying money records. Chosen over `SET NULL` (the column is NOT NULL and the reference is part of the charge identity) and over keeping a nulled row (a charge without a project is not a project charge). No project-delete path exists today, so no behavior regression | `schema-definitions.test.ts` "refuses to delete a project that still has charges" + `sqlite-asset-charge.repository.test.ts` "refuses to delete a project that still has a charge, keeping the record" |

## Standards axis

- The charge rule stays in `AssetChargeService`; `InventoryService` only
  composes it, now from both placement entry points (transfer and invoice).
- Money boundaries reuse the single shared `roundMoney`; the resolved default is
  validated with the same contract schema the wire uses (no second money rule).
- The charge write stays inside the caller's transaction (transfer and invoice
  both call it inside `withTransaction`), so a later failure rolls it back.
- The asset-unit FK keeps `ON DELETE CASCADE` (the chain belongs to the unit);
  only the project FK was changed per the finding.
- Web: one amount parser with explicit three-valued semantics; the dialog owns
  charge entry for every asset transfer path.

## Residual / accepted

- `voided_by` is still persisted but not exposed on the wire (carried by the
  revision's `actorLabel`), unchanged from the prior round.
- `inventoryAssetChargesListByProject` still returns only LIVE charges in the
  list body (the unit chain shows voids); unchanged.
- No new Playwright E2E in this round; the dialog/page/history paths are covered
  by jsdom component tests that exercise the real components.
