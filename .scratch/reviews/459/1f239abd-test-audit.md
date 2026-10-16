# Test audit (FINAL gate) — #459 debt cases payment

- **head audited**: `1f239abd901a4da6d5b7dc92a69b4a54693e3a20` (branch `fix/459-debt-cases-payment`)
- **range**: `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36...1f239abd` (lane commits `86c479d7` fix → `d038be49` tests → `f001d145` docs/sign-lock → `1f239abd` test+comment)
- **scope**: `apps/web/src/features/debts/debt-utils.test.ts`, `apps/web/src/features/debts/debts-mvp-web.test.tsx`, `tests/e2e/debt-entry.spec.ts`
- **prior gate**: `.scratch/reviews/459/f001d145-test-audit.md` (PASS, MED-1/MED-2/MED-3 open). 3-lens pass: Edge Case Hunter / Coverage Analyst / Quality Reviewer (skill `.agents/skills/test-audit/SKILL.md`); lenses emulated in-process (no sub-agent spawning from this role).
- **commands run this pass** (unlike the two prior audits, which ran none):
  `cd apps/web && npx vitest run src/features/debts/debt-utils.test.ts src/features/debts/debts-mvp-web.test.tsx --reporter=dot`
  → `Test Files 2 passed (2) | Tests 57 passed (57) | Duration 40.95s`.
- **verdict**: **PASS — 0 blockers.** All three prior asks landed. No source file touched by this audit.

## 1. Prior asks — status

| Prior ask (f001d145) | Status | Evidence | Red on pre-#459 `fdb5dda`? |
|---|---|---|---|
| **MED-3** exact payment `entryDate` | **Done** | `debts-mvp-web.test.tsx:311` — `entryDate: toAlgeriaDayBoundaryIso(getAlgeriaDateInputValue(), "start")` (was `expect.any(String)`); production value at `debt-cases-panel.tsx:245` | **Yes, behaviourally.** `git show fdb5dda:debt-cases-panel.tsx` grep → only `createDebtAccountMutation.mutateAsync` (line 173); pre-fix the panel never called the entry mutation, so `toHaveBeenCalledWith(... entryType:"PAYMENT")` fails. Also flips if the sent value reverts to raw `createDate` (`YYYY-MM-DD`) or shifts to the `"end"` boundary |
| **MED-2** duplicate / same-direction resolver test | **Done** | `debt-utils.test.ts` `resolveDebtCasesFormAction` describe (added test at hunk `@@ -259,6 +259,15 @@`): "picks the first account for a direction (the server keeps one per ledger)" — two `PAYABLE` accounts, asserts `{kind:"record-payment", account: first}` | **Yes, but compile-level.** `git show 86c479d7^:debt-utils.ts \| grep resolveDebtCasesFormAction` → **ABSENT** (resolver introduced in `86c479d7`, i.e. by this lane). Against pre-fix *source* the file fails to import; the *behavioural* red for the fix rests on the component test above |
| **MED-4/3** E2E account-count check | **Not done** | `tests/e2e/debt-entry.spec.ts:61-70, 108-124` assert balance/`مستحق علينا`/`not /-5\s?000/` — no assertion on the count card (`debts.cases.accountCount` = `عدد الحسابات`, rendered at `debt-cases-panel.tsx:146` as `String(sortedAccounts.length)`) | n/a (additive) |

## 2. Are the new tests meaningful (would they fail on pre-fix code)?

1. **`entryDate` pin** (`debts-mvp-web.test.tsx:311`) — **meaningful, with a caveat.** It mirrors the production expression (`toAlgeriaDayBoundaryIso(getAlgeriaDateInputValue(), "start")`) rather than hardcoding an ISO literal, so it is semi-tautological: it shares the two helpers with the code under test. It still discriminates three real regressions (raw date string, wrong boundary `"start"`→`"end"`, dropped key) and flips behaviourally on pre-fix code. **LOW** — a literal-day assertion (`expect(payload.entryDate).toMatch(/^YYYY-MM-DDT/)`-style or a frozen clock) would be strictly stronger and flake-free.
2. **Same-direction resolver test** — **meaningful and discriminating.** `toEqual({account: first})` fails for any implementation returning the *last* match (`reduce`, reversed input, re-sort by `updatedAt`) and for a "one per direction ⇒ impossible" throw. It pins `find`-first-in-input-order semantics, which is exactly the undocumented tiebreak the resolver's doc comment relies on (`debt-utils.ts:167-172`). It is a **lock on an invariant the server enforces**, not a bug reproduction — the fixture fabricates two PAYABLE accounts that the create path cannot produce. Correct classification per the skill: "edge case, subtle bug → fix it" — the cheap lock is the right call instead of an API-level invariant test.
3. **E2E step (`debt-entry.spec.ts:61-70`)** — **meaningful.** The click target changed to `تسجيل دفعة` (exact) and requires the label/action seam; the old `إنشاء الحساب` / `0 أو 2500 أو -2500` locators no longer exist, so the spec cannot pass on pre-fix code. The added `/4,500/` + `not /-5\s?000/` assertions capture the user-visible regression (balance must fall and must never render signed), which the old `/-5\s?000/` expectation encoded as "correct".
4. **Credited-ledger test rename** (`debts-mvp-web.test.tsx:344`) — assertion unchanged (`currentBalance:-700`, pay 200, expect `signedAmountDzd:-200`). Still **discriminating** for the debated divergence from `record-payment-dialog`'s `balance>0?-amount:+amount` (that law would send `+200` and fail here). Name is honest; the panel comment at `debt-cases-panel.tsx:233-238` now says "can deepen an existing credit", which matches (−700 → −900).

