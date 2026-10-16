# #429 — invoice money fields: MAX_MONEY_DZD bound + grossTotal aggregate guard

- **Issue**: [#429](https://github.com/AmaraNecib/tuari_react_hono/issues/429) — "Invoice money fields have no `MAX_MONEY_DZD` bound (unitPrice, grossTotal, paidAmount) and grossTotal has no aggregate guard"
- **Branch**: `fix/429-invoice-money-bounds`
- **Worktree**: `D:/projects/tuari_react_hono/worktrees/fix-invoice-money-bounds`
- **Base**: `origin/develop` @ `073af118d4f10dd1e7c4099a36a228b2035b00bb`
  (the local `develop` ref is stale at `fdb5dda`; the branch was cut from
  `origin/develop`, so HEAD == base and the diff is only this change)
- **Mode**: remote (parent owns push/PR — lane does not push or merge)
- **Review tier**: High-assurance (financial calculation)

## Problem

The charge/payment paths enforce one money rule, `MAX_MONEY_DZD`
(`Number.MAX_SAFE_INTEGER`). The invoice path does not:

- `inventoryConsumableEntryCreateInputSchema.unitPriceDzd` — `z.number().nonnegative()`
- `inventoryInvoiceGroupCreateInputSchema.paidAmountDzd` — `z.number().nonnegative()`
- `inventoryInvoiceGroupSchema.grossTotalDzd | paidAmountDzd | remainingDebtDzd` — outputs, unbounded
- `InventoryService.normalizeMoney` — finite + `>= 0` only

`unitPriceDzd = 9e15` × quantity `10` yields a `grossTotalDzd` above
`Number.MAX_SAFE_INTEGER`; it is stored and re-emitted as a silently wrong
financial number.

## Design

### 1. Inputs — reuse the shared money schema

`nonNegativePaymentAmountSchema` (`z.number().nonnegative().max(MAX_MONEY_DZD)`,
`packages/contracts/src/payment.ts`) is the repo's one money rule. Reuse it, do
not introduce a new constant.

- `inventoryConsumableEntryCreateInputSchema.unitPriceDzd` → `nonNegativePaymentAmountSchema`
- `inventoryConsumableEntryCreateInputSchema.totalPriceDzd` → `nonNegativePaymentAmountSchema`
  (a money input on the same entry; the server derives the stored total, but a
  wire input still obeys the one money rule)
- `inventoryInvoiceGroupCreateInputSchema.paidAmountDzd` →
  `nonNegativePaymentAmountSchema.nullable().optional()`

### 2. Outputs — bound the invoice group, keep the entry a stored read shape

- `inventoryInvoiceGroupSchema.grossTotalDzd | paidAmountDzd | remainingDebtDzd`
  → `nonNegativePaymentAmountSchema` (validator only, `.max` — no transform;
  output schemas validate, they do not transform).
- `inventoryEntrySchema.unitPriceDzd | totalPriceDzd` → `storedMoneyDzdSchema`
  (permissive read shape). The #413 round 3 rule stands for an individually
  stored line: a legacy row must read back. The group total is the aggregate the
  issue singles out and the service now refuses to emit one above the bound, so
  refusing beats emitting an unrepresentable financial number — the same choice
  `inventoryProjectChargesSchema.totalDzd` (#422) already makes.

`InventoryInvoiceGroupRecord = InventoryInvoiceGroup` (the output schema), so
the bound flows into the repository type with no extra work.

### 3. Service seam + aggregate guard (`InventoryService`)

- Generalize `normalizeMoneyWithinBound(value, field, message)` so the
  purchase-price message is preserved and the new fields get an honest message.
- Consumable `unitPriceDzd` → `normalizeMoneyWithinBound(...)`.
- `paidAmountDzd` (AMOUNT path) → `normalizeMoneyWithinBound(...)`.
- `grossTotalDzd` accumulation → a new `accumulateGrossTotal(current, line)` that
  refuses a non-finite or `> MAX_MONEY_DZD` running total with
  `InventoryError("BUSINESS_RULE", …)`. Each line is bounded, but a batch of
  legal lines can still sum past the safe-integer range; the guard runs as the
  total grows, before anything is written. Mirrors
  `AssetChargeService.sumLiveCharges` / `projectTotalOutOfRange` and
  `project-cost.service.ts` `sumMoney`.

### Derived-value audit

- `remainingDebtDzd = max(0, grossTotal − paidAmount)`; with `grossTotal ≤ MAX`
  and `paidAmount ≤ grossTotal` (overpayment is already refused), `remaining ≤ MAX`.
- PERCENT path: `grossTotal × percent/100`, `percent ∈ [0,100]` → `≤ grossTotal ≤ MAX`.
- `recordInvoicePayment` refuses `amount > remainingDebtDzd`, so it can never
  push `paidAmountDzd` past `grossTotal` — no overflow path.

## Tests

Contracts (`packages/contracts/src/index.test.ts`):

- consumable input rejects `unitPriceDzd` / `totalPriceDzd` above `MAX_MONEY_DZD`
  and accepts the boundary;
- invoice input rejects `paidAmountDzd` above the bound, accepts it and the
  omitted/null/zero forms;
- invoice group output rejects `grossTotalDzd` / `paidAmountDzd` /
  `remainingDebtDzd` above the bound, accepts the boundary;
- entry output still reads a stored above-bound row back.

API (`apps/api/src/modules/inventory/inventory-transfer-charge.test.ts`):

- an aggregate of individually legal asset lines that sums above the bound is
  refused with a `BUSINESS_RULE` error and writes nothing (no charge, no movement);
- a batch exactly at the bound still passes.

## Risks / migration

- A legacy invoice group stored above the bound (created before this gate) can no
  longer be read. This is the deliberate "refuse to emit an unrepresentable
  financial number" choice, consistent with #422. The input gate and the
  aggregate guard mean no new row can reach that state.
- UI is unchanged: the error surfaces through the existing `InventoryError`
  envelope (Arabic message).

## Out of scope (candidate follow-ups)

- `inventoryInvoiceGroupRecordPaymentInputSchema.amountDzd` and the outbound
  transfer money inputs are still `z.number().positive()/nonnegative()`.
  `recordInvoicePayment` is safe in practice (it caps at `remainingDebtDzd`),
  but the wire schema is a cosmetic inconsistency. Not part of #429.
