# #459 / PR #481 — debate at `f1e00278`

- mode: remote
- base SHA: `d6164c65`
- reviewed HEAD: `f1e00278`
- critic + defender run in fresh context; synthesized below.
- tier: Standard

## Critic

No 8–10 blocker. Prior-critic findings and their status at `f1e00278`:

| # | Round-1 finding | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Non-numeric payment showed the zero-payment hint | **Fixed** | `debt-cases-panel.tsx:88-92`; test "non-numeric payment is invalid, not a zero payment" |
| 2 | Empty create amount allowed | **Intentional** | design §Round 2; test pins `openingBalanceDzd: undefined` |
| 3 | Create post-save re-fire race | **Closed** | both mutations gate `debt-cases-panel.tsx:100-104`; amount cleared only after `await` (`:283`) |
| 4 | Inline payment sign | **Fixed** | `signedPaymentAmount` (`:158`) |
| 5 | No reason while pending | **Fixed** | `debts.cases.saving` (`:109`, rendered `:251-255`) |
| 6 | Overpay warning | **Not fixed — by design** | domain has credit states, matches the ledger panel |
| 7 | Two "account" notions | **Narrowed** | bidirectional renders the net; residual is pre-existing |
| 8 | Unhandled rejection | **Dismissed** | see below |
| 9 | Hardcoded placeholders | **Open (low, pre-existing)** | `:243,246` |

Remaining scored:

- **3 — fractional DZD.** `-Math.abs(0.4)` passes `z.number().finite()`
  (`packages/contracts/src/debts.ts:224`); nothing rounds to whole dinars.
  Pre-existing; not introduced here. Deferred.
- **3 — stat-card ledger can name a different ledger than the form.**
  Pre-existing (see design pass).
- **2 — Arabic-Indic digits / grouped digits** read as invalid
  (`Number("١٢٠٠") → NaN`). Pre-existing parse approach, shared with the other
  debt forms. Deferred.
- **2 — placeholders** not in i18n. Pre-existing.
- **2 — conditional `role="status"`** mounts the live region only when a reason
  exists. Low; the repo's invoice pattern does the same.

## Defender

- The single resolver makes copy/action divergence structurally impossible — the
  exact class of the defect. (conf 9)
- `signedPaymentAmount = -Math.abs(amountValue)` matches the server's own
  payment law: `finance.service.ts:391` sums `currentBalance + signedAmountDzd`,
  and the nominal-payment path uses the identical `-Math.abs` (`:453,465`). (conf 9)
- Optional `entryType` defaulting to `ADJUSTMENT` is backward-compatible; only
  the cases panel opts into `PAYMENT`. No wire change. (conf 8)
- The mid-save unlock fix closes a real race, pinned by a test that fails
  pre-fix. (conf 8)
- Scope discipline: the out-of-scope pre-existing items are recorded in the
  design doc, not expanded silently. (conf 7)

## Synthesis

- **Fixed** (round 1 → this HEAD): non-numeric reason, pending reason, entry
  mutation gate + test, RECEIVABLE payment test, hoisted request construction,
  empty-create contract pinned, mock isolation.
- **Dismissed — unhandled rejection is not a silent failure.** Both debt
  mutations surface errors through their `onError` toast
  (`workspace-mutations.ts:695` for account create, `:729` for entry create), so
  the operator does see the failure; the `await mutateAsync` shape is shared with
  sibling debt forms (`debt-create-page.tsx:165`, `record-payment-dialog.tsx:57`).
  The unhandled console rejection is pre-existing, not introduced here.
- **Dismissed — overpay warning.** The cases form is a signed movement form, not
  the capped allocation dialog; the domain has credit states by design.
- **Deferred (pre-existing, parent decision requested):** ledger-panel
  `entryType`/label split; fractional-dinar rounding; Arabic-Indic/grouped digit
  parsing; i18n placeholders; stat-card vs selected ledger; conditional live
  region.

Verdict: no blocker; gate clean on the work this PR did.
