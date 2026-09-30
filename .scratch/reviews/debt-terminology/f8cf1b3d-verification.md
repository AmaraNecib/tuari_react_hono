# Debt terminology — verification review of the pushed head

- lane: fix-debt-terminology
- base SHA: `5d0629be768a75689c081249843af4a79d045230` (real `git merge-base origin/develop HEAD`)
- reviewed HEAD: `f8cf1b3dc0d24eb5c75732119d868e51b9dec0a0`
- tier: Standard (UI + API + shared contracts + i18n); the three-stream review
  below is the verification pass for the fixes made after the pre-fix review.
- earlier evidence: `24142f7c-*` (pre-fix review), `fb4cfd09-review-resolution.md`,
  `27d72d47-code-review.md`, `a78f9eb5-resolution.md`. Those SHAs are the
  rebased equivalents of the pre-rebase SHAs they were originally recorded
  against; each carries a one-line rename note.

## Scope

Adversarial verification of the five review findings on the pushed head, the
E2E assertions, the create-page direction fix, the design-pass claims, and a
hunt for anything the review missed. One new behaviour finding (cases-panel
direction) was fixed here; one product question was escalated.

## The five verification points

| # | Point | Verdict |
| --- | --- | --- |
| 1 | Each review finding is fixed and its test fails on pre-fix source | HELD |
| 2 | E2E asserts direction phrase + positive amount + minus absent; no signed-balance assertion left | HELD |
| 3 | create-page sends a direction + positive opening for both toggles; both tests fail pre-fix | HELD |
| 4 | Design-pass claims (delete `getDebtBalanceMeta`, 4 movement sites, extract `getConsolidationRemainder`, remove `amountLabel`) | HELD; follow-up 6 was unfiled and evidence SHAs were stale (both now handled) |
| 5 | Nothing else renders a balance without a phrase or lets the sign decide it | one Medium fix (cases panel) + low notes |

## Pre-fix counter-proofs

Reverted the exact fix hunk, kept the current test, ran it.

| Fix | Test | Pre-fix failure |
| --- | --- | --- |
| `fb4cfd09` consolidation remainder | `debt-utils.test.ts` "phrases a payable remainder as owed by us, never owed to us"; `debts-mvp-web.test.tsx` "phrases the remaining payable balance as owed by us, not owed to us" | preview showed the sign-only `مستحق لنا` |
| `fb4cfd09` account header | `debts-mvp-web.test.tsx` "states the overpayment phrase for an overpaid payable account header" | header had no state phrase |
| `fb4cfd09` opening delta | `debts-mvp-web.test.tsx` "keeps opening-entry movement deltas signed" | delta rendered `5,000` not `-5000` |
| `fb4cfd09` gross totals | `report-builder.test.tsx` "does not stamp a direction phrase on the gross outstanding/overdue totals" | two `مستحق لنا` cards rendered |
| `fb4cfd09` sub-dinar | `debt-utils.test.ts` "keeps a nonzero sub-dinar balance from rounding to a bare zero" | `formatDebtAmount(0.4)` was `"0"` |
| `ea1e103d` void delta | `debts-mvp-web.test.tsx` "keeps a voided payment movement delta signed" | amount rendered `300` not `-300` |
| `a78f9eb5` create-page direction | `date-picker-screens.test.tsx` both "DebtCreatePage sends the chosen direction..." tests | `direction` was `undefined`, owed-by-us sent `-500` |
| `f8cf1b3d` cases-panel direction | `debts-mvp-web.test.tsx` both "DebtCasesPanel sends the chosen direction..." tests | `direction` was `undefined`, owed-to-us sent `-500` |

Run: the three pre-fix files gave `7 failed | 33 passed`; the create-page
`-t sends` run gave `2 failed`; the cases-panel run gave `2 failed`.

## Findings

| # | Sev | Finding | Verdict |
| --- | --- | --- | --- |
| F1 | Medium | `debt-cases-panel.tsx` opening form submitted a signed `openingBalanceDzd` with no direction, so the PAYABLE default let the sign decide the phrase (a negative input read `رصيد مستحق لنا`). | **FIXED here** (`f8cf1b3d`): direction toggle + `debtDirectionFromAlias`, always-positive amount, negative placeholder dropped, both-toggles test that fails pre-fix. |
| F1b | — | The same form always calls `createDebtAccountMutation` even when its button/i18n say it should post a payment to an existing account. | **Deferred to the parent**, filed with the debt-writers lane; not touched here. |
| F2 | Low | `dashboard-overview.tsx` (the dashboard half of the gross-phrase finding) is dead code (never imported), so its phrase removal has no user-visible effect and no test; `report-builder.tsx` is the live, tested equivalent. | Report only; parent is filing. |
| F3 | Low | Review evidence named pre-rebase SHAs (`2be128f0`/`b9bbe578`/`6159fbdc`/`d6f677d4`/`e622080b`) that exist only in the local reflog, and recorded base `fdb5dda6`. | **FIXED here** (`f8cf1b3d`): renamed to `24142f7c`/`27d72d47`/`fb4cfd09`/`ea1e103d`/`a78f9eb5`/`d4bd3349` with a rename note, base corrected to `5d0629be`. |
| F4 | Low | Design-pass follow-up 6 (optional `accountDirection` on the two dialogs) was not filed. | Report only; parent is filing. |
| — | — | `inventory.service.ts` writes `openingBalanceDzd: -grossTotalDzd` with no direction. | Out of scope; owned by the debt-writers lane commit `f39559c1`. |

## Commands (final code HEAD `f8cf1b3d`)

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @tuari/web test -- --maxWorkers=2` | 0 | 95 files, 851 passed |
| `pnpm --filter @tuari/contracts exec vitest run src/debt-helpers.test.ts --coverage` | 0 | 25 passed, 100% stmts/branch/funcs/lines |
| `pnpm --filter @tuari/contracts exec vitest run` | 0 | 5 files, 219 passed |
| `pnpm typecheck` | 0 | 4/4 tasks |
| `pnpm lint` | 0 | turbo 2/2 + all checks; `check:unslop` PASS |
| `pnpm check:unslop` | 0 | 1671 warn / 0 error |
| `API_PORT=4318 WEB_PORT=3000 pnpm exec playwright test tests/e2e/debt-entry.spec.ts tests/e2e/i18n-raw-keys.spec.ts --workers=1` | 0 | 5 passed (2 debt-entry + 3 i18n-raw-keys) |

## Could not verify

- Hosted CI and the hosted Greptile review are the parent's push step; this
  lane ran local checks only.
- The full `@tuari/api` suite was not re-run; no API source changed here.
