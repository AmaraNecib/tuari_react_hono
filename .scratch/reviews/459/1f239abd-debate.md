# Debate (final) — #459 debt cases payment form @ 1f239abd

- Range under review: `git diff fdb5dda66...1f239abd` (331 files; almost all of it is other PRs already
  reviewed per issue). **This pass is scoped to the lane's own four commits**, `86c479d7` (fix) →
  `d038be49` (tests) → `f001d145` (comment/test) → `1f239abd` (comment rewrite + entryDate pin +
  resolver test); the lane range is `86c479d7^..1f239abd` (9 files, +372/-41).
- Context: `.scratch/implementation/459-design.md` (at 1f239abd), GitHub issue #459.
- Priors: `.scratch/reviews/459/86c479d7-debate.md` (raised C2), `.scratch/reviews/459/f001d145-debate.md`
  (asked for the comment fix; no blockers).
- Reviewer: debate gate. Read-only — no source modified.

## Q1 (the gate question) — is the credited-ledger comment honest now? Is C2 closed?

The final comment (`apps/web/src/features/debts/debt-cases-panel.tsx:234-240`):

```
// A payment reduces the balance on either ledger, so the typed
// magnitude becomes a negative movement; the sign is the
// payment's, never inferred from the direction. The direction
// selected which ledger's account receives it. This posts a
// signed movement (like the ledger form), not a capped
// allocation, so it can deepen an existing credit.
```

Verified against the code it describes:

1. **The server-precedent claim is gone.** `f001d145` had added "This matches the server's
   recordDebtPayment law (`-|amount|`): an account already in credit stays reducing rather than being
   refunded." `1f239abd` deleted exactly that sentence. The prior debate's C2a (severity 4, "do not cite a
   capped law as precedent") is addressed literally, not cosmetically.
2. **The replacement is factually correct.** `finance.service.ts:447` `if (input.amountDzd >
   account.currentBalance) throw VALIDATION` + `:453` `const signedAmountDzd = -Math.abs(input.amountDzd)`
   confine that law to `currentBalance > 0`. The comment now says the opposite classification: "a signed
   movement … not a capped allocation, so it can deepen an existing credit". That matches the panel's own
   path — `debt-cases-panel.tsx:242` → `useCreateDebtEntryMutation` → `finance.service.ts:391`
   `nextBalance = account.currentBalance + signedAmountDzd`, **no cap**. On `currentBalance: -700` a 200
   payment yields -900, i.e. deepened credit. The comment discloses that instead of hiding it.
3. **"like the ledger form" is verifiable.** `debt-ledger-panel.tsx:118` posts `signedAmountDzd:
   signedAmountValue!` through the same `useCreateDebtEntryMutation` with no balance-based sign flip and no
   cap; its input placeholder even accepts `-2500`. So the sibling cited is a true sibling. Contrast
   `record-payment-dialog.tsx:54` (`balance > 0 ? -amount : +amount`, move-toward-zero), which is the capped
   allocation the comment explicitly distinguishes itself from ("not a capped allocation").
4. **The test name was corrected too.** `1f239abd` renamed `reduces (does not refund) a ledger that is
   already in credit` → `posts a reducing movement even on a credited ledger`, and the test asserts
   `signedAmountDzd: -200` on a `currentBalance: -700` account. It pins the *movement's* sign, which is what
   the code does; it no longer claims the balance moves toward zero.

**Verdict: C2 is closed.** The behaviour is unchanged and remains D7-consistent (sign by entry type,
independent of balance; `finance.service.ts:113-115`), and the justification no longer overstates. Residual
tension is stylistic, not factual: the first clause "a payment reduces the balance on either ledger" reads
as a universal, while the last clause concedes it can deepen a credit — a reader must hold both clauses.
Severity 1; not worth another commit on a comment that is now accurate.

## Q2 — per-ledger reading of Option 1

