# #475 — bound the remaining inventory money inputs and guard the report aggregates

- **Issue**: [#475](https://github.com/AmaraNecib/tuari_react_hono/issues/475) — "Money: bound the remaining inventory money inputs and report aggregates"
- **Branch**: `fix/475-remaining-money-bounds`
- **Worktree**: `D:/projects/tuari_react_hono/worktrees/fix-remaining-money-bounds`
- **Base**: `origin/develop` @ `d6164c651a42be41f5b4824a53fa88e06e8a1ffa`
  (HEAD == develop; the diff is only this change)
- **Mode**: remote (parent owns push/PR — lane does not push or merge)
- **Review tier**: High-assurance (financial calculation)
- **Follows**: #429 / PR #476 (same overflow class, deliberately out of #429's scope)

## Problem

Two money-rule gaps remain after #429:

1. **`recordInvoicePayment.amountDzd`** — `inventoryInvoiceGroupRecordPaymentInputSchema`
   is `z.number().positive()`, unbounded, and the service seam
   (`InventoryService.recordInvoicePayment` → `normalizePositive`) is unbounded
   too. A legacy invoice row whose `remainingDebtDzd` is above `MAX_MONEY_DZD`
   (written before the #429 gate) can accept an over-bound payment, and a direct
   caller can pass any magnitude.
2. **Report aggregation** — the three report schemas in
   `packages/contracts/src/reports.ts` declare their money fields as
   `z.number().nonnegative()` (unbounded), and the three generators
   (`InventoryService.generateInventoryReport`,
   `InventoryService.generateMovementReport`,
   `FinanceService.generateDebtReport`) sum stored money across every row with
   no `MAX_MONEY_DZD` guard. A batch of individually-legal legacy rows can sum
   past the safe-integer range and be emitted as a silently wrong number.

## Design

### 1. Input — reuse the shared positive money schema

`paymentAmountSchema` (`z.number().positive().max(MAX_MONEY_DZD)`,
`packages/contracts/src/payment.ts`) is the repo's one positive money rule.
Reuse it, do not invent a constant.

- `inventoryInvoiceGroupRecordPaymentInputSchema.amountDzd`
  → `paymentAmountSchema`.
- Service seam: `recordInvoicePayment` keeps `normalizePositive` for the
  existing "greater than zero" message, then runs the same shared magnitude
  check through `normalizeMoneyWithinBound` (which reuses
  `nonNegativePaymentAmountSchema`, #289 defense-in-depth). A legacy
  above-bound `remainingDebtDzd` therefore cannot accept an over-bound payment.

### 2. Report outputs — computed values keep the write bound

Every report money field is COMPUTED fresh at read time (a sum across stored
rows), so unlike a persisted money column it may refuse to emit an
unrepresentable value — the #429/F1=B contrast
(`inventoryProjectChargesSchema.totalDzd` is the precedent). Replace
`z.number().nonnegative()` with `nonNegativePaymentAmountSchema`
(`nonnegative().max(MAX_MONEY_DZD)`) for every report money field. Count fields
stay unbounded. Output schemas remain pure validators — no transform.

Fields bounded: `inventoryReportSchema` summary totals, `byLocation.assetValueDzd`,
`byItemType.valueDzd`, `agingAnalysis.valueDzd`; `debtReportSchema` summary
totals, `agingBreakdown.amountDzd`, `byParty.outstandingDzd|settledDzd`,
`topDebtors.amountDzd`; `movementReportSchema.byType|byPeriod|topDestinations.valueDzd`.

### 3. Service seam — guard the aggregate where it is summed

Add ONE shared rule to `apps/api/src/modules/company/report.helpers.ts` (the
report aggregators' existing shared home):

```ts
export function accumulateReportMoney(currentDzd, amountDzd, onOverflow): number
```

It adds and refuses a running total that is non-finite or `> MAX_MONEY_DZD`.
The owning module supplies its typed BUSINESS_RULE error through `onOverflow`,
so the arithmetic rule lives once while the refusal keeps the module's error
(`InventoryError` for inventory/movement, `CompanyError` for debt) — the same
shape as #429's `accumulateGrossTotal`. The shared Arabic message lives next to
the rule.

Every money accumulation in the three generators routes through a thin local
wrapper (`accumulateInventoryReportMoney` / `accumulateDebtReportMoney`):

- inventory: summary asset/consumable totals, the `totalValueDzd` cross-sum,
  per-location asset value, per-item value, aging value;
- movement: `byType` value, `byPeriod` value, `topDestinations` value (the
  `quantity × unitPrice` product flows through the same guard);
- debt: account settled sum, `totalOutstanding|totalSettled|overdue`, aging
  amount, and the per-party outstanding/settled fold.

The guard runs before `roundMoney`, so a raw sum above the bound is refused
instead of rounded and emitted.

### 4. RPC seam

`reportsGenerate` returns a plain discriminated union with no failure branch, so
a typed domain refusal must be rethrown as a wire error or ORPC would surface it
as a generic 500 (`#421` lesson). Add an `errorResolver` to the reports handler
that maps any error carrying `.appError` to `new ORPCError(error.appError.code,
{ message: error.appError.message })` — ORPC v1 accepts arbitrary string codes,
so the client observes `code: "BUSINESS_RULE"`.

## Derived-value audit

- Report counts, `daysSinceLastPayment`, and `age` are not money; unbounded.
- `roundMoney` never overflows (it returns `> MAX/100` unchanged), so the guards
  are the only ceiling the report totals need.
- `byParty`/`topDebtors` read the already-guarded per-party accumulators; a
  second party cannot push a party total past the bound because the fold itself
  is guarded.

## Tests

Contracts (`packages/contracts/src/index.test.ts`):

- `inventoryInvoiceGroupRecordPaymentInputSchema` rejects `amountDzd` above
  `MAX_MONEY_DZD`, accepts the exact bound, and keeps rejecting zero/negative;
- each report schema rejects an above-bound computed money value and accepts a
  normal one; count fields stay permissive;
- the invoice-group stored read still reads a legacy above-bound row back
  (permissive persisted shape, unchanged).

API:

- `InventoryService.generateInventoryReport` / `generateMovementReport` refuse a
  legacy above-bound stored row with `InventoryError("BUSINESS_RULE")` (service
  double, no DB);
- `FinanceService.generateDebtReport` refuses a legacy above-bound account
  balance with `CompanyError("BUSINESS_RULE")` (real sqlite harness, raw UPDATE);
- `recordInvoicePayment` refuses an over-bound payment against a legacy
  above-bound invoice and still accepts a normal payment (real sqlite env);
- `reportsGenerate` surfaces the refusal as `code: "BUSINESS_RULE"` through the
  handler resolver (real router env).
- red → green: each guard test must fail on the pre-fix code.

## Risks / migration

- No legacy read break: report outputs are computed at read time, so refusing an
  unrepresentable total is the documented #429/F1=B behaviour (a persisted
  invoice-group total still reads back permissively). The UI now surfaces a
  business-rule error instead of a silently wrong total for a legacy-overflow DB.
- Out of scope (candidate follow-up): the outbound-transfer money inputs
  (`outboundTransferItemInputSchema.unitPriceDzd`, `debtAmountDzd`,
  `firstPaymentAmountDzd`) are still unbounded at the wire and the service seam.
  They live in the `createOutboundTransfer` region owned by #450/PR #477, so
  bounding them here would collide; surfaced, not silently deferred.
