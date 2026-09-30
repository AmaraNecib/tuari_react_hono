# Debt terminology — two-axis code review

- lane: fix-debt-terminology
- base SHA: `5d0629be768a75689c081249843af4a79d045230`
- reviewed HEAD: `24142f7c56e04560e3f9a15429f11c46d048b5c5`
- rename: pre-rebase `2be128f0` → pushed `24142f7c` (branch rebased onto `5d0629be`); content unchanged
- reviewers: independent Standards + Spec sub-agents (read-only), parent synthesis

## Standards

- Hard: `consolidation-dialog.tsx` header balances rendered a signed balance as a
  positive magnitude with a **direction** label and no **state** phrase — an overpaid
  PAYABLE account read "we owe 50,000". Fixed.
- Hard: `debt-utils.getDebtDirectionLabel` hardcodes the Arabic while
  `debts.terminology.directions.*` duplicates it. Kept: the util is the single source and
  `debt-utils.test.ts` pins the i18n copy to it; making every call site translate is a
  larger refactor with no user-visible effect in this Arabic-only app.
- Judgement: `debt-ledger-panel.tsx:139` settlement description dropped the movement
  sign. Dismissed: it is a prose magnitude ("a settlement of 30,000"), not a ledger
  column; the sign would be noise.
- Baseline smells: `getDebtBalanceMeta` is a thin re-wrap of the state machine; inline
  `` `دج ${formatDebtAmount(x)}` `` recurs although the helper returns `amountLabel`.
  Dismissed as low; `amountLabel` is part of the helper's tested surface.
- Dead keys: `search.payable`/`search.receivable` were unused after the global-search
  site moved to the state phrase. Removed.
- No generated artifacts in the change; staging was explicit.

## Spec

- The contracts helper is the single source of truth; the API `balanceLabel` enum and
  the web both derive from `DEBT_BALANCE_STATE_PHRASE`. Direction labels match.
- Blocker (found): `consolidation-dialog.tsx` entry deltas used `formatDebtAmount`
  (absolute) where the design says movement deltas stay signed. Fixed.
- Blocker (found in synthesis): the consolidation preview derived its phrase from the
  sign of a side magnitude. Fixed with the account direction.
- Partial: `dashboard-overview.tsx` report cards were "phrase-labelled" with `owedToUs`,
  but `totalOutstandingDzd`/`overdueDzd` aggregate BOTH directions (`finance.service.ts`
  documents gross exposure). The phrase is false. Removed the direction phrases;
  `totalSettledDzd` keeps the settled label.
- Scope creep: `report-builder.tsx` was not in the design's render-site list. The
  direction phrases added there are removed; the settled label is harmless.

## Summary

- Standards: worst issue = consolidation header balance without a state phrase (fixed).
- Spec: worst issue = movement deltas rendered unsigned (fixed).