`resolveDebtCasesFormAction` (`debt-utils.ts:166-173`) filters the caller's accounts by `direction ===
direction` and returns the account, else `create-account`. Read by title (`debt-cases-panel.tsx:179`),
description (`:178`), button (`:266`) and submit branch (`:235`), so copy and action cannot disagree by
construction. Scoped to the chosen ledger is the only coherent reading of Option 1: a party holds one
PAYABLE and one RECEIVABLE ledger, so a direction-agnostic check would post a PAYABLE payment into a
RECEIVABLE account. Evidence that the residual "silent second account" is dead:

- `debts-mvp-web.test.tsx` "opens the chosen ledger's account when only the other ledger exists" — asserts
  `direction: "RECEIVABLE"`, `openingBalanceDzd: 500`, **and no entry posted**;
- "labels a ledger with no account as an account creation, not a payment" — the copy flips with the action;
- `debt-utils.test.ts` — no account → create; different-direction account does not satisfy the chosen
  ledger; both ledgers present → the matching one wins;
- E2E `debt-entry.spec.ts:61-70` now drives the *payment* path through this panel (500 on the just-created
  PAYABLE account → 4,500, and the later 2,000 ledger payment → 2,500), which the design doc required.

C1 stays dismissed. Confirmed.

## Q3 — anything else fix-now?

No. The items the prior debates left open are all either closed or correctly deferred:

- **C4 `find` on a duplicate direction** — the assumption is now documented at `debt-utils.ts:170-171` *and*
  pinned by `debt-utils.test.ts` "picks the first account for a direction (the server keeps one per
  ledger)". With one account per (party, direction) enforced by the create path there is no choice to make;
  a legacy duplicate row would post to the first sorted account. Documented + tested assumption, low
  probability: **note, not fix-now**.
- **C5a test name** — fixed in `1f239abd`. Closed.
- **C3 no balance cap** — deliberate (design doc "Risks"); the replaced path (`createDebtAccount` reusing a
  same-direction account) was equally uncapped. Out of scope, already dismissed. The comment now names the
  property explicitly, so a reviewer can see it on purpose.
- **C6 default direction `owed-by-us`/PAYABLE** (`debt-cases-panel.tsx:60`) — a single-ledger RECEIVABLE
  party opens in create-account mode. Honest label, but the operator can open an unwanted PAYABLE ledger
  without noticing. Preselecting the party's existing ledger is a UX nicety, out of #459's scope: **defer**.
- **New in 1f239abd** — the exact `entryDate` assertion
  (`toAlgeriaDayBoundaryIso(getAlgeriaDateInputValue(), "start")`) removes the prior `expect.any(String)`
  looseness and confirms the panel posts a start-of-day movement, matching the E2E comment that the payment
  is not backdated. Improvement, no issue.
- **`recordPaymentDescription`** ("سيُسجَّل المبلغ كدفعة على الحساب الحالي؛ لا يُنشأ حساب جديد") promises a
  payment on the current account and no new account — both true on the credited path; it does not promise a
  decrease. Not misleading. **Note only.**

## Verdict

**No blockers.** The fix does what #459 asked for: one resolver drives title, description, button and
submit, a payment on the chosen ledger's existing account posts a `PAYMENT`, and an empty ledger is labelled
as an account creation. **C2 is closed** — the comment was rewritten in `1f239abd` to stop citing the
capped `recordDebtPayment` and to state the uncapped signed-movement effect, and that statement is verified
true against `debt-ledger-panel.tsx:118` and `finance.service.ts:391/447/453`. The per-ledger per-direction
reading of **Option 1 is correct** and pinned by unit, component and E2E tests. Nothing else is fix-now.

| Finding | Sev | In scope | Verdict |
|---|---|---|---|
| C2 comment cites capped server law as precedent | 4 | yes | **Closed** — `1f239abd` rewrote it; no server precedent; verified accurate |
| C1 per-ledger "silent" second account | 3 | yes | **Dismissed** — copy flips with action; tests pin it |
| C4 `find` first-account assumption | 3 | yes | **Closed as documented+tested** — comment + dedicated test |
| C5a credited test name overstated | 2 | yes | **Fixed** in `1f239abd` |
| C6 default toggle vs single-ledger party | 2 | no | **Defer** (UX) |
| C3 no balance cap on the panel path | 3 | no | **Dismissed** — deliberate, replaces an uncapped path |
| credited copy does not promise a decrease | 1 | yes | **Note** — not misleading |
| comment keeps both "reduces" and "deepen a credit" clauses | 1 | yes | **Note** — stylistic tension, no commit warranted |

**Residual risk:** the credited-ledger payment is the one path where this form moves a balance in a
direction the sibling allocation dialog would not (`record-payment-dialog.tsx:54` moves toward zero). It is
now described in the comment instead of hidden, is a representable domain state (`creditWithUs`), and is
reversible by voiding the entry — a quality/consistency gap, not data loss.
