# Code review — #459 debt cases panel (final gate, HEAD `1f239abd`)

- Repo/worktree: `D:/projects/tuari_react_hono/worktrees/fix-debt-cases-payment`
- Branch: `fix/459-debt-cases-payment`
- Requested range: `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36...1f239abd901a4da6d5b7dc92a69b4a54693e3a20`
- Axes: **Standards** and **Spec** (fresh context), single reviewer
- Spec sources: `gh issue view 459` (Option 1 = post a payment on the existing
  account), parent's Option 1 decision, `.scratch/implementation/459-design.md`
- Standards sources: `.agents/skills/code-review/SKILL.md` (Fowler smell
  baseline), `.agents/wisdom/architecture.md`, `AGENTS.md`, repo conventions
  read from the surrounding code

## Range note (important for reading the raw diff)

`fdb5dda` is an **ancestor** of HEAD (`git merge-base` = `fdb5dda` itself), so the
requested range also contains other lanes' already-merged work (#429, #474, #472,
#470, #467, #468 …) — 331 files, 30 106 insertions. The #459 lane itself is the
**4 commits on top of the branch point `d6164c65`**:

```
86c479d7 fix(debts): the cases form posts a payment on the account that exists (#459)
d038be49 test(debts): prove the cases form posts a payment and opens only a missing ledger (#459)
f001d145 docs(debts): a payment reduces even a credited ledger, matching the server law (#459)
1f239abd test(debts): pin the payment entryDate and the credited-ledger move (#459)
```

Its effective change set is 9 files:

```
.scratch/implementation/459-design.md              |  91 +
apps/web/src/features/__test-utils__/workspace-fixtures.tsx |   4 +-
apps/web/src/features/app-shell/workspace-mutations.ts      |   4 +-
apps/web/src/features/debts/debt-cases-panel.tsx    |  69 +-
apps/web/src/features/debts/debt-utils.test.ts      |  41 +
apps/web/src/features/debts/debt-utils.ts           |  20 +
apps/web/src/features/debts/debts-mvp-web.test.tsx  | 149 +-
apps/web/src/i18n/resources/ar.ts                   |   7 +-
tests/e2e/debt-entry.spec.ts                        |  28 +-
```

This review covers that #459 set in depth (the rest of the range was reviewed by
its own lanes/PRs, not by this gate). Prior rounds: `86c479d7`, `f001d145` — no
blockers.

## Verification performed (evidence, not assumption)

| Check | Command / file | Result |
| --- | --- | --- |
| Web tests for the touched units | `npx vitest run src/features/debts/debt-utils.test.ts src/features/debts/debts-mvp-web.test.tsx` in `apps/web` | **57 passed (2 files)**, 39.4s |
| Server accepts the posted movement | `apps/api/src/modules/company/finance.service.ts:388` `normalizeSignedMoneyAmount(input.signedAmountDzd)` | negative signed amount accepted on the generic entries-create path; no cap |
| RPC seam | `apps/api/src/rpc/handlers/finance.ts:54` → `financeService.createDebtEntry(input)` | `entryType` passes through from the client hook |
| Old i18n key removed everywhere | `grep -rn accountDescription` | only `settings-section.tsx`'s unrelated `accountDescription` prop remains; no stale `debts.cases.accountDescription`; `ls apps/web/src/i18n/resources` = `ar.ts` only, so no locale left behind |
| All five design-doc test bullets exist | `debts-mvp-web.test.tsx:264-390`, `debt-utils.test.ts:241-276` | 1 payment posts PAYMENT / never creates; 2 disabled on empty+0, enabled on 500; 3 typed `-1200` → `-1200`; 4 labels track the resolved action both ways; 5 other-ledger-only opens RECEIVABLE and posts no entry |

## Standards axis

**Correct (with evidence)**

