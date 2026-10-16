# Design pass (final) — #459 debt cases form posts a payment

- reviewed HEAD SHA: `1f239abd901a4da6d5b7dc92a69b4a54693e3a20`
- branch: `fix/459-debt-cases-payment`
- prior passes: `86c479d7`, `f001d145` (`.scratch/reviews/459/*-design-pass.md`)
- instructed range: `fdb5dda6...1f239abd` = **22 commits / 331 files** (all of develop→HEAD, PRs #420…#476).
  The lane's own work is **4 commits**: `86c479d7` (fix), `d038be49` (tests), `f001d145` (doc/test),
  `1f239abd` (tests/doc). This pass re-checks the lane's 4 commits against the current tree; the other 18
  commits already carry their own `.scratch/reviews/<issue>/` directories. Same scope caveat as both
  earlier passes — if the intent is the full 22-commit range, this file under-covers it.
- skills applied: `domain-modeling` (glossary/copy vs. code), `codebase-design` (deletion test, depth/seam),
  `improve-codebase-architecture` (friction)
- reviewer: design-pass gate (read-only; no source modified)

## Verdict

**No blockers.** The in-scope fixes F1 and F3 are both complete at `1f239abd`. The only commit after the
previous pass (`1f239abd`) changes **comments, tests and one doc** — no production behaviour. No new module,
no new seam, nothing regressed. F2/F4/F5/F6 remain the follow-ups already agreed; hand those to the parent.

## What changed since `f001d145` (the only new commit)

`1f239abd` — 4 files, +26/−11:

| File | Nature |
| --- | --- |
| `apps/web/src/features/debts/debt-cases-panel.tsx` | **comment only** (~:233-241) |
| `apps/web/src/features/debts/debt-utils.test.ts` | +1 resolver test (~:262-269) |
| `apps/web/src/features/debts/debts-mvp-web.test.tsx` | 1 asserted line tightened + test rename |
| `.scratch/implementation/459-design.md` | defect description sharpened |

The `debt-cases-panel.tsx` hunk is inside the comment block above the `createDebtEntryMutation.mutateAsync`
call — the call itself (`entryType: "PAYMENT"`, `signedAmountDzd: -Math.abs(amountValue)`, `entryDate`,
`note`) is byte-identical to `f001d145`. Nothing else in the submit handler moved.

## F1 — LANDED (unchanged, re-confirmed)

`debt-cases-panel.tsx` state is `amount`/`setAmount` (:221), derived `amountValue`, create-only guard
`hasValidCreateAmount` beside `hasValidPaymentAmount`. `openingBalance*` survives only as the payload of the
**create** branch (`openingBalanceDzd`, `openingEntryDate`, `openingEntryNote`, ~:245-250). "Opening" now
appears only on the branch that opens a ledger. No further drift.

## F3 — NOW FULLY LANDED (test added)

The comment landed at `f001d145` (`debt-utils.ts:170-172`: *"The server's create path keeps at most one
account per (party, direction), so a direction has one account and `find` is not a choice between two."*)
and `1f239abd` adds the test the prior pass asked for:

> `debt-utils.test.ts` — *"picks the first account for a direction (the server keeps one per ledger)"* —
> two PAYABLE accounts in, expects `{ kind: "record-payment", account: first }`.

So the duplicate-direction behaviour is now executable, not just asserted in prose. Residual (not a
blocker): the test pins the **client's** `find` order; the **server** invariant it names was not
re-verified executably in this pass — the only server-side evidence is the reuse branch in
`apps/api/src/modules/company/finance.service.ts:296-320` (`existingAccount` → `ADJUSTMENT` on the existing
account) seen via grep, not read in full here. If a second same-direction account ever exists, the panel
title still says "*the* account". Follow-up value is now low but non-zero.

## F2 / F4 / F5 / F6 — unchanged, all still follow-ups

- **F2** `getDebtEntryTypeLabel` (`debt-utils.ts`, ~:240-254) still has no `ADVANCE` arm and falls through to
  `return entryType`. Pre-existing; no live web caller passes `ADVANCE` in this tree. Defer (agreed).
- **F4** `record-payment-dialog.tsx` and `debt-ledger-panel.tsx` still call `useCreateDebtEntryMutation`
  **without** `entryType` → default `ADJUSTMENT` (`workspace-mutations.ts:711,718`), while the cases panel
  now posts `PAYMENT`. A payment recorded from the ledger dialog still renders as "تعديل". Defer (agreed) —
  user-visible + e2e-reachable, needs its own issue with the "payment ⟹ PAYMENT" invariant.
- **F5** two sign laws still coexist (cases panel `-Math.abs(amountValue)` vs
  `record-payment-dialog.tsx` `balance > 0 ? -amount : +amount`). Wants one shared helper
  (`signedPaymentDzd(amount, account)`). Defer.
- **F6** `workspace-mutations.ts:711` hand-copies `"OPENING" | "PAYMENT" | "ADJUSTMENT" | "ADVANCE"`.
  Bundle with F2.

## New since the prior pass

### Correct — the comment now names the right server law

`f001d145`'s comment said the panel's `-|amount|` *"matches the server's `recordDebtPayment` law"*. That was
the wrong function: the panel calls **`debtEntriesCreate`** (`finance.service.ts:367`), not
`debtEntriesRecordPayment` (:425). `1f239abd` replaces it with *"This posts a signed movement (like the ledger
form), not a capped allocation, so it can deepen an existing credit."* — which matches `createDebtEntry`'s
behaviour (the posted sign is kept; `company.service.test.ts:622-627` pins a `-200` PAYMENT driving a `0`
balance to `-200`). The comment is now both accurate and pointing at the code path actually used.
This also retires the low-confidence note in the `f001d145` pass about the test pinning a server-owned sign.

### Note (low severity, flakiness) — the tightened `entryDate` assertion computes "today" twice

`debts-mvp-web.test.tsx:311` replaced `entryDate: expect.any(String)` with
`toAlgeriaDayBoundaryIso(getAlgeriaDateInputValue(), "start")`. The panel independently initialises its own
`createDate` from `getAlgeriaDateInputValue()`. The two computations agree except across an Algeria-midnight
rollover between render and assertion — a sub-second window. Real pin, tiny flake surface; not worth a change
now, worth knowing if that test ever fails only in CI.

### Note (doc accuracy, unverified sign) — `459-design.md`

The doc now claims the post-#458 create path *"reuses an account on the same direction (posting a positive
ADJUSTMENT)"*. The reuse branch is real (`finance.service.ts:296-320`), but I did **not** read the sign of
that movement (grep-level evidence only), so "positive" is unverified. Doc-only; no behaviour depends on it.

