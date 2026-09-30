# Aggressive local review — salary screen PR #456 (items 5, 6, 7)

Base: `origin/develop` = `5d0629be` (local `develop` stale at `fdb5dda6`; used
`origin/develop`). Source reviewed: `c5347561` (pre-fix). Fix SHA:
`1e714b57`. Tier: High-assurance local merge gate. Mode: remote, no push.

Three fresh-context passes ran on `5d0629be...c5347561`: an adversarial
debate (critic + defender), a Standards+Spec code review, and a test audit.
Findings below are the parent's synthesis, not the raw child output; every
claim was re-checked against the code path.

## Hunt hypotheses (debate)

| id | hypothesis | verdict | evidence |
| --- | --- | --- | --- |
| H1 | a default silently overwrites a typed amount | REFUTED | `displayedAmount = manualAmountTouched ? manualAmount : proposedAmount`; the init effect resets the amount only inside `if (employeeChanged)`. Gap: no test pinned a *typed* amount surviving a refresh — closed at `1e714b57`. |
| H2 | a days change leaves a stale amount | REFUTED | `proposedAmount` recomputed each render; untouched follows days, touched pins. |
| H3 | a filter hides rows while the count says otherwise | REFUTED | `totalCount` and the sliced rows are the same `filtered*` array. |
| H4 | pagination resets but paints an empty page | REFUTED | `effectivePage = Math.min(page, maxPage)` is used for the slice and returned; first-render clamp proven in `table-primitives.test.tsx`. One-frame flash on a filter change is possible, never an empty page. |
| H5 | a save reason appears for a payable worker, or is missing for one who is not | REFUTED except the zero/invalid-amount edge (fixed). Dialog and API use the same null checks. |
| H6 | a second same-month payment behaves differently | REFUTED | No guard in `createSalaryPayment`; no month lookup; non-unique `(employee_id, payment_date)` index. |
| H7 | dialog default and API proposal disagree | REFUTED | Both call the same `computeProposedSalaryAmount`. |
| H8 | the payment period filter hides every row | REFUTED (child lacked evidence) | `periodType` is required by `employeeSalaryPaymentSchema` and copied by the `...payment` spread in `home-view-derived-employee-salary.ts`; production rows carry it. |

No confirmed "pays the wrong amount / hides the wrong thing" behaviour bug.

## Findings fixed at `1e714b57`

| id | sev | finding | fix | red proof |
| --- | --- | --- | --- | --- |
| R1 | high | The PR's new wage/period save guard broke `src/features/date-picker-screens.test.tsx`: that dialog renders with no wage and no period, so submit is disabled and `createSalaryPayment` is never called. The last full web suite ran before the guard; only targeted suites ran after. | Guard is correct; the fixture was incomplete. Gave it `salaryAmountDzd` + `salaryPeriod`, kept the canonical-picked-day assertion. | Fails at `c5347561` without the fixture change (confirmed by stashing the working tree): `expected "vi.fn()" to be called 1 times, but got 0 times`. Green after. |
| R2 | med | A disabled save was silent for an empty/zero/non-numeric amount (a zero wage prefills `0`). | New non-blocking reason `salaries.missingAmountReason`, shown when days are valid, the amount is invalid, and no wage/period reason applies. Does not block, so a zero-wage worker who types an amount can still save (the API allows that). | `names an invalid amount so a disabled save is never silent` fails at `c5347561` (no reason text) and passes at `1e714b57`. |
| R3 | med | Pagination controls rendered on the source length, so a no-match filter showed a dead `0-0 of 0` bar. | Gate both tabs' `TablePaginationControls` on the filtered length. Filter shell stays on the source length so the filter can be cleared. | `shows a no-results message...` asserts no `0-0 من 0` / no page-size select; fails at `c5347561` (`0-0 من 0` rendered), passes at `1e714b57`. |
| R4 | low | `handleSubmit` checked `canSubmit` but not `saveBlocked`; only the disabled button prevented the call. | Added `saveBlocked` to the handler guard. | No DOM path (no `<form>`); defensive, covered by the existing blocked-save tests staying green. |
| R5 | low | The API second-payment test used `arrayContaining`, which allows extra rows. | Assert the exact two ids. | Strengthening, not a behaviour change. |

## Test gaps closed (guards against re-adding a bug)

- a hand-typed amount survives a wage-period refresh and is what is submitted;
- a valid amount is not overwritten by the proposal on re-render;
- both save reasons (missing wage, missing period) survive a typed amount, and
  the healthy dialog shows neither reason;
- a zero-wage worker can save after typing an amount;
- page-size change re-windows the table; selected size asserted;
- search AND project filter are combined;
- a filter matching exactly one page shows one page, no phantom next;
- the screen does not block paying a worker already paid this month (decision C);
- no pagination bar when a filter matches nothing.

## Design-pass verification (`design-pass.md`)

- **D1 single-sourced `effectiveSalaryPeriod()` — real.** Defined at
  `salary-payment-form.ts:19`, consumed by `defaultSalaryPaymentDays:33` and by
  the dialog's amount default. Deleting it re-duplicates the `?? "MONTHLY"`
  rule.
- **C1 `SalaryFilterField` deleted — real in the final state, but framed too
  generously.** `git log -S` shows it was introduced in this lane's own first
  commit (`029dd7ef`) and removed in the design-pass commit (`5e467824`), so it
  was not a pre-existing shallow copy the pass rescued; it was self-inflicted
  cleanup presented as a finding. The deliverable (no `SalaryFilterField`,
  `Field` reused) is correct.
- **Pass missed in this diff:** the cross-screen `date-picker-screens` test the
  new guard broke (R1); the dead no-match pagination bar (R3); the silent
  disabled save on an invalid/zero amount (R2).

## Filed follow-ups — honesty check

| issue | real problem? | verdict |
| --- | --- | --- |
| #453 per-tab extraction | Yes — `salaries-section.tsx` is 503 lines owning two table pipelines. | Honest. |
| #454 one money renderer | Yes — `MoneyCell` (salaries) and `renderMoneyValue` (employee details) both exist and differ (`useGrouping` true vs false, fraction digits). | Honest. |
| #455 salary glossary | The gap is real (salary has no glossary; the only `CONTEXT.md` is Diagnostics & Telemetry; there is no `docs/domain/`). **But** the issue body's premise — "expenses and debts both do [have one]" — is false; no expense/debt glossary exists, and the proposed `docs/domain/CONTEXT.md` location does not exist. | Problem real; justification and destination inaccurate. |

None of the three was filed to avoid work in this diff.

## Commands (exit codes)

| command | result |
| --- | --- |
| `pnpm --filter @tuari/web test -- --maxWorkers=2` | 95 files / 845 tests passed, exit 0 |
| `pnpm --filter @tuari/api exec vitest run src/modules/company/workforce.service-coverage.test.ts` | 63 passed, exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 (0 errors) |
| `pnpm check:unslop` | PASS, exit 0 |
| `pnpm check:i18n-keys` | 2 pass, exit 0 |
| scoped coverage (3 salary files) | 89.71% stmts / 88.88% branch / 87.36% funcs |
| `pnpm test:e2e tests/e2e/salaries.spec.ts` | 2 passed, exit 0 |

## Not verified

- The Greptile CLI/hosted review was not run in this lane (parent owns it).
- `#455`'s destination (`docs/domain/`) does not exist; only the issue text was
  checked, not fixed.
- Open question for the parent: leave the working-tree `apps/api/backups/`
  runtime snapshot out of the branch (it is untracked and was deleted after the
  E2E run).
