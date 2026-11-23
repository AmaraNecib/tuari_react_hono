# #459 — Debt cases panel: the account form posts a payment but creates a new account

- mode: remote
- ticket: #459 (GitHub)
- target ref: `origin/develop` (local `develop` = `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`)
- resolved base SHA: `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`
- branch/worktree: `fix/459-debt-cases-payment` @ `worktrees/fix-debt-cases-payment`
- review tier: **Standard** (user-visible behaviour change)

## The defect

`debt-cases-panel.tsx` renders an amount form whose copy says **record a payment
on the account** whenever an account exists, and **record a debt** when none
does. Its submit handler *always* calls `useCreateDebtAccountMutation`, whatever
the label says.

The direction half was fixed in #458 (the form sends `debtDirectionFromAlias(direction)`
with `Math.abs`). After #458 the account-create service already reuses an account
on the **same** direction (posting a positive ADJUSTMENT), so the residual defect
had two faces: with a **different** direction selected the form opened a second
ledger while the label still said *record payment*, and even on the matching
ledger the stored entry was an ADJUSTMENT, not the PAYMENT the label and
description promise. The mismatch between the copy and the action is the defect.

## Decision (owner default, Option 1)

When an account already exists **on the chosen ledger**, post a payment entry to
it; only open an account when the chosen ledger has none.

- The selected alias → domain direction stays on `debtDirectionFromAlias`.
- The debt ledgers are per-direction (`PAYABLE` = we owe, `RECEIVABLE` = they owe
  us), and a party can hold one of each (that is the consolidation path). "An
  account already exists" is therefore read as *on the selected ledger*: the
  direction toggle picks which ledger this movement belongs to.
- When the selected ledger has no account, the label flips to **record a debt**
  and opening the account is the honest action. The old "silent second account"
  was silent because the label still said *record payment*; it no longer does.

## Public interfaces / changed contracts

- `debt-utils.ts`: new `resolveDebtCasesFormAction(accounts, direction)` returning
  `{ kind: "record-payment", account }` or `{ kind: "create-account" }`. Single
  source for the title, the description, the button label and the submit branch,
  so they cannot disagree.
- `workspace-mutations.ts`: `useCreateDebtEntryMutation` gains an optional
  `entryType` (`OPENING | PAYMENT | ADJUSTMENT | ADVANCE`, default `ADJUSTMENT`)
  so the cases panel can post a `PAYMENT`. Existing callers are unchanged.
- i18n `debts.cases`: `accountDescription` splits into
  `recordPaymentDescription` / `createAccountDescription`; `amount` becomes the
  neutral "المبلغ" and `note` the neutral "ملاحظة" (the amount is a magnitude,
  never signed).

## Behaviour

- Existing account on the chosen ledger → `debtEntriesCreate` with
  `entryType: "PAYMENT"`, `signedAmountDzd: -|amount|` (a payment reduces the
  balance on either ledger), the picked day as `entryDate`, and the note.
  The submit stays disabled until the typed magnitude is finite and non-zero;
  a typed minus is normalized with `Math.abs`, never read as a sign.
- No account on the chosen ledger → `debtAccountsCreate` with a positive
  `openingBalanceDzd` and the derived direction, exactly as today.

## Tests

- `debt-utils.test.ts`: the resolver — matching direction → record-payment on
  that account; no match → create-account; a different-direction account does
  not satisfy the selected ledger.
- `debts-mvp-web.test.tsx`: a `DebtCasesPanel` describe covering (1) existing
  account → submit posts a `PAYMENT` entry (account id, `entryType`, `-|amount|`,
  `entryDate`, note) and **does not** call create-account; (2) the submit stays
  disabled on empty/zero and enables on a non-zero magnitude; (3) a typed minus
  is a magnitude; (4) the label and the panel title track the resolved action;
  (5) a ledger with no account but a different-direction account still opens the
  chosen ledger's account and posts no entry. The existing `manages a unified
  external counterparty debt account` case is updated — it asserted the buggy
  create-on-existing behaviour.
- Existing `DebtCasesPanel sends the chosen direction with a positive opening`
  cases now also assert no entry is posted on the create path; the create flow
  labels stay `تسجيل دين`.
- E2E `tests/e2e/debt-entry.spec.ts` exercises the fixed path: after the panel
  opens the account it posts a 500 payment on it from the same form, asserts the
  balance drops to 4,500, and the second test's ledger payment then reads 2,500.

## Risks / migration

- No schema or wire change. `debtEntriesCreate` already accepts `PAYMENT`.
- An existing-account submission changes from "create/update account" to "post a
  payment entry"; that is the point of the issue.
- Overpaying past the balance is allowed (the domain has credit states), matching
  the ledger panel; the cases form is not the allocation dialog
  (`recordDebtPayment`) which caps at the balance.

## Round 2 — review findings (Greptile on #481)

Three findings against `2c852a1f`, all fixed on `fix/459-debt-cases-payment`:

1. **Submit unlocked mid-save.** Creating an account refreshes the accounts
   while the create mutation is still pending; the form flips to
   `record-payment`, and the button only watched the (idle) entry mutation, so a
   second click posted the opening amount as a negative `PAYMENT` and cancelled
   the debt. The submit now stays disabled while **either** mutation is pending,
   and the amount is only cleared after the save resolves. Pinned by a test that
   rerenders the panel with the account present but the create mutation pending
   and asserts a second click posts nothing; the test fails on the pre-fix code.
2. **A blocked save had no reason.** The payment path blocks empty/zero amounts
   with a disabled button and no explanation. A localized Arabic hint now sits
   beside the submit in a `role="status"` line (the invoice `saveDisabledReason`
   pattern), naming a non-zero payment amount required, or a valid number for an
   invalid opening amount.
3. **`createAccountDescription` contradicted the page.** It said the party had
   no account, but the form also shows creation when a `PAYABLE` account exists
   and the operator picks a missing `RECEIVABLE` ledger. It now says the
   **selected ledger** has no account.

No contract or wire change. `resolveDebtCasesFormAction` remains the single
source of the action, label, description and submit branch.

### Gate follow-ups (local debate / test-audit / code-review)

- The amount rule is now one expression: a non-finite amount is `amountInvalid`
  in both modes, and only a genuine zero on the payment path is
  `paymentAmountRequired`. Before this, typing `abc` on a payment reported a
  *zero payment*.
- A save in flight now says so (`debts.cases.saving`) instead of leaving the
  disabled button unexplained, closing the contradiction with the “say why”
  rule.
- New tests: the entry mutation pending blocks the submit (the half the
  create-pending test did not cover), a non-numeric payment names the numeric
  reason, a `RECEIVABLE` ledger posts a negative movement, and the create path’s
  empty amount opens an account with no opening entry (pinning the intentional
  optional amount). `vi.clearAllMocks()` in `afterEach` removes the mock-call
  order dependence.
- The payment/opening request construction is hoisted to one `entryDateIso` /
  `trimmedNote` / `signedPaymentAmount` so the two branches cannot drift.

Deferred (pre-existing, not introduced by this PR): the ledger panel posts an
`ADJUSTMENT` for a movement the cases form now records as a `PAYMENT`; the two
notions of “the account” (`sortedAccounts[0]` vs the resolved ledger) predate
this change; a rejected `mutateAsync` has no error surface; and the create path
can still re-fire if the accounts refresh lands after the mutation resolves.
