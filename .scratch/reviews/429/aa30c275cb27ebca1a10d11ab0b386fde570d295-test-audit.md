# #429 — test audit (F1=B)

- Reviewed HEAD: `aa30c275cb27ebca1a10d11ab0b386fde570d295`
- Base: `073af118` (`origin/develop`)
- Method: fresh-context read-only auditor over the changed tests and source.

## Acceptance criteria vs tests

| Criterion | Test | Fails pre-fix? |
| --- | --- | --- |
| Out-of-range input rejected (wire) | `index.test.ts` `#429`: `unitPriceDzd`, `totalPriceDzd`, `paidAmountDzd` at `MAX+1` | yes |
| Out-of-range input rejected (seam) | `inventory-debt-sign.test.ts` consumable unit price + paid amount | yes |
| Aggregate overflow → `BUSINESS_RULE` | `inventory-transfer-charge.test.ts` per-line sum + cross-entry carry; `inventory-debt-sign.test.ts` `quantity × unitPrice` with no charge backstop | yes |
| Normal batch still passes | `inventory-transfer-charge.test.ts` accept-at-bound (also asserts the persisted total) | regression guard by design |
| Group output reads a legacy above-bound row | `index.test.ts` group-output block | **no — policy pin** (permissive shape ≡ old unbounded `nonnegative()`) |

## Findings and disposition

- 🟠 **`recordInvoicePayment.amountDzd` is unbounded** (`inventoryInvoiceGroupRecordPaymentInputSchema`,
  seam `normalizePositive`). Safe for rows whose `remainingDebtDzd ≤ MAX`, but a
  legacy above-bound row could accept an over-bound payment. **Not fixed here:**
  outside the parent's stated change list; surfaced as a follow-up / decision.
- 🟡 **No mixed-kind running-total test** (consumable→asset carry). Low: the same
  `accumulateGrossTotal` call is exercised cross-entry with assets. Accepted.
- 🟡 **No at-bound `paidAmountDzd` acceptance test.** Low. Accepted.
- 🟡 **Group-output legacy test cannot fail pre-fix.** Expected under F1=B (the
  permissive read shape is a behavioural no-op); it pins the policy against
  re-tightening. Recorded, not counted as bug coverage.
- 🟡 **Two no-write assertions are near-tautological** (`accumulateGrossTotal`
  runs before the transaction). Harmless; not counted as atomicity coverage.
- 🟡 **Inconsistent error assertions** (`toBeInstanceOf` in one test, code-only in
  another). Cosmetic.

## Quality

Names cite `(#429)` and behaviour; assertions use the typed
`appError.code === "BUSINESS_RULE"` plus the Arabic message; the seam tests drive
the real sqlite schema. Grade: **B** (three of four criteria have discriminating
tests; one criterion is a policy pin by design).

Verdict: the required criteria are pinned. The one medium residual
(record-payment amount) is a pre-existing, out-of-scope money-rule hole proposed
as a follow-up; nothing this diff changed is untested.
