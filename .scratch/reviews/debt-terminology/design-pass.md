# Debt terminology — design pass

- lane: fix-debt-terminology
- base SHA: `5d0629be768a75689c081249843af4a79d045230`
- base note: originally recorded against `fdb5dda6`; the branch was later rebased onto `5d0629be`, which is the real base
- scope: the whole debt-terminology PR diff plus this lane's fixes
- lenses: `domain-modeling`, `codebase-design`, `improve-codebase-architecture`
- method: three independent reviewer sub-agents (read-only) + parent synthesis

## 1. domain-modeling

**Vocabulary.** The diff resolves the overloaded labels (`مدين`/`دائن`, `لنا عنده`,
`علينا له`, `مغلق`) into one direction vocabulary (`PAYABLE`/`RECEIVABLE`,
`مستحقات علينا/لنا`) and one five-state balance vocabulary
(`DEBT_BALANCE_STATE_PHRASE`). The wire enum derives from that table
(`packages/contracts/src/debts.ts`), and the API and web both route through it.

**Gross vs net is stated once.** `finance.service.ts` documents the report's
gross, both-direction exposure; `getDebtBalanceState` with `direction` omitted is
the net path. They do not collide. This PR removed the one place that confused
them (the report cards stamped `owedToUs` on a gross figure).

**Findings.**

| Finding | Verdict |
| --- | --- |
| `settled` names both a balance state (zero) and the account status `SETTLED`. Pre-existing conflation; the owner's authoritative term for a zero balance is `مسوّى`. | Justified as-is — the status and the state both mean "no open balance"; renaming would contradict the settled terminology. |
| The comment says the wire label and i18n "derive from" `DEBT_BALANCE_STATE_PHRASE`, but `ar.ts` hardcodes the strings and `getDebtDirectionLabel` hardcodes the directions. | Justified as-is — `debt-utils.test.ts` pins both (`states` `toEqual` the contract table; `directions.*` equal `getDebtDirectionLabel`). Drift fails the suite. |
| No debt glossary exists: root `CONTEXT.md` is diagnostics-only, and there is no `CONTEXT-MAP.md` or `docs/domain/`. The hardened terms are glossary-grade and the sign/gross trade-off is hard to reverse (wire enum). | **Follow-up.** Adding a debt context glossary + a gross-vs-net ADR is a repo-structure decision; recommend `docs/domain/debt/CONTEXT.md` + `CONTEXT-MAP.md` + `docs/adr/ADR-DEBT-001.md` as a separate docs PR. |
| Design doc still described `getDebtBalanceMeta` as staying and `amountLabel` as part of the helper shape. | **Fixed here** — design doc updated to the shipped surface. |

## 2. codebase-design

**Deletion test on this lane's work.** My earlier fix removed the last
`shortLabel` consumer of `getDebtBalanceMeta`, leaving a six-field module that
production used for one field (`.textClassName`) — and that field was a
sign-only tone that inverted colors for PAYABLE movements. Deleting it
concentrates the tone on `getDebtBalanceDisplay` and makes movement tone
direction-aware.

| Finding | Verdict |
| --- | --- |
| `getDebtBalanceMeta` is shallow (6-field interface, 1 field used) and its sign-only tone is wrong for PAYABLE movements. | **Fixed here** — deleted; the four movement sites use `getDebtBalanceDisplay({ currentBalance: signedAmount, direction })`. |
| `getDebtBalanceDisplay` exposed a dead `amountLabel` (tests only). | **Fixed here** — removed. |
| The consolidation preview rule (which side keeps the remainder and how it is phrased) was buried in the dialog component, so it could only be tested by rendering. | **Fixed here** — extracted `getConsolidationRemainder` into `debt-utils.ts`, tested through its interface. |
| `getDebtBalanceState`'s optional `direction` overloads two meanings (account balance vs net). A caller who omits it silently gets sign-only semantics — the exact shape of the original bug. | **Follow-up.** Recommend splitting into `getDebtAccountBalanceState(account)` (direction required) and `getNetDebtBalanceState(net)`, mirroring the API's `getDebtAccountBalanceLabel` / `getDebtBalanceLabel`. Interface-wide refactor; out of this PR's blast radius. |
| `packages/contracts/src/debts.ts` still accepts optional `direction` and a signed `openingBalanceDzd`, so "opening is always positive; direction carries meaning" is enforced only by the web caller. | **Follow-up** (contract/API). |
| `void-entry-dialog` / `record-entry-payment-dialog` take `accountDirection` optional; omitting it silently degrades to sign-only. Only one adapter exists. | **Follow-up** — requires the caller to guarantee a direction; low risk today. |
| `getDebtAccountBalance` is a one-line pass-through. | **Follow-up** (minor). |
| Duplicate i18n keys: `terminology.buttons.recordPayment` ≡ `debtLedger.entries.recordPaymentButton`; `terminology.states.settled` ≡ `debtsHub.filters.settled`. | Note — the terminology copies are the pinned ones; retire the legacy copies in a cleanup. |

## 3. improve-codebase-architecture

| Candidate | Strength | Verdict |
| --- | --- | --- |
| UI direction alias (`owed-to-us`/`owed-by-us`) hand-mapped to `PAYABLE`/`RECEIVABLE` in the create page and re-derived for labels. | Strong | **Fixed here** — `debtDirectionFromAlias` in `debt-utils.ts`; the create page derives the label and the wire direction from it. |
| The phrase table has three homes: contracts `DEBT_BALANCE_STATE_PHRASE`, i18n `states.*`, and `getDebtDirectionLabel`'s hardcoded directions. | Strong | **Follow-up** — the two i18n copies are pinned by tests, but a single derivation (i18n generated from, or consuming, the contracts table) would remove the drift class. |
| The hub filter re-derives balance state from sign (`row.balanceDzd > 0`) instead of the state helper; only testable by rendering. | Worth exploring | **Follow-up** — expose a `debtBalanceStateForNet(balance)` predicate and test it directly. |
| `phraseKey` builds an i18n key by string convention; a renamed key fails silently. | Speculative | Note — a typed key map would concentrate it. |

## Fixes applied in this pass

- Deleted `getDebtBalanceMeta`; movement tone now direction-aware at all four sites
  (consolidation entries, ledger amount column, void dialog).
- Extracted `getConsolidationRemainder` from `ConsolidationDialog`; tested directly.
- Removed the dead `amountLabel` field.
- Added `debtDirectionFromAlias`; the create page derives its label and wire
  direction from it.
- Updated the design doc to the shipped surface.

## Reported, not fixed (recommendations)

1. Debt glossary + gross-vs-net ADR — follow-up docs PR.
2. Split `getDebtBalanceState` into account/net functions — follow-up.
3. Enforce positive opening + required direction in the contracts/API — follow-up.
4. Retire duplicate i18n keys — follow-up cleanup.
5. Hub filter predicate seam — follow-up.
6. Optional `accountDirection` on the two dialogs — follow-up.
