# #413 stock charge — code review (Standards + Spec)

- mode: remote
- declared base SHA: `17911dc14211730bec6982707f518b4c84dafa19` (stale local `develop`)
- effective branch point: `cacefb8d6b20473146ae681f02ef4c4c8f8a6337`
- reviewed HEAD: `f69630d22271c407b915a43149cc12fa01123848`
- tier: High-assurance (financial calculation)
- review performed: self-review by the lane (no independent subagent within the
  timebox). Greptile CLI not run by this lane.

## Spec axis

| Acceptance criterion | Where | Verdict |
| --- | --- | --- |
| Contract for the charge + inputs (create with transfer, update/void, list by project and unit) | `packages/contracts/src/inventory.ts`, `inventory-contract.ts` | met |
| Money validity consistent with `paymentAmountSchema` | `nonNegativePaymentAmountSchema` shares `MAX_MONEY_DZD`; only the sign bound differs (zero = free placement) | met |
| Charge table + idempotent DDL + schema-definitions test | `inventory_asset_charge`, `inventory_asset_charge_revision`, DDL + test | met |
| Charge service + repository seam + sqlite and in-memory adapters | `asset-charge.{service,repository,types}.ts`, `adapters/*asset-charge*` | met |
| Writes use the FIFO-lock/transaction pattern; never absorbed by another transaction | sqlite adapter `runSyncTransaction(connectionLock, raw, …)`; rollback test | met |
| Wired into the transfer path in the same transaction; warehouse writes none | `InventoryService.transferAsset`; `inventory-transfer-charge.test.ts` | met |
| Web asks for the amount when the destination is a project (prefill, percentage, warning) | `transfer-item-dialog.tsx` + `transfer-item-dialog.test.tsx` | met |
| Unit detail view shows the charge history | `asset-charge-history.tsx` wired into `inventory-location-contents-section.tsx` | met |
| Per-project total exposed | `inventoryAssetChargesListByProject` → `{ projectId, totalDzd, charges }` | met |
| Tests: defaults, percentage ↔ amount, zero/blank, warehouse, correction history, project total | service + transfer + sqlite adapter + web tests | met |

Spec ambiguities resolved (documented, not silent):

1. **"blank amount allowed"** — the wire contract treats `chargeAmountDzd`
   omitted/null as "resolve the default", and an explicit `0` as a free
   placement. The UI prefills the default and sends an explicit number; clearing
   the field sends `0`. Both meanings of "blank" are therefore defined.
2. **"a correction records from → to"** — there is no expenses module in the
   tree, so the correction follows the existing audit pattern
   (`user_profile_history` / `debt_entry` void metadata): a dedicated
   `inventory_asset_charge_revision` row per change (`previous_amount_dzd` →
   `new_amount_dzd`, reason, actor, timestamp). Voiding records `new = null`.
3. **"editable from the project's expense view"** — the project expense view is
   #414. The API (`inventoryAssetChargesUpdate`/`Void`) and an inline
   correction/void UI on the unit's charge chain ship here; the #414 screen
   consumes the same procedures. Reported to the parent as a boundary decision.

## Standards axis

- Deep module / seam: `AssetChargeRepository` stays a narrow port; sqlite and
  in-memory implementations live in `adapters/`. `AssetChargeService` owns the
  rules; `InventoryService` composes it and keeps the RPC surface on one seam.
- Money rule: one magnitude constant; no second money rule.
- Service-boundary defense-in-depth: `updateCharge`/`voidCharge` re-parse the
  wire contract schema; `createPlacementCharge` parses the amount with the same
  `nonNegativePaymentAmountSchema`.
- Transactions: every charge write routes through `runSyncTransaction` with the
  shared connection lock (issue #322/#348 discipline); the charge joins the
  transfer's open transaction as a SAVEPOINT. Pinned by a rollback test.
- Determinism: chain ordering uses SQLite `rowid` / Map insertion order, not a
  millisecond `createdAt` (three writes in one millisecond otherwise sort
  arbitrarily).
- Output schemas validate, don't transform; `nullableTextSchema`/`min`/`max`
  used as validators.
- Barrel: `inventory-contract` is now re-exported from the package index
  (matches every other `*-contract` module) so `inventoryContract` is reachable.

## Findings

- No blocking findings.
- Minor: `inventoryAssetChargesListByProject` returns only LIVE charges (the
  total must exclude voids); a voided charge is still visible on the unit's
  chain. Accepted for the #414 consumer.
- Minor: `voided_by` is persisted but not exposed on the wire contract (the
  revision's `actorLabel` carries the actor). Accepted.
