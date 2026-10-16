# Two-axis code review — #475 (third round at `ad20bba1`)

- **Diff**: `git diff d6164c651a42be41f5b4824a53fa88e06e8a1ffa...ad20bba1515d8ae0bc6233e726159ab69885dbc6`
- **HEAD**: `ad20bba1 test(inventory): cover the remaining reachable report money guards (#475)`
- **Base**: `d6164c65` (== `origin/develop`)
- **Delta under review**: `ea637d2f...ad20bba1` — test-only, 3 files, +55/−3
- **Prior rounds**: `5c4a8b37` and `ea637d2f` (both PASSED) — `.scratch/reviews/475/{5c4a8b37…,ea637d2f…}-code-review.md`
- **Standards source**: `.agents/wisdom/architecture.md` (+ repo smell baseline)
- **Spec source**: `gh issue view 475` (open) + `.scratch/implementation/475-design.md`
- **Validation**: `pnpm exec vitest run --testTimeout=10000` over the 5 touched test files → **5 files, 204 tests, all passed** (12.9s; 202 at `ea637d2f`, +2 = the two new tests)
- **Method**: delta read line-by-line + the two guard call sites in source + full test run. No source modified.

---

## Delta scope (verified)

| File | Change | Kind |
|---|---|---|
| `apps/api/src/modules/company/finance.service-coverage.test.ts` | +33 | new test: per-account `SETTLEMENT` reduce guard |
| `apps/api/src/modules/inventory/inventory-report-money-bound.test.ts` | +19/−3 | new test: consumable accumulator guard + clarifying comment reword |
| `packages/contracts/src/index.test.ts` | +1/−1 | `aboveBound` now `MAX_MONEY_DZD + 1` |

No production file changed. `git status --porcelain` shows only untracked `.scratch/reviews/475/` (expected scratch); nothing staged.

---

## Standards

### Correct

- **Prior low resolved.** `aboveBound` is now `MAX_MONEY_DZD + 1` (`packages/contracts/src/index.test.ts:2235`), using the constant already imported at `:57`. This was the exact style nit the `ea637d2f` round fixed in `reports.test.ts:16`; the two files now agree.
- **Resolution is behaviour-identical, not a weakening.** `MAX_MONEY_DZD === Number.MAX_SAFE_INTEGER` (`packages/contracts/src/payment.ts:11`), so `aboveBound` still evaluates to `9007199254740992` (exact, finite, one above the bound) and every assertion it feeds is unchanged: input rejection `:2250`, `summary.totalValueDzd` `:2279`, `byItemType.valueDzd` `:2285`, `totalOutstandingDzd` `:2317`, `byPeriod.valueDzd` `:2333`. The coupling to the single money constant is the improvement, not a semantic change.
- **New guard tests target real, distinct call sites.** Both new tests hit a guard the prior round listed as uncovered-level risk:
  - consumable accumulator — `inventory.service.ts:1210` (`totalConsumablesRaw = accumulateInventoryReportMoney(totalConsumablesRaw, row.totalPriceDzd)`), inside the row loop, i.e. before the `totalValueDzd` cross-sum at `:1216`. The test's two CONSUMABLE rows (`MAX_MONEY_DZD` + `1`) therefore trip that accumulator first, exactly as the comment claims.
  - per-account `SETTLEMENT` reduce — `finance.service.ts:1028-1033` (`entries.filter(SETTLEMENT).reduce(… accumulateDebtReportMoney …)`) runs inside the account loop and precedes the `totalSettledDzd` fold at `:1036`. The test forces `status === "SETTLED"` via `settleDebtAccount` (so `accountSettled` is computed) and injects the legacy overshoot with a raw `UPDATE "debt_entry" SET "signed_amount" = -(MAX_MONEY_DZD + 1)` — bypassing the write gate the way a pre-#429 row would have, which is the correct way to simulate legacy data.
  - The two tests cover *different* call sites of the same shared rule (inner reduce vs. outer fold), so they are not duplicates.
- **Test-local conventions respected.** Both follow the file's existing harness (`createHarness` / `createService`), the `(#475)` describe-suffix convention, the `thrown`/`captureError` idiom, and the `expectBusinessRule` helper. Comments state *why* each fixture reaches its guard, which is what makes the reachability claim auditable.
- **Design's guard-before-round invariant still holds.** Both folds are raw sums; `roundMoney` is applied downstream (`inventory.service.ts:1213-1216`, `finance.service.ts:1124`), so the guard precedes rounding in the newly-covered paths too.

### Judgement calls

- **[low] `aboveBound` reused for a count assertion.** `packages/contracts/src/index.test.ts:2292` asserts `byLocation[0].assetCount: aboveBound` to prove counts stay permissive. Correct intent, but the name reads as a money bound while being applied to a count. Cosmetic and unchanged by this delta.
- **[low] Contract tests still sample rather than enumerate.** Unchanged from prior rounds; drift risk low because the bounded fields share one schema object.
- **[note] Pre-existing second `aboveBound`.** `packages/contracts/src/index.test.ts:2420` (the #429 block) still uses `Number.MAX_SAFE_INTEGER + 1`. Scoped to its own `describe`, outside this round's target. Optional future tidy; not a regression.

---

## Spec

Issue #475's two requirements (bound `recordInvoicePayment.amountDzd`; guard the three report aggregates) and the deliverable constraint (reuse `MAX_MONEY_DZD`, invent no constant) were verified satisfied in the `ea637d2f` round. This delta adds no requirement and removes none — it is coverage hardening plus the cosmetic constant fix.

- **Missing / partial:** none.
- **Scope creep:** none — production code is untouched; the only non-test edit is the constant expression inside a test.
- **Implemented-but-wrong:** none found.

---

## Verdict

**PASS — both axes pass. No blocker, no hard violation.**

- **Standards:** 0 hard violations. Prior-round low (`aboveBound` re-hardcoding `Number.MAX_SAFE_INTEGER`) is **RESOLVED** at `index.test.ts:2235`; behaviour identical (`MAX_MONEY_DZD === Number.MAX_SAFE_INTEGER`). Worst remaining item: the low about a money-named constant driving a count assertion (`:2292`), cosmetic.
- **Spec:** unchanged from `ea637d2f` — both requirements met, deliverable constraint met, no scope creep.
- **Validation:** 5 files / 204 tests pass, including the two new guard tests.
