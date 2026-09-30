# Debt terminology — review resolution

- lane: fix-debt-terminology
- branch: `fix/debt-terminology`
- base SHA: `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`
- reviewed HEAD: `2be128f042b30d5cde82488080cc7424d36842db`
- fix SHA: `6159fbdcf2b626046a331200c7a5969ab2cd39cd`
- fix commit: `fix(debts): phrase the consolidation remainder by direction, not sign`

## Findings and verdicts

| # | Severity | Finding | Verdict | Fails-pre-fix proof |
| --- | --- | --- | --- | --- |
| 1 | High | `consolidation-dialog.tsx` preview derived the remaining-balance phrase from the sign of a side magnitude: a positive payable remainder read `مستحق لنا` (owed to us) instead of `مستحق علينا`. | Fixed — `getDebtBalanceDisplay({ currentBalance, direction: payableAccount.direction })`; receivable branch mirrors it. | 2 new tests failed before the fix (ran with source stashed) |
| 2 | High | `consolidation-dialog.tsx` account headers showed direction label + absolute amount with no state phrase: an overpaid PAYABLE (`-50,000`) read "we owe 50,000". | Fixed — headers render `t(payableDisplay.phraseKey)` / `t(receivableDisplay.phraseKey)`. | New header test failed before the fix |
| 3 | Medium | `consolidation-dialog.tsx` opening-entry deltas used `formatDebtAmount` (absolute) though the design says movement deltas stay signed. | Fixed — `formatDebtMoney(entry.signedAmountDzd)`. | New signed-delta test failed before the fix |
| 4 | Medium | `dashboard-overview.tsx` + `report-builder.tsx` stamped `owedToUs` on `totalOutstandingDzd`/`overdueDzd`, which aggregate BOTH directions (gross exposure per `finance.service.ts`). No single direction phrase is true. | Fixed — removed the direction phrases; `totalSettledDzd` keeps `مسوّى`. | New report-builder test failed before the fix |
| 5 | Low | `formatDebtAmount` rounded `0.4` DZD to `"0"`, pairing a direction phrase with a zero amount. | Fixed — `maximumFractionDigits: 2`. | New sub-dinar test failed before the fix |
| 6 | Low | `getDebtBalanceMeta` used on movement sites (tone only). | Dismissed — design sanctions the sign-based movement tone; only `textClassName` is read. | n/a |
| 7 | Low | `record-entry-payment-dialog` phrases the max-payment limit. | Dismissed — the design explicitly makes max payment direction-aware. | n/a |
| 8 | Low | Hub stat cards show a direction label with `0` for an empty bucket. | Dismissed — a bucket total is not a single balance state; the row balances still render `مسوّى` for zero (tested). | n/a |
| 9 | Low | `debt-ledger-panel` "الحالة" card duplicates the balance phrase; `debt-cases-panel` shows direction + phrase adjacently. | Dismissed — cosmetic redundancy, no wrong direction. | n/a |
| 10 | Low | `getDebtDirectionLabel` hardcodes Arabic that `debts.terminology.directions.*` duplicates. | Dismissed — the util is the single source and `debt-utils.test.ts` pins the i18n copy to it; Arabic-only app. | n/a |
| 11 | Low | `search.payable`/`search.receivable` i18n keys unused after the global-search site moved to the state phrase. | Fixed — removed. | n/a (dead keys) |

## Out of scope — parent decision required

**`debt-create-page.tsx` never passes `direction` to `createDebtAccountMutation`.**
`useCreateDebtAccountMutation` defaults `direction: input.direction ?? "PAYABLE"`
(`workspace-mutations.ts:669`), while the page sends `openingBalanceDzd = +amount` for
"owed-to-us" and `-amount` for "owed-by-us" (`debt-create-page.tsx:163-176`). Result:

- "owed-to-us" creates a **PAYABLE** account with a positive balance → `مستحق علينا`
  (we owe them), the opposite of the chosen direction.
- "owed-by-us" creates a PAYABLE account with a negative balance → `رصيد مستحق لنا`.

The file is not in this PR's diff, so the mismatch is pre-existing; the PR's i18n rename
just makes the wrong label visible. Fixing it means passing
`direction: resolvedDirection === "owed-to-us" ? "RECEIVABLE" : "PAYABLE"` and always
sending a positive `openingBalanceDzd`, plus tests for both toggles — a behaviour change
outside the terminology brief. **Not fixed here; requesting the parent's decision** on
whether to fold it into this PR or open a follow-up issue.

## Commands (final HEAD, exit code)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | 0 — 4/4 tasks successful |
| `pnpm lint` | 0 — turbo 2/2 + all checks; `check:unslop` PASS (0 error) |
| `pnpm check:unslop` | 0 — PASS |
| `pnpm --filter @tuari/web test -- --maxWorkers=2` | 0 — 83 files, 740 passed |
| `pnpm --filter @tuari/contracts test -- src/debt-helpers.test.ts --coverage` | 0 — 25 passed, 100% stmts/branch/funcs/lines |
| `@tuari/api` company.unit + company.service + rpc/router (isolated, `--maxWorkers=2`) | 0 — 148 passed |
| `@tuari/web` debt/report files (targeted) | 0 — 35 passed |

## Could not verify

- Greptile CLI is installed but unauthenticated (`greptile whoami` → `access_denied`); no
  CLI verdict. Hosted review is the parent's PR step.
- Playwright e2e (`tests/e2e/debt-entry.spec.ts`, `i18n-raw-keys.spec.ts`) was not run in
  this lane; only its button-name strings changed.
- The full `@tuari/api` suite was skipped by instruction (#432 sqlite/auth hook
  flakiness); the three debt-relevant files were run isolated.
