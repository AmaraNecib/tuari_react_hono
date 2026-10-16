# Test audit (round 3) — issue #475 (HEAD `ad20bba1515d8ae0bc6233e726159ab69885dbc6`)

Diff audited: `d6164c651a42be41f5b4824a53fa88e06e8a1ffa...ad20bba1515d8ae0bc6233e726159ab69885dbc6`
(13 files, +759/−51; = round 1 `5c4a8b37` + round 2 `ea637d2f` + this round `ad20bba1`.)

Prior audits:
- `.scratch/reviews/475/5c4a8b3799d320a5724813d236447606fd363f02-test-audit.md`
- `.scratch/reviews/475/ea637d2f7da654c0d25043c48015497cbc9ca6b7-test-audit.md` (left lows **F6** and **F7**,
  carried **F4** and **F5**)

This round's commit (`ad20bba1`) touches only three test files (`+49/−3`):
`apps/api/src/modules/company/finance.service-coverage.test.ts`,
`apps/api/src/modules/inventory/inventory-report-money-bound.test.ts`,
`packages/contracts/src/index.test.ts`. No source changed → no new production risk surface.

**Verdict: PASS.** F6 and F7 are genuinely covered and non-vacuous. F4 and F5 remain open (both low,
unchanged). One new low note (N1): the contracts constant swap is a semantic no-op.

---

## 1. Acceptance table (issue #475 deliverable = "bound the remaining inputs and guard the report aggregates, reusing the shared `MAX_MONEY_DZD` helpers")

| # | Criterion | Test | Red on base? | Status |
|---|---|---|---|---|
| AC1 | `recordInvoicePayment.amountDzd` bounded (wire) | contracts `index.test.ts` → record-payment input bound | Yes | Covered (round 1) |
| AC2 | `recordInvoicePayment.amountDzd` bounded (module seam, legacy above-bound invoice) | `inventory-debt-sign.test.ts` | Yes | Covered (round 1) |
| AC3 | Report money fields bounded at the output schemas | contracts → report money rule | Yes | Covered (round 1) |
| AC4 | Inventory `totalAssetsRaw` overflow → `BUSINESS_RULE` | `inventory-report-money-bound.test.ts` | Yes | Covered (round 1) |
| AC5 | Asset+consumable cross-sum guarded | same file | Yes | Covered (round 1) |
| AC6 | Movement `byType` guarded | same file | Yes | Covered (round 1) |
| AC7 | Movement `byPeriod` fold guarded | same file | Yes | Covered (round 2) |
| AC8 | Movement `topDestinations` fold guarded | same file | Yes | Covered (round 2) |
| AC9 | Debt `totalOutstandingDzd` overflow | `finance.service-coverage.test.ts` | Yes | Covered (round 2) |
| AC10 | Debt `totalSettledDzd` outer fold guarded | same file | Yes | Covered (round 2) |
| AC11 | Overflow crosses the wire as `code: "BUSINESS_RULE"` | `rpc/handlers/reports.test.ts` | Yes | Covered (round 1) |
| **AC13** | **Inventory `totalConsumablesRaw` accumulator guarded (first-chance)** — *new in `ad20bba1`* | `inventory-report-money-bound.test.ts` → "refuses a consumable total that sums past the bound" | **Yes** | **Covered (this round; closes F7)** |
| **AC14** | **Debt per-account `SETTLEMENT` reduce guarded (before the account total)** — *new in `ad20bba1`* | `finance.service-coverage.test.ts` → "refuses a legacy settlement entry above MAX_MONEY_DZD in the per-account fold (#475)" | **Yes** | **Covered (this round; closes F6)** |
| AC15 | Normal batch still aggregates (regression) | same file → "still aggregates a normal batch" | No — by design green both sides | Covered |
| — | F4: router-level `recordInvoicePayment` rejection | **none** | — | **OPEN (low)** |
| — | F5: standalone legacy read-back contract test | **none** | — | **OPEN (low)** |

Red-runs run by me this round: post-fix suite green — **3 files / 176 passed** (`finance.service-coverage.test.ts`,
`inventory-report-money-bound.test.ts`, `contracts/src/index.test.ts`). The base-red claim for AC13/AC14 is
diff-anchored (base source below has no guard at either site), consistent with prior rounds; I did not spin up a
`d6164c65` worktree.

---

