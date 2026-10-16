# #429 — two-axis code review (F1=B) — Standards + Spec

- Reviewed HEAD: `aa30c275cb27ebca1a10d11ab0b386fde570d295`
- Base: `073af118` (`origin/develop`)
- Method: fresh-context read-only reviewer; Standards includes the Fowler smell
  baseline (repo standards override; tooling-enforced items skipped).

## Standards

Hard violations: **none.** Explicit staging (no `git add -A`, `AGENTS.md`);
output schemas are pure validators (`storedMoneyDzdSchema`), no transform
(`.agents/wisdom/architecture.md`); the seam reuses the wire schema
`nonNegativePaymentAmountSchema` rather than hand-rolling a check.

Judgement calls:

1. **Duplicated Code** — `accumulateGrossTotal` is the third money-sum guard
   alongside `AssetChargeService.sumLiveCharges` and `project-cost.service.sumMoney`.
   Each has its own domain error/message; unification is a cross-module refactor,
   recorded as a follow-up candidate.
2. **Float rounding inconsistency** — `accumulateGrossTotal` does not call
   `roundMoney`, unlike its two siblings. Behaviour-preserving (the old `+=` did
   not round), low.
3. **Speculative Generality** — resolved earlier: the dead default parameter on
   `normalizeMoneyWithinBound` is gone.
4. **Primitive Obsession** — money stays a bare `number`; repo-wide convention.

No middle-man / message-chain / shotgun-surgery smells in the diff. Per-file
formatting matches each file's existing style.

## Spec

Spec = issue #429 + `.scratch/implementation/429-design.md` (F1=B).

Delivered:

- Input bounds via the shared helper, no new constant (consumable
  `unitPriceDzd`/`totalPriceDzd`, group `paidAmountDzd`).
- `accumulateGrossTotal` refuses non-finite or `> MAX_MONEY_DZD` with
  `InventoryError("BUSINESS_RULE")`; both accumulation sites route through it and
  phase 1 runs before `withTransaction`, so nothing is persisted on refusal.
- No legacy read break: group totals and entry lines are both
  `storedMoneyDzdSchema` (still rejecting negative/`NaN`/`±Infinity`).
- Derived-value audit recorded in the design doc.

Spec deviation (approved): the issue text says "bound the OUTPUT"; F1=B keeps it
permissive. This is a parent-confirmed, documented deviation and must appear in
the PR body.

Out of scope, pre-existing: PERCENT path still calls unbounded `normalizeMoney`;
`recordInvoicePayment.amountDzd` and outbound money inputs remain unbounded;
report aggregation is unguarded.

Verdict: no hard-standards breach; the spec is delivered with one approved,
documented deviation. Residual items are low / judgement-call / explicitly out of
scope.