### Note (worktree hygiene, outside the diff) — untracked `apps/api/backups/`

`git status --porcelain` shows two untracked entries: `.scratch/reviews/459/` (this review directory —
expected, keep untracked) and **`apps/api/backups/`** (not in the range's diff; likely a runtime artifact of
the #439/#436 backup-folder feature or its tests). Parent/owner decision: add it to `.gitignore` if it is
runtime output, or delete it. Not part of this lane's change.

## Deletion test — `resolveDebtCasesFormAction` (`debt-utils.ts:166-176`)

**Still earns its keep.** Delete it and the direction-match rule plus the label⇄action coupling reappear in
four places in `debt-cases-panel.tsx` (title, description, button label, submit branch) — the exact shape of
the original defect. Now crossed by 5 resolver tests + 5 web tests. Returning the whole `DebtAccount` is
wider than the caller needs (it reads `.id`), but the discriminated union is what forces the submit branch to
be exhausted. Leave as-is.

## Friction (improve-codebase-architecture) — unchanged, no new items

- The prior pass's "reads the resolver twice" friction is still resolved (one `accountAction` call, ~:75).
- `debt-cases-panel.tsx` remains a single ~290-line component trending toward the shape #468 extracted the
  salaries tables out of. Not required by this diff; the same shape now lives in `salaries-section.tsx` if
  anyone wants a precedent.

## Nothing-fixed declaration

No files were changed by this pass (read-only review). Commands run were read-only (`git log`, `git show`,
`git diff --stat`, `git status`, `git merge-base`, `git rev-parse`, `grep`, `sed`). Tests were **not** run —
this is the design gate, not the test gate; the new assertions in `1f239abd` are reported as read, not as
executed.

## Hand-off to the parent

| Item | Status |
| --- | --- |
| F1 rename amount state | done (`f001d145`) |
| F3 document + pin one-account-per-(party, direction) | **done (`1f239abd`)** |
| Deletion test on resolver | passes; resolver read once |
| F2 `ADVANCE` label arm | follow-up (pre-existing, no live caller) |
| F4 payment vs `ADJUSTMENT` across the other two writers | follow-up (user-visible, e2e) — the one that bites |
| F5 one shared sign-law helper | follow-up |
| F6 derive `entryType` from the contract | follow-up (bundle with F2) |
| Untracked `apps/api/backups/` | owner call: `.gitignore` or delete |
