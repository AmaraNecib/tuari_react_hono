# #459 — Debt cases panel: the account form posts a payment but creates a new account

- mode: remote
- ticket: #459 (GitHub)
- target ref: `origin/develop` (local `develop` = `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`)
- resolved base SHA: `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`
- branch/worktree: `fix/459-debt-cases-payment` @ `worktrees/fix-debt-cases-payment`
- review tier: **Standard** (user-visible behaviour change)

## The defect

`debt-cases-panel.tsx` renders an amount form that says **record a payment on the
account** whenever an account exists, and **record a debt** when none does. Its
submit handler *always* calls `useCreateDebtAccountMutation`, whatever the label
says. The direction half was fixed in #458 (the form now sends
`debtDirectionFromAlias(direction)` with `Math.abs`), so the remaining defect is
the action itself: the label promises a payment and the code opens an account.

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
  `hasValidAmount` requires a positive magnitude (a payment of 0 is not an
  action).
- No account on the chosen ledger → `debtAccountsCreate` with a positive
  `openingBalanceDzd` and the derived direction, exactly as today.

## Tests

- `debt-utils.test.ts`: the resolver — matching direction → record-payment on
  that account; no match → create-account; a different-direction account does
  not satisfy the selected ledger.
- `debts-mvp-web.test.tsx`: (1) existing account → submit posts a `PAYMENT`
  entry to that account and **does not** call create-account; (2) no account →
  submit calls create-account and does not post an entry; (3) the button label
  and the panel title track the resolved action.
- Existing `manages a unified external counterparty debt account` case is
  updated: it asserted the buggy create-on-existing behaviour.
- E2E `tests/e2e/debt-entry.spec.ts` covers the create path through this panel;
  run it to confirm the create flow still lands.

## Risks / migration

- No schema or wire change. `debtEntriesCreate` already accepts `PAYMENT`.
- An existing-account submission changes from "create/update account" to "post a
  payment entry"; that is the point of the issue.
- Overpaying past the balance is allowed (the domain has credit states), matching
  the ledger panel; the cases form is not the allocation dialog
  (`recordDebtPayment`) which caps at the balance.