## 2. F6 verification — is the per-account `SETTLEMENT` fold genuinely covered and non-vacuous?

**YES.** Evidence chain:

1. **Harness column name is correct.** `debt_entry."signed_amount"` is `REAL NOT NULL`
   (`apps/api/src/infrastructure/database/schema-definitions.ts:312`). The test's raw
   `UPDATE "debt_entry" SET "signed_amount" = ? ... AND "entry_type" = ?` ran green in my run, which proves the
   table/column/entry-type match a real row (a mismatch would raise a SQLite error and fail the test, not pass it).

2. **The throw comes from the per-account fold, not `totalSettledDzd`.** Source order in
   `apps/api/src/modules/company/finance.service.ts`:
   - `accountSettled` is computed by the reduce at **:1029–1031**:
     `.reduce((sum, entry) => accumulateDebtReportMoney(sum, Math.abs(entry.signedAmountDzd)), 0)`
   - the account is folded into the grand total **after** that, at **:1035–1036**:
     `totalSettledDzd = accumulateDebtReportMoney(totalSettledDzd, accountSettled)`.
   The fixture leaves exactly one SETTLEMENT entry with `|signedAmountDzd| = MAX_MONEY_DZD + 1`; the reduce's
   **first** step is `accumulateDebtReportMoney(0, MAX+1)` → `MAX+1 > MAX_MONEY_DZD` → `onOverflow()` → `CompanyError`
   `BUSINESS_RULE`. The outer `:1036` fold is never reached. ✔
   The fixture's status is `SETTLED` (`settleDebtAccount`) and `current_balance = 0`, so `accountOutstanding = 0`
   and `totalOutstandingDzd` never moves — the throw cannot be attributed to the outstanding fold. The green
   `CompanyError`/`BUSINESS_RULE` assertion therefore *only* succeeds because the per-account branch executes. ✔

3. **Non-vacuous (reds on base).** Base `d6164c65` `finance.service.ts` has no guard at the reduce:
   `accountSettled` was a plain `+=` and `totalSettledDzd += accountSettled` (:1021). With `-(MAX+1)` stored, the
   service returns a report with `totalSettledDzd = MAX+1`; nothing throws → `thrown` stays `undefined` →
   `expect(thrown).toBeInstanceOf(CompanyError)` fails. ✔

4. **Precision is safe.** `MAX_MONEY_DZD = Number.MAX_SAFE_INTEGER` (`packages/contracts/src/payment.ts:11`), so
   `MAX+1 = 2^53 = 9007199254740992`, exactly representable as a double/REAL — the stored value round-trips unchanged
   and no float rounding can mask the overflow. ✔

**F6: CLOSED.**

---

## 3. F7 verification — is the consumable accumulator genuinely covered and non-vacuous?

**YES.** Evidence chain:

1. **First-chance guard.** `inventory.service.ts` `generateInventoryReport` loop (:1205–1211 in HEAD):
   ```
   if (row.itemType === "ASSET") { totalAssetsRaw = accumulateInventoryReportMoney(...) }
   else { totalConsumablesRaw = accumulateInventoryReportMoney(...) }
   ```
   The fixture is two CONSUMABLE rows (`MAX_MONEY_DZD`, then `1`), so the **second** iteration throws
   `InventoryError`/`BUSINESS_RULE` inside the consumable accumulator — before the asset fold, the asset+consumable
   cross-sum, or any partition loop. ✔ This is the site F7 named.

2. **Non-vacuous (reds on base).** Base `d6164c65` `inventory.service.ts:1192` is `totalConsumablesRaw += row.totalPriceDzd`
   (plain add, no guard; confirmed via `git show d6164c65:…`). Base sums to `MAX+1`, `totalValueDzd = roundMoney(MAX+1)`
   returns a finite number, no throw → `expectBusinessRule(captureError(...))` fails. ✔

3. Fixture ordering is correct: both rows are CONSUMABLE, same `itemName`, distinct ids → neither the `ASSET` branch
   nor the `items` partition can fire first. ✔

**F7: CLOSED.**

Note: F6 + F7 were the *only* two non-shadowed guards left after round 2 (all six other per-partition sites were
proved sub-sums of an earlier-guarded total). With both closed, **every reachable report-money guard now has a
direct red-to-green test**, and the remaining guarded sites are the shadowed defensive symmetry.

---

## 4. F4 / F5 — carried, still open