**Coverage Analyst:** every #459 acceptance line has a test — label/action agreement (unit + component), reuse-the-existing-account (component `not.toHaveBeenCalled()` on the create mutation), other-ledger create (component), sign law (component, both directions), zero/empty guard (component), end-to-end balance drop (`-5,000`→`4,500`→`2,500`). No duplicate coverage introduced by `1f239abd`. **Quality Reviewer: B+** — per-render `mockClear()`, no floating promises, names state the rule; weak spots are the mirrored `entryDate` expectation and the loose `.first()` scoping of the detail-page `/4,500/` locator.

## 3. Blocker decision on the outstanding E2E account-count item

**Acceptable note, not a blocker.** Rationale:

- The symptom it would guard (a *second* account for the same party+ledger) is structurally unreachable server-side: `finance.service.ts` create looks the account up by `getDebtAccountByExternalCounterpartyIdAndDirection` / `...WorkerIdAndDirection` and routes to the reuse/update branch already established in the prior review. Post-refactor the historical `/-5\s?000/` expectation was in fact encoding the *increase* bug (positive `ADJUSTMENT`), not a duplicate row — so an account-count assertion would target a symptom the issue prose over-claims.
- The behavioural gap it covers is already pinned twice: unit (`resolveDebtCasesFormAction` same-direction test) and component (`createDebtAccountMutateAsync.not.toHaveBeenCalled()`), the latter being the direct "opens only a missing ledger" proof from `d038be49`.
- Cost/benefit: E2E is the slowest, flakiest gate; the remaining hole (form posts to the wrong duplicate while the aggregate nets to the same figure) needs a duplicate to exist at all, which no code path creates.

Recorded as **residual risk R2** below rather than as a required change.

## 4. Findings by category

- **Correct** — all three prior asks resolved; both web test files green (57/57) at `1f239abd`; the two new/changed commitments are red on pre-fix source as shown above; the E2E now asserts the direction phrase and rejects signed rendering in both the payment and the partial-payment test.
- **Fixed** — nothing applied; this gate is review-only (the skill's "Apply fixes" step is superseded by the no-edit instruction; no source or test file modified).
- **Blocker** — none.
- **Note (LOW, 5)** —
  1. Mirrored `entryDate` expectation (`debts-mvp-web.test.tsx:311`); midnight-boundary flake if the assertion's `getAlgeriaDateInputValue()` crosses the Algeria day between render and assert. Prefer a frozen clock or literal day.
  2. Create-path asymmetry still untested: at `""`/`"0"` the create branch's submit is **enabled** and posts `openingBalanceDzd: undefined` (`debt-cases-panel.tsx:86, 254`); deliberate legacy behaviour, unenforced by any test (carried from prior LOW-4).
  3. Non-numeric input (`"abc"` → `NaN`) disables the payment submit via `hasValidPaymentAmount`; one-line test still missing (carried from prior LOW-6).
  4. Detail-page E2E locators use unscoped `.first()` (`/4,500/`, `مستحق علينا`) which also match the stat cards/ledger headers; the hub-row assertions are properly scoped. Broadening the scope would make the assertion stronger, not required.
  5. `debt-entry.spec.ts` tests are serially coupled (test 2 depends on test 1's 4,500 fixture state). Pre-existing, expected for a Playwright critical-path spec, but the coupling is now load-bearing for the new 2,500 expectation.

## 5. Residual risks

- **R1** — resolver picks the first same-direction account per input order; if legacy rows ever contain a duplicate, the pick follows `sortDebtAccounts` order silently (`debt-utils.ts:171`). Unreachable via the current server create path.
- **R2** — no E2E assertion on account count (`عدد الحسابات`); a hypothetical duplicate would only be caught if it moved the aggregate balance. Accepted (see §3).
- **R3** — E2E exercises only PAYABLE / `owed-by-us` and only within-balance payments; the credit-deepening overpayment path (server accepting a PAYMENT that drives a ledger into credit) is proven only at component level.
- **R4** — this pass ran the two web files only; the API suite and the Playwright spec were not executed (static inspection for the spec: locators/strings cross-checked against `debt-cases-panel.tsx` and `ar.ts`). Pre-push/CI remains the authority on the full gate.

## 6. Verdict

**PASS — 0 blockers, 0 new HIGH/MEDIUM.** The `f001d145` ask list is closed: `entryDate` is pinned, the same-direction resolver tiebreak is locked, and the E2E symptom check was strengthened (the account-count variant is judged an acceptable note with rationale in §3). The three remaining items are LOW: three one-line test gaps (create-path zero guard, non-numeric input, frozen-clock `entryDate`) and two E2E scoping/coupling notes.