- `apps/web/src/features/debts/debt-utils.ts:156-174` — one resolver
  (`resolveDebtCasesFormAction`) returning a discriminated union
  (`{kind:"record-payment";account}` | `{kind:"create-account"}`). This is the
  documented "#459 single source" and it genuinely is: the title, the
  description, the button label and the submit branch all read it
  (`debt-cases-panel.tsx:74,178-179,248`). No Repeated Switches / no duplicated
  condition — the four sites share one predicate, which is exactly what the bug
  was about.
- `debt-utils.ts:169-173` — `find` by direction with a comment explaining why
  `find` is not a choice between two accounts (server keeps one per
  party+direction). Clear, and the comment is verifiable in
  `finance.service.ts:296-302` (`getDebtAccountBy...AndDirection` + reuse).
- `debt-cases-panel.tsx:234-237` — the credited-ledger comment no longer claims
  the server curates a credited reduction; it now says what the code does
  ("posts a signed movement … can deepen an existing credit"), which matches the
  uncapped entries-create path. The `f001d145` wording that cited
  `recordDebtPayment`'s cap was correctly withdrawn by `1f239abd`.
- `workspace-mutations.ts:707-720` — `entryType` is optional and defaults to
  `"ADJUSTMENT"`, so every existing caller is untouched (verified: the diff
  changes nothing else in that function; `workspace-mutations.test.ts` in the
  lane updates only the fixtures).
- Submit gating reads `isPending` of *the* mutation that will actually run
  (`debt-cases-panel.tsx:78-80`) — no double-submit window on the payment path.
- E2E (`tests/e2e/debt-entry.spec.ts:61-78,109-124`) exercises the fixed path on
  the panel and its downstream numbers are recomputed consistently
  (5 000 opening → 500 payment → 4 500; the later 2 000 ledger payment → 2 500).
- `ar.ts:1407-1411` — copy split into `recordPaymentDescription` /
  `createAccountDescription` and `amount`/`note` made neutral ("المبلغ" /
  "ملاحظة"), matching the always-positive magnitude rule from #458.

**Notes — judgement calls only (no hard standard breached)**

- LOW — `debt-cases-panel.tsx:72` `const debtAccount = sortedAccounts[0] ?? null`
  survives while the form now uses the per-direction resolver. Two notions of
  "the" account coexist in one component; `debtAccount` still feeds only the
  stat card / `balance` memo (display), so this is not a bug, but the name invites
  exactly the drift #459 was about. Renaming it (e.g. `primaryAccount` /
  `statBalanceAccount`) would close the door. *Mysterious/ambiguous name.*
- LOW — the same four-string union `"OPENING" | "PAYMENT" | "ADJUSTMENT" |
  "ADVANCE"` is written inline again at `workspace-mutations.ts:710`
  (also at `finance.service.ts:86,144`). A shared alias would be cheaper, but the
  RPC input type already constrains callers and this diff adds exactly one
  occurrence. *Duplicated shape, minor.*
- LOW — `debt-cases-panel.tsx:74-80` computes both `hasValidCreateAmount`
  (`Number.isFinite`, allows 0) and `hasValidPaymentAmount`
  (`!== 0`). The asymmetry is intentional and tested (opening 0 is legal, a zero
  payment is not), but nothing in the names says so; one comment sentence would
  carry it.

## Spec axis (issue #459 + parent's Option 1)

**Correct (with evidence)**