Both are **unchanged** by `ad20bba1` (its diff touches only the three test files above).

- **F4 — no router-level rejection test for `recordInvoicePayment`.** Coverage is contract-schema level
  (`packages/contracts/src/index.test.ts`) plus module-seam level (`inventory-debt-sign.test.ts`). No RPC-level
  request/response test asserts an over-bound `amountDzd` is rejected with the expected code. Real risk: **low** —
  the RPC handler validates via the *same* shared schema (the contract test exercises that schema), so the
  untested hop is a thin `schema.parse` call, not new arithmetic. It would only bite if the handler bypassed the
  schema or mapped the error code incorrectly.
- **F5 — no standalone contract test for the legacy invoice-group read-back.** The read-back
  (`paid.remainingDebtDzd === MAX_MONEY_DZD + 1 - 600`) lives inside the seam test rather than as a contract test
  for the invoice-group read shape. Real risk: **low** — the behavior is asserted, just not in its own file; the
  gap is placement/robustness, not missing behavior.

Neither is a blocker for #475; both are test-organization residuals.

---

## 5. Findings

### 🟡 F6 — CLOSED
Per-account `SETTLEMENT` reduce now has a direct test; throw proven to originate in the fold at
`finance.service.ts:1029–1031` (before `:1036`), column name `debt_entry.signed_amount` confirmed.

### 🟡 F7 — CLOSED
`totalConsumablesRaw` (first-chance accum) now has a direct test at `inventory.service.ts:1205–1211`.

### 🟡 F4 — OPEN (low, carried)
No router-level `recordInvoicePayment` rejection test. Risk low (shared schema, thin handler gate).

### 🟡 F5 — OPEN (low, carried)
No standalone contract test for the legacy invoice-group read-back. Risk low (behavior asserted in the seam test).

### ℹ️ N1 (new, informational) — the contracts constant swap is a semantic no-op
`packages/contracts/src/index.test.ts` changes `aboveBound` from `Number.MAX_SAFE_INTEGER + 1` to
`MAX_MONEY_DZD + 1`. Because `MAX_MONEY_DZD = Number.MAX_SAFE_INTEGER` (`payment.ts:11`), these are the **same
value**. The commit message calls it "pin the contract test to MAX_MONEY_DZD + 1", but it does **not** tighten
coverage — it only makes the constant's provenance explicit. Not a defect; flagging so it is not mistaken for a
strengthening. (If the intent was to prove rejection *at the bound*, that already holds: `MAX+1` is one above the
bound and is rejected.)

### ℹ️ N2 (informational) — error-code split is intentional
Input-bound refusal → `VALIDATION`; computed-aggregate overflow → `BUSINESS_RULE`. Consistent across both suites
and the #429 pattern. Not a defect.

### ℹ️ N3 (informational) — F6 fixture coupling
The F6 fixture depends on `settleDebtAccount` writing exactly one SETTLEMENT entry for the rewritten amount to be
the sole term. If that writer ever emits additional SETTLEMENT rows, the fixture would still throw (sum grows
faster), so the test stays green — acceptable coupling, no action.

---

## 6. Verified vs not verified

**Verified this round**
- Scope of the `d6164c65...ad20bba1` diff; this round's commit touches only the three test files (+49/−3).
- F6 and F7 tests exist, target the named guard, and the throw source is pinned by source order
  (`finance.service.ts:1029–1036`; `inventory.service.ts:1205–1211`).
- Harness column/table names (`debt_entry.signed_amount`) match the production DDL
  (`schema-definitions.ts:312`).
- Base has no guard at either site (`git show d6164c65:…`) → both tests red on base.
- Post-fix green: 3 files / 176 passed.
- `MAX_MONEY_DZD = Number.MAX_SAFE_INTEGER` → `MAX+1` is exactly representable (no float masking).

**Not verified (residual risk)**
- Did not independently re-run the suite on the `d6164c65` base worktree; the red claim is diff-anchored
  (`git show` of the base source) plus assertion-shape reading.
- Did not exercise the RPC layer (F4) or add the F5 contract test — both intentionally out of this round's scope.

---

## 7. Verdict

**PASS.** F6 and F7 are genuinely closed with non-vacuous red-to-green tests at the correct folds, with the F6
column name and throw-site confirmed. F4 and F5 remain open at low risk and do not block #475.
