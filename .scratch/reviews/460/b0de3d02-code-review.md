# Code review — #460 (two-axis, round 2)

- **Base:** `origin/develop` @ `79acb3591a6b3827d941ab8e8d7f7ef3f9571477`
- **HEAD:** `b0de3d0202a229cc24b34e563ac5b97ed3181cca` (`chore(web): close the #460 review findings …`)
- **Round 2 diff:** `git show b0de3d02 --stat` → 4 files, +29/−28: `.scratch/implementation/460-design.md`, `apps/web/src/features/debts/debts-mvp-web.test.tsx` (+11/−?), `apps/web/src/i18n/resources/ar.ts` (−15), `docs/COMPLETION_STATUS.md`.
- **Full diff:** `git diff origin/develop...b0de3d02 --stat` → 5 files, +182/−157 (round-1: deleted `dashboard-overview.tsx` −141, test +87, design doc +94).
- **Spec sources:** issue #460 ACs (in task), `.scratch/implementation/460-design.md`. **Standards sources:** `AGENTS.md`, `docs/engineering-workflow.md`, `.agents/skills/code-review/SKILL.md` + smell baseline. Round-1 review at `.scratch/reviews/460/03ff355d-code-review.md`.

## Commands run (evidence)

| Command | Result |
| --- | --- |
| `grep -rn 'dashboard-overview\|DashboardOverview'` (all tracked text files, minus node_modules/.git) | code hits: **none**; only prose in `.scratch/**` and `docs/COMPLETION_STATUS.md:73` |
| `ls apps/web/src/features/dashboard/` | **No such file or directory** — directory gone entirely |
| `grep -rn 'accountDirection' apps/web/src` | required props at `void-entry-dialog.tsx:34`, `record-entry-payment-dialog.tsx:38` (`DebtAccount["direction"]`); prod callers `debt-ledger-panel.tsx:259,265` pass `debtAccount.direction` |
| `grep -rn 'dashboardPage' apps/web/src packages` | only `home-view-copy.ts:347` (`dashboardPage.outstandingDebts`) + the `ar.ts:1178` block defining it → **no dangling reference** |
| `node scripts/check-i18n-keys.mjs` | `missing (no fallback): 0`, `missing map-key literals: 0`, `fallback-only gaps: 0`, 10 redundant-fallback warns, 9 dynamic keys; **exit 0** |
| `pnpm --filter web exec vitest run src/features/debts/debts-mvp-web.test.tsx --testTimeout=10000` | **Test Files 1 passed, Tests 33 passed** (both direction tests included) |
| `git status --porcelain` / `git show --stat b0de3d02` | only untracked `.scratch/reviews/460/` (allowed scratch); commit stages 4 named files, no `-A`, no `packages/contracts/dist` |

## Standards

- **Correct / no violation.** Explicit staging of the 4 named files (no `git add -A`); conventional-commit chore message; no generated file touched, so the codegen guardrail holds. Test edit stays in the per-feature `debt-*-web.test.tsx` and matches neighbour style. No new smell introduced by the diff.
- **Note (low, smell — Data Clumps).** `entry` + `accountCurrentBalance` + `accountDirection` still travel together into `RecordEntryPaymentDialog:`30–38; an account-context type would be tidier. Pre-existing, not asked for. Unchanged from round 1.
- **Note (low).** The `dashboardPage.*` pruning is manual; nothing mechanically prevents re-accumulation of unused keys. The design doc flags an unused-i18n-key lint rule as a follow-up (F3) rather than silently deferring — acceptable.

## Spec

- **AC1 — grep, then delete `dashboard-overview.tsx`: SATISFIED (round-1 F1 now closed).** No importer anywhere in code; `apps/web/src/features/dashboard/` no longer exists; `docs/COMPLETION_STATUS.md:73` now annotates the line as removed in #460, so the doc no longer points at a live path.
- **AC2 — explicit `accountDirection` on both dialogs, passed by the caller: SATISFIED.** Both props are **required** (`accountDirection: DebtAccount["direction"]`, not optional) and the only production call sites (`debt-ledger-panel.tsx:259,265`) pass the account's own `direction`. Production dialogs are untouched by round 2 (`git diff 79acb359...b0de3d02` changes no dialog file) — the contract was already shipped by #458/#471, verified against the code, not the claim.
- **AC3 — one test per dialog that the phrase comes from the prop, not the sign: SATISFIED, and round-1 weak-assertion finding F4 is closed.** `debts-mvp-web.test.tsx` has `VoidEntryDialog phrases the opening from accountDirection, not the sign` (`:912`) and `RecordEntryPaymentDialog phrases the entry and the max from accountDirection, not the sign` (`:942`). In the round-2 version both halves use the *same* `signedAmountDzd: 5000` / `accountCurrentBalance: -5000` and vary only the prop:
  - PAYABLE → opening `getByText("مستحق علينا")` (exact) **and** max `getByText(/رصيد مستحق لنا/)`; `queryByText("مستحق لنا")` is null.
  - RECEIVABLE → opening `getByText("مستحق لنا")` **and** max `getByText(/رصيد مستحق لهم/)`; `queryByText("مستحق علينا")` is null.
  - `getDebtAccountBalanceState` branches on `direction` × sign (`debt-helpers.ts`; phrase table `DEBT_BALANCE_STATE_PHRASE`, exercised in `debt-utils.test.ts:36–52`). Identical signed inputs plus different props is only satisfiable if the prop drives the phrase: any sign-only derivation yields the *same* pair of phrases for both renders, and the two renders assert mutually exclusive phrases (`مستحق علينا` vs `مستحق لنا`; `رصيد مستحق لنا` vs `رصيد مستحق لهم`) — so a sign-driven implementation fails at least one assertion. Both surfaces are now pinned exactly (the round-1 `getAllByText(...).length > 0` weak spot is gone).
- **i18n removal: SATISFIED.** The 13 removed `dashboardPage.*` keys are referenced nowhere; `check-i18n-keys.mjs` reports 0 missing keys and exits 0, so no `t()` call renders a raw key.
- **Not asked for, but harmless:** the `ar.ts` pruning and the design-doc rewrite go slightly beyond the three literal ACs, but both are provably-referenced-by-nothing cleanups tied to AC1 and are recorded in the design doc — not scope creep.

## Verdict

**Approve.** Both axes clean at HEAD; all three round-1 low findings (F1 doc drift, F2 orphaned keys, F4 weak assertion) are verifiably closed, suite green 33/33, i18n check exits 0, no importer of the deleted file, commit hygiene intact. Residual risk is only the non-blocking follow-up (no unused-i18n-key lint rule).