- The defect as stated in the issue ("its own button label and i18n description
  say the operator is recording a payment … silently creates a second account")
  is closed: `debt-cases-panel.tsx:229-260` branches to
  `useCreateDebtEntryMutation` with `entryType: "PAYMENT"` and
  `signedAmountDzd: -Math.abs(amountValue)` when the chosen ledger has an
  account, and only calls `useCreateDebtAccountMutation` when it does not.
- Issue bullets all satisfied:
  - "make the label, the description and the action agree" → all three derive
    from `accountAction` (`debt-cases-panel.tsx:74,178-179,248`), and the web
    test asserts label *and* description *and* the call in one case
    (`debts-mvp-web.test.tsx:289-312`).
  - "the direction must come from the same seam the create page uses
    (`debtDirectionFromAlias`), with an always-positive amount" →
    `debt-cases-panel.tsx:69` + `Math.abs(amountValue)` on both branches
    (`:242`, `:250`), with the typed-minus test at `debts-mvp-web.test.tsx:325`.
  - "tests for both directions, and for the 'account already exists' path
    specifically" → `debts-mvp-web.test.tsx:223-257` (both directions on create)
    and `:264-390` (existing-account path, both directions).
  - "verify against the E2E path that creates debts through this panel" →
    `tests/e2e/debt-entry.spec.ts` now posts a 500 payment from the same form and
    asserts 4 500, then 2 500.
- Issue's "Dependency" (server-side direction derivation/sign fixes land first)
  holds: the branch point `d6164c65` is after the #458/#464 writer work, and the
  server law is visible in `finance.service.ts:113-115,453`.
- Design-doc behaviour section matches the code line for line; the corrected
  "defect" paragraph now states that #458's **same-direction** create path
  already reused the account (posting a positive ADJUSTMENT) and that the
  residual defect had two faces — different direction opens a second ledger, and
  the same-direction store was an ADJUSTMENT not a PAYMENT. Both are verifiable
  in `finance.service.ts:304-330`.
- No scope creep: the only interface change is the optional `entryType`; no new
  i18n key beyond the two that replace one; no contract/schema change.

**Note — LOW**

- `debts-mvp-web.test.tsx:343` names the case *"posts a reducing movement even on
  a credited ledger"* while `debt-cases-panel.tsx:234-237` says the movement
  *"can deepen an existing credit"*. Both are literal about a negative delta, but
  they read as opposites on a ledger whose balance is already `-700`
  (`currentBalance: -700` → `-200` → `-900`). The assertion is right; the test
  name would say it better as *"deepens the credit instead of refunding it"*.
  Naming only — not a behaviour finding.
- Overpaying past the balance through this form is allowed (no cap), which the
  design doc calls out deliberately and justifies against the ledger panel; the
  capped alternative is `recordDebtPayment`. Acceptable, but it means the cases
  panel and the ledger panel can both deepen a credit while
  `recordDebtPayment` rejects it (`finance.service.ts:453` region). Documented
  and consistent, so not raised as a finding.

## Findings

- **Blocker:** none.
- **HIGH:** none.
- **MEDIUM:** none.
- **LOW:** three naming/readability items above
  (`debt-cases-panel.tsx:72`; `workspace-mutations.ts:710`;
  `debts-mvp-web.test.tsx:343`). All optional; none block merge.

## Residual risks

1. **Uncapped payment on a credited ledger** — intended and documented, but the
   cases form and `recordDebtPayment` disagree on capping; a future reader must
   keep the two straight (the corrected comment now helps).
2. **Range noise** — anyone re-running `git diff fdb5dda...HEAD` will see 331
   files; the #459 set is only the 9 files listed above.
3. **E2E not executed in this gate** — `tests/e2e/debt-entry.spec.ts` was read
   and its arithmetic checked, not run (Playwright/browser not started here).
   Unit coverage of the same paths passed.
4. Nothing actionable remains inside the #459 change set: the resolver seam,
   the copy, the sign, the disabled-state and the E2E expectations now agree.

## Commands run

```
git merge-base fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36 1f239abd            # = fdb5dda (ancestor)
git diff --stat d6164c65...1f239abd                                          # 9 files, the #459 set
git diff d6164c65...1f239abd -- <source>                                      # reviewed
git show f001d145 / git show 1f239abd                                         # the two follow-up commits
gh issue view 459
grep -rn "accountDescription|recordPaymentDescription|createAccountDescription"
ls apps/web/src/i18n/resources
cd apps/web && npx vitest run src/features/debts/debt-utils.test.ts \
  src/features/debts/debts-mvp-web.test.tsx --reporter=dot                    # 57 passed
```
