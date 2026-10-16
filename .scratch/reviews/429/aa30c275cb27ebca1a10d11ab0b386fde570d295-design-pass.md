# #429 — design pass (F1=B) — domain-modeling · codebase-design · improve-codebase-architecture

- Reviewed HEAD: `aa30c275cb27ebca1a10d11ab0b386fde570d295`
- Base: `073af118` (`origin/develop`)
- Tier: High-assurance (financial calculation)
- Change under review: parent decision **F1=B** — the three invoice-group OUTPUT
  totals became a permissive persisted read shape (`storedMoneyDzdSchema`); the
  input bounds and `accumulateGrossTotal` write guard are unchanged.

## domain-modeling

- No new money vocabulary. The change restores one coherent read rule: a
  PERSISTED money column reads back permissively; only a value COMPUTED fresh at
  read time may be refused (`inventoryProjectChargesSchema.totalDzd`, #422).
  Invoice group totals and entry line money now share `storedMoneyDzdSchema`.
- The write rule (inputs bounded, aggregate guarded) is stated once and imported.

## codebase-design

- `accumulateGrossTotal` stays the single write-side aggregate rule; both
  accumulation sites call it and it runs before the transaction. Deletion test:
  removing it lets a batch of legal lines store an out-of-range total.
- The permissive group output is not a shallow escape hatch: the write gate is
  the seam that keeps new totals representable, and the read shape's job is to
  represent a stored row.

## improve-codebase-architecture

Friction recorded (none folded into this PR — each is cross-module or
pre-existing):

1. **Report aggregation is the same overflow class, still unguarded.** The
   inventory report sums stored entry line money across all invoices with no MAX
   check (`inventory.service.ts` report builder; `packages/contracts/src/reports.ts`
   schemas unbounded). #429 bounds a single invoice; a multi-invoice report can
   still exceed the range. Follow-up candidate.
2. **`recordInvoicePayment`'s amount is the last unbounded invoice money input**
   (`inventoryInvoiceGroupRecordPaymentInputSchema.amountDzd`, seam
   `normalizePositive`). Safe for normal rows (capped at `remainingDebtDzd`, now
   ≤ MAX), but a legacy above-bound row could accept an over-bound payment.
   Follow-up candidate / parent decision.
3. **Third copy of a money-sum guard** (`accumulateGrossTotal`,
   `AssetChargeService.sumLiveCharges`, `project-cost.service.sumMoney`).
   Unification is a cross-module refactor.
4. **No DB upper `CHECK`** on the group money columns — the write gate is the
   only upper defense. A CHECK would also reject updates to legacy rows, so it
   is a deliberate defense-in-depth decision, not a quick add.

## Verification (red → green)

Code HEAD `aa30c275` (evidence-only commit follows).

- Pre-fix (`git checkout 073af118 -- packages/contracts/src/inventory.ts apps/api/src/modules/inventory/inventory.service.ts`, rebuild contracts):
  contracts `-t "429"` **3 failed**; API inventory `-t "429"` **4 failed**
  (aggregate, cross-entry, consumable unit-price seam, paid-amount seam).
- Final: `pnpm --filter @tuari/contracts test` → 6 files, **250 passed**;
  API `src/modules/inventory/` + `src/rpc/handlers/reports.test.ts` → 8 files,
  **128 passed**; `pnpm typecheck` exit 0; `pnpm lint` exit 0.

Note: the flipped group-output test is a POLICY pin (the permissive shape equals
the old unbounded `z.number().nonnegative()`), so it cannot fail on pre-fix code;
it fails only if the strict output bound is reintroduced. That is expected under
F1=B and is recorded, not hidden.

Verdict: no worse than the PR found it; the aggregate-write rule is single-sourced
and the read shapes are coherent. Residual friction is follow-up scope.
