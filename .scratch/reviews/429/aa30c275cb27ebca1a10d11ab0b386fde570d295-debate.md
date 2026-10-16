# #429 — adversarial debate (F1=B) — critic + defender, synthesized

- Reviewed HEAD: `aa30c275cb27ebca1a10d11ab0b386fde570d295`
- Base: `073af118` (`origin/develop`)
- Method: two fresh-context read-only reviewers over `git diff 073af118...HEAD`,
  the changed files, the issue spec, and `.scratch/implementation/429-design.md`.
- F1 is now RESOLVED by the parent decision: **B** — group totals are a
  permissive persisted read shape; the write gate prevents new over-bound rows.

## Invariants the critic verified (all hold)

- **(a) No new path stores a total above `MAX_MONEY_DZD`.** The only writer is
  `InventoryService.createInvoiceGroup`; both accumulation sites route through
  `accumulateGrossTotal`, which runs in phase 1 before `withTransaction`.
  `paidAmountDzd ≤ grossTotalDzd` and `remainingDebtDzd = max(0, gross − paid)`.
- **(b) The accumulator is stateful across entries** — the cross-entry test
  exercises a non-zero running total.
- **(c) Derived values cannot overflow** (`remaining ≤ gross`, PERCENT `≤ gross`,
  `recordInvoicePayment` moves `paid` only toward `remaining`).
- **(d) The permissive output still rejects** negative, `NaN`, and `±Infinity`.

## Findings and synthesis

| # | Sev | Finding | Decision |
|---|-----|---------|----------|
| 1 | 4 | Report aggregation of stored line money over many invoices is unguarded (`reports.ts` unbounded) — the same overflow class. | Out of #429's named scope. **Follow-up candidate** (parent decision). |
| 2 | 3 | With F1=B the write gate is the sole upper defense; the DB CHECK only enforces `>= 0`. | Accepted defense-in-depth decision; a CHECK would reject legacy-row updates. |
| 3 | 3 | The flipped group-output test is non-discriminating (the permissive shape equals the old `nonnegative()`), so it only pins the policy. | Accepted and documented: under F1=B the change is a behavioural no-op; the test guards against re-tightening. |
| 4 | 2 | `input.totalPriceDzd` is bounded at the wire but ignored at the seam (server derives the total). | Pre-existing; harmless. |
| 5 | 2 | Aggregate refusal carries no `fieldErrors`. | Judgement call accepted (an aggregate has no single field). |
| 6 | 2 | PERCENT float edge can make a 100 % payment look like an overpayment. | Pre-existing, unchanged. |
| 7 | 1 | `normalizeMoney` is now used only for the PERCENT amount. | Cosmetic. |
| 8 | 1 | Comment words "Mirrors `AssetChargeService.sumLiveCharges` / `project-cost.service`" mix class/file names. | Cosmetic, accepted. |
| 9 | 3 | `recordInvoicePayment`'s `amountDzd` is the last unbounded invoice money input; a legacy above-bound row could accept an over-bound payment. | **Follow-up candidate / parent decision.** Safe for normal rows; identical pre-existing risk, not worsened by this diff. |

## Verdict

No blocker. Invariants (a)–(d) hold; F1 is resolved as briefed by the parent.
The two meaningful residual items (report aggregation, record-payment amount) are
cross-cutting money-rule gaps outside #429's named scope and are surfaced as
follow-up candidates rather than silently deferred.
