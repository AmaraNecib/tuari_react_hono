# Design pass (third round) — #475, diff `d6164c65...ad20bba1`

- Issue: [#475](https://github.com/AmaraNecib/tuari_react_hono/issues/475) — "Money: bound the remaining inventory money inputs and report aggregates"
- Design: `.scratch/implementation/475-design.md`
- Scope reviewed: `git diff d6164c651a42be41f5b4824a53fa88e06e8a1ffa...ad20bba1515d8ae0bc6233e726159ab69885dbc6` (13 files, +759/−51)
- **Delta since prior round** (`ea637d2f...ad20bba1`, 3 files, +49/−3): **test-only + one cosmetic.** No `apps/` or `packages/` source file changed.
- Lenses: `domain-modeling`, `codebase-design`, `improve-codebase-architecture`
- Posture: incremental — verify the delta, confirm the prior pass's findings still hold, and check the new tests are genuine. No source file modified.

---

## Delta audit

`git diff ea637d2f...ad20bba1` touches exactly three files, all test artifacts:

- `apps/api/src/modules/company/finance.service-coverage.test.ts` — new debt per-account `SETTLEMENT` fold test.
- `apps/api/src/modules/inventory/inventory-report-money-bound.test.ts` — new consumable-accumulator test, plus one reworded `byPeriod` comment.
- `packages/contracts/src/index.test.ts` — cosmetic `aboveBound` change (`Number.MAX_SAFE_INTEGER + 1` → `MAX_MONEY_DZD + 1`).

The design doc's own description of the delta ("TEST-ONLY plus one cosmetic") matches the diff exactly. Production source (`report.helpers.ts`, `inventory.service.ts`, `finance.service.ts`, contracts) is byte-identical to `ea637d2f`, so every property the prior two passes approved is preserved by construction.

---

## domain-modeling

**Correct — the delta introduces no new vocabulary, constant, or message.** No source file changed, so the money vocabulary is exactly as approved at `ea637d2f`: report totals reuse `nonNegativePaymentAmountSchema` (`payment.ts:22-31`, documented), the record-payment input reuses `paymentAmountSchema` (`inventory.ts:476`), and the arithmetic rule reuses `MAX_MONEY_DZD`. The issue's deliverable ("do not invent a new constant") stays met.

**Correct — the consumable test names a real domain distinction.** The new test (`inventory-report-money-bound.test.ts:158-168`) uses `itemType: "CONSUMABLE"` rows, which route to `totalConsumablesRaw` (`inventory.service.ts:1213`), a different accumulator from assets (`:1211`) and the cross-sum (`:1219`). The test proves the consumable accumulator carries its own guard rather than relying on the asset fold or the cross-sum — a genuine concept-level distinction, not a restatement of an existing test.

**Note — the SETTLEMENT fold test names the per-account model.** `finance.service-coverage.test.ts:1068-1100` pins the per-account `SETTLEMENT` fold (`finance.service.ts:1029-1034`) *before* the summary `totalSettledDzd` fold, matching the design's stated ordering ("The guard runs before `roundMoney`"). No vocabulary change; the reuse is honest.

**Note — no glossary to update.** `CONTEXT.md` carries no money vocabulary and there is no `CONTEXT-MAP.md`. Nothing to write; unchanged from both prior passes.

---

## codebase-design

**Correct — all three actionable findings from the 5c4a8b37 pass remain resolved (source untouched since ea637d2f).**

| Prior finding | Status | Evidence (source identical to `ea637d2f`) |
| --- | --- | --- |
| Dead `nextDzd` parameter | **Resolved** | `report.helpers.ts:59` `onOverflow: () => never`; called as `onOverflow()` at `:62`. Both adapters take no args. |
| `accumulateGrossTotal` duplication | **Resolved** | `inventory.service.ts:107-116` is a thin delegate to `accumulateReportMoney`; the finite+bound body is stated once, in the shared helper. |
| `nonNegativePaymentAmountSchema` doc note | **Resolved** | `payment.ts` documents the computed-aggregate consumer. |
| `toReportOrpcError` vs `mapExpenseError` | **Deferred (unchanged)** | Pre-existing, out of this diff's scope. Own issue, not a blocker. |

**Correct — the delta adds no new module surface.** It is test-only, so no seam, wrapper, or interface changed. The helper still passes the deletion test (deleting `accumulateReportMoney` restores the guard at ~13 call sites + the invoice write path).

**Correct — the two new tests target distinct, previously-uncovered folds.**
- Consumable accumulator (`totalConsumablesRaw`): the prior suite covered byPeriod, topDestinations, byType, and totalSettled. The consumable total was the one summary accumulator with no dedicated test; this closes it. Rows are `MAX_MONEY_DZD` + `1`, both legal, only the consumable fold leaves the bound.
- Per-account `SETTLEMENT` fold: exercises the fold that runs *before* `totalSettledDzd`, proving the per-account guard fires independently. The raw `UPDATE` of `signed_amount` to `-(MAX_MONEY_DZD + 1)` is the correct way to inject a legacy above-bound row the write gate would now refuse.

**Note (pre-existing) — movement product still guarded only through the running total.** Unchanged from both prior passes; unreachable in practice (each multiplicand is row-bounded). No action.

---

## improve-codebase-architecture

**Correct — no unguarded report money sum survives, and the guards stay ahead of `roundMoney`.** Source is unchanged from `ea637d2f`, where this was verified call by call across the three generators. The delta adds only tests, so the routing guarantee is intact.

**Correct — the new tests are genuine red→green guard tests, not tautologies.**
- Consumable: two `CONSUMABLE` rows summing to `MAX_MONEY_DZD + 1`; the assertion is on the guard's `BUSINESS_RULE` error. On pre-guard code (no consumable accumulator check) this would return an above-bound total rather than throw, so the test discriminates.
- SETTLEMENT fold: a single legacy entry above the bound; the test's own comment correctly notes the guard fires *before* the account total is folded. On pre-fix code the per-account fold would not refuse, so the test discriminates.

**Correct — the `aboveBound` cosmetic makes the contract tests pin the real ceiling.** `index.test.ts:2235` now uses `MAX_MONEY_DZD + 1` instead of `Number.MAX_SAFE_INTEGER + 1`. Both values exceed `MAX_MONEY_DZD`, so behaviour is unchanged, but the test now states the bound the product actually enforces rather than a coincidentally-larger number. Pure improvement.

**Note — the reworded `byPeriod` comment is now accurate.** `inventory-report-money-bound.test.ts:126-127` no longer claims the month fold is the *only* one that leaves the bound; it now says "the month fold mixes them, so a movement batch can overflow a month even when every per-type total is legal." This resolves the cosmetic comment-imprecision note from the `ea637d2f` pass.

**Note — the output bound is defence-in-depth behind the service guard.** Unchanged and documented (`reports.ts:8-14`); acceptable, fails loudly rather than silently.

---

## Verdict

**Approve. No blockers. Prior findings remain resolved.**

The delta is exactly what the task described: test-only plus two cosmetics, with zero production-source change. Concretely:

1. **New consumable-accumulator test** — genuine, covers a previously-untested accumulator, discriminates on pre-fix code.
2. **New debt per-account SETTLEMENT fold test** — genuine, pins the fold ordering the design specifies.
3. **`aboveBound` → `MAX_MONEY_DZD + 1`** — cosmetic; makes contract tests pin the real bound.
4. **Reworded `byPeriod` comment** — resolves the prior pass's cosmetic comment note.

All three actionable findings from the 5c4a8b37 pass (dead param, `accumulateGrossTotal` duplication, schema doc) and the prior pass's comment note are closed. No regression is possible on the guarded path because no source line moved.

Residual (all out of this diff's scope, none blocking):
- `toReportOrpcError` vs `mapExpenseError` — two wire-error mapping mechanisms in `rpc/`; own issue.
- Movement product guarded only through the running total (unreachable; no action).

Nothing found in the correctness, contract-safety, or domain-vocabulary dimension.
