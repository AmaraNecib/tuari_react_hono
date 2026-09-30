# Debt terminology — adversarial review (debate)

- lane: fix-debt-terminology
- branch: `fix/debt-terminology`
- base SHA: `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`
- reviewed HEAD: `2be128f042b30d5cde82488080cc7424d36842db`
- reviewer: independent critic + defender sub-agents (read-only), parent synthesis

## Critic (harsh)

- **5/10** `debt-ledger-panel.tsx:138-139` — settlement *movement* description rendered
  unsigned (`formatDebtAmount`), where the design says movement deltas stay signed.
- **6/10** `record-entry-payment-dialog.tsx:63-64` — `getDebtBalanceDisplay` applied to
  `entry.signedAmountDzd` (an opening movement) and to `maxPayment` (a limit), so the
  phrase is attached to the wrong quantity.
- **4/10** `debt-utils.ts:93-99` — `getDebtBalanceMeta` maps any signed number to a
  balance phrase + `statusLabel`; its callers are movement sites.
- **3/10** `debt-cases-panel.tsx:139-141` — direction label + state phrase adjacent is
  redundant.
- **2/10** `debts-hub-page.tsx:37-42` — filter chips mix state phrases and a
  `debtsHub.filters.*` key; labels do match the predicates (`balanceDzd > 0` / `< 0`).
- Verified clean: state machine order (zero → settled before direction), no signed
  *balance* site, direction-aware sites all pass `direction`, no leftover old literals.

## Defender (charitable)

- State machine at `packages/contracts/src/debt-helpers.ts:92-113` is a literal
  transcription of the design table; zero short-circuits before direction.
- Phrase table feeds both `DebtBalanceLabel` and `debtBalanceLabelSchema`; API
  (`company.helpers.ts:62`, `finance.service.ts:789`) and web (`debt-utils.ts:77`) derive
  from the same contract helper. Drift is structurally impossible.
- `formatDebtAmount` wraps `Math.abs`; movement column keeps `formatDebtMoney`.
- Flagged as a non-blocking polish: `consolidation-dialog.tsx` account headers use a
  direction label + absolute amount rather than the state phrase.

## Synthesis

| Finding | Severity | Verdict |
| --- | --- | --- |
| Consolidation preview phrase derived from a side-magnitude sign (`مستحق لنا` on a payable remainder) | High | **Confirmed + fixed** (not raised by critic; found in synthesis) |
| Consolidation account headers omit the state phrase (overpaid PAYABLE reads "we owe") | High | **Confirmed + fixed** |
| Consolidation opening-entry deltas rendered unsigned | Medium | **Fixed** (revert to `formatDebtMoney`) |
| Gross report totals (`totalOutstandingDzd`/`overdueDzd`) stamped `owedToUs` | Medium | **Fixed** (phrases removed; the API doc says both directions) |
| Sub-dinar balance rounds to `0` beside a direction phrase | Low | **Fixed** (`formatDebtAmount` keeps centimes) |
| `getDebtBalanceMeta` for movement tone | Low | Dismissed — design sanctions the sign-based movement tone; only `textClassName` is consumed |
| `record-entry-payment` max-payment phrase | Low | Dismissed — the design explicitly makes max payment direction-aware |
| Hub filter chips / `debt-cases` redundancy | Low | Dismissed — labels match predicates; cosmetic |
| `debt-create-page` never passes `direction` to `createDebtAccount` | High (pre-existing, out of PR diff) | **Deferred to parent** — see resolution file |
