# #459 / PR #481 — design pass at `f1e00278`

- mode: remote
- ticket: #459 (GitHub); PR #481
- base SHA: `d6164c65` (merge-base of `origin/develop` and the branch)
- reviewed HEAD: `f1e00278`
- branch/worktree: `fix/459-debt-cases-payment` @ `worktrees/fix-debt-cases-payment`
- skills: `domain-modeling`, `codebase-design`, `improve-codebase-architecture`
- tier: Standard

## Domain modeling

- The four user-facing strings and the submit branch read one resolver,
  `resolveDebtCasesFormAction` (`debt-utils.ts:163`), consumed at
  `debt-cases-panel.tsx:74,200,201,259,291`. A label can no longer promise a
  payment while the code opens an account — the defect's root cause.
- `debts.cases.amount` is now the neutral "المبلغ" (`ar.ts:1413`); the sign is
  derived, never typed.
- The blocked-save reason is one rule feeding both the disabled state and the
  `role="status"` text (`debt-cases-panel.tsx:80-97,251`).

Remaining (pre-existing, out of this diff's scope):

- **Medium — `debt-ledger-panel.tsx:114-122` posts an `ADJUSTMENT`** for a
  movement the cases form now records as `PAYMENT`, while its own button says
  «تسجيل دفعة». Same human act, two recorded kinds.
- **Low — two notions of "the account"** (`debt-cases-panel.tsx:65,158` vs
  `:267`): the stat card uses `sortedAccounts[0]`, the submit uses the
  ledger-scoped account. When both directions exist the card shows the net, so
  the mismatch is narrow.

## Codebase design

- Deletion test on `resolveDebtCasesFormAction`: it concentrates the
  direction→account lookup that would otherwise reappear in four places; it earns
  its keep.
- `entryDateIso` / `trimmedNote` / `signedPaymentAmount` are hoisted
  (`debt-cases-panel.tsx:151-153`), so the payment and opening branches cannot
  drift on those values.
- `useCreateDebtEntryMutation`'s optional `entryType` is a real seam (two
  callers: ledger + cases).

Remaining:

- **Low — `entryType` is optional with an `ADJUSTMENT` default**
  (`workspace-mutations.ts:711,718`): the seam hides which movement a caller
  posts. Making it required is a cheap future hardening.
- **Low — `entryType`'s union is re-declared** rather than imported from
  `packages/contracts/src/debts.ts:223`; a contract change would drift silently.
- **Low — the validation block** (`debt-cases-panel.tsx:68-97`) is the part of
  this component that belongs in `debt-utils` next time it grows.

## Architecture friction

- The form derives its action from the `accounts` prop, which refreshes while the
  create mutation is still pending. Gating on both `isPending` flags is the
  correct fix for that race and is pinned by a test; the deeper fix (freeze the
  resolved action for the duration of a save) is accepted friction, recorded in
  the design doc.
- The submit request fragments (`:266-286`) and the derivation cluster (`:68-97`)
  are spread across render. A pure `resolveDebtCasesSubmit(accounts, direction,
  amount)` next to the resolver would fold them; deferred as a refactor, not a
  feature-PR task.

## Verdict

Merge gate **passes**: no blocker, no newly introduced duplication or hypothetical
seam. The remaining findings are pre-existing and out of this PR's diff; they are
deferred to a follow-up (parent decision requested in the lane handoff), not
silently dropped.
