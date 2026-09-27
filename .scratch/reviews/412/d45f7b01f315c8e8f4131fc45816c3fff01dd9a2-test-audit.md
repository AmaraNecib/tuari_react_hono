# #412 — test audit (edge cases, coverage, quality)

- Reviewed diff: 17911dc...988493d (audit run 2026-09-27; fixes applied after)
- Final source SHA (all fixes): d45f7b01f315c8e8f4131fc45816c3fff01dd9a2
- Re-pinned: the only commits after the reviewed 988493d are 3e571ff (review-driven source/test fixes) and d45f7b0 (E2E spec + E2E seed helpers). The production source at the final SHA is what these fixes produced.
- Agents: edge-case hunter, coverage analyst, test quality reviewer (parallel, read-only)
- Result: grade B → fixes applied; the new dialog test also caught a real reset bug.

## Resolutions

| Finding | Severity | Resolution |
| --- | --- | --- |
| Overlapping projects > 100% coverage untested | red | Added contract test asserting both projects get 30. |
| WEEKLY legacy create path untested | red | Added service test: WEEKLY keeps the raw wage (9000) while `days` is stored. |
| Zero/near-zero coverage collapses to [] | orange | Added test pinning the intended behavior; docstring states it. |
| MONTHLY days 31 unprorated boundary unpinned | orange | Added `30/31/1` contract tests. |
| Rolled-over dates name a wrong period (`2026-13-15`) | orange | Fixed `resolveSalaryPaymentPeriod` (integer + calendar validation) + tests for 13, 00, Feb 31, non-leap Feb 29. |
| `computeUnallocatedDays(NaN)` unpinned | orange | Not reachable from the dialog (invalid days → null); left as is. |
| Inverted assignment window skip untested | orange | Added contract test. |
| Invalid `periodStart` untested | orange | Added contract test. |
| Invalid `endDate` branch untested | yellow | Added contract test. |
| Tautological `toBeLessThan(payment.days)` | quality | Changed to exact `toBe(25)`. |
| Over-promising schema test name | quality | Renamed to "declares the `days` column and its additive migration". |
| Dialog has zero tests (reconciliation UX, sliding days) | coverage | Added `add-salary-payment-dialog.test.tsx`: derived prefill, re-derivation until edited, remainder, over-allocation blocks submit, payload on submit. |
| Exact reconciliation boundary (sum == days) untested | coverage | Added service test. |
| WEEKLY non-offering at the selector / legacy carve-out untested | coverage | Not added this round; noted. |
| E2E wiring untested | coverage | **Resolved**: `tests/e2e/salaries.spec.ts` (proposal, split prefill, over-allocation block, recorded days). |

### Bonus fix from the new dialog test

The reset effect listed `resetAmount`/`resetDate` (new identities every render)
as dependencies, so it re-ran on every render and reset the days input, amount,
date and note on each keystroke. Fixed with a target ref guard; the test now
drives days + split edits and would fail on regression.

## Edge case hunter (raw)

# #412 edge-case audit — missing tests (READ-ONLY, no files edited)

Evidence: `packages/contracts/src/salary-days.ts`, `.../salary-days.test.ts`, `apps/api/src/modules/company/workforce.service.ts:626-720`, `workforce.service-coverage.test.ts`, `apps/web/src/features/employees/salary-payment-form.ts` + `.test.ts`.

## Red (would break)
1. **Overlapping projects > 100% coverage** — `deriveSalaryProjectDays` doc (salary-days.ts:100-107) promises "overlapping projects can exceed `days`", and the dialog's over-allocation warning depends on it. No test: two projects each covering all of March must both get 30 (sum 60). Untested branch = free regression.
   `it("lets overlapping projects exceed the paid days", () => expect(deriveSalaryProjectDays({assignments:[a 03-01..03-31, b 03-01..03-31], ...MARCH_2026, days:30})).toEqual([{a,30},{b,30}]))`
2. **WEEKLY legacy create path** — service has no WEEKLY test (grep of coverage file: none). WEEKLY keeps the raw salary while `days` defaults 30, so `expectedAmountDzd` is full pay regardless of days; a legacy WEEKLY employee paid 5 days proposes a full month. Pin it: `WEEKLY, salary 9000, days 5 → expected=9000, and split total ≤ days still enforced`.

## Orange (subtle bug)
3. **Zero/near-zero coverage collapses to `[]`** — 1 covered day in a 31-day period with `days:1`: `normalizedTotalDays=round(1/31)=0`, line `round(1/31)=0` → filtered out, so a real assignment silently yields no split. Test the boundary: `days:1`, one project covering 1 of 31 days → expect `[]` *documented*, or `[{p1,1}]` if intended.
4. **Days > month length in MONTHLY** — `computeProposedSalaryAmount({MONTHLY, 30000, days:31})` = 31000; only 30/27/15 pinned. Also February at /30 (parent decision) is unpinned in *contracts* (only web month-length is tested) — a future "fix" to 28 would pass all contract tests.
5. **Invalid/rolled-over month-day in `resolveSalaryPaymentPeriod`** — `"2026-13-15"`: `Date.UTC(2026,13,0)` → Jan 31 2027, so `lastDay=31`, and `toAlgeriaDayBoundaryIso("2026-13-31")` happily ISO-normalizes to 2027 — a wrong period, not null. Also `"2026-02-31"`. Test `"2026-13-15"`, `"2026-00-10"` → expect null.
6. **Naive/empty days in the form** — empty input → `NaN`; `computeUnallocatedDays(NaN,[5])` → `NaN`, not the "unknown" null; no test. `computeUnallocatedDays(0,[0])` also unpinned.
7. **Inverted assignment window** — `startDate: 2026-03-20, endDate: 2026-03-10` inside the period: clamped loop skips (salary-days.ts:158), but no test asserts the skip (only inverted *period* is tested).
8. **Invalid period input** — only `assignment.startDate` bad-string is tested; `periodStart:"not-a-date"` → `[]` unpinned.

## Yellow (cosmetic)
9. `computeProposedSalaryAmount` has no guard for `days<=0`/non-integer (asymmetric with `deriveSalaryProjectDays` which returns `[]`); DAILY `days:0` → 0. Add a symmetry test or a guard note.
10. `salaryAmountDzd: 0` MONTHLY → 0, then service rejects with "amount > 0"; a 0-salary worker is unpayable — untested intent.
11. Rounding half-cent boundary (e.g. `salary/30*days` ending in `.005`) and Web parity: `resolveSalaryPaymentPeriod` + `deriveSalaryProjectDays` agree only by duplicate fixtures, no shared parity test.

## Coverage analyst (raw)

# #412 Coverage audit (read-only)

Evidence: 5 changed test files, 184 tests in worktree all pass (`vitest run`); targeted contract run 21/21.

## 1. Acceptance-criterion coverage
| Criterion | Test | Verdict |
|---|---|---|
| Proration 30/27/15 | salary-days.test `prorates...salary/30`; service `prorates a monthly wage` | ✅ |
| Daily proration | both files | ✅ |
| Amount override | service `lets the caller override`; contract `accepts omitted amount` | ⚠️ service-only; no UI override test |
| Derived default (assignment windows ∩ period) | 10 `deriveSalaryProjectDays` cases: full-period, before/after clamp, null end, no windows, same-project overlap, two projects, outside window, single-day, bad ts, inverted | ✅ strong |
| Derived-default normalization (full/partial/rounding/single-day) | full-period→30, partial→15, rounding overshoot→drop 0-day, single-day→1/30 | ✅ |
| Sliding days between projects | none | ❌ |
| Reconciliation sum ≤ days | service 20+5<30 allocated<days; >days rejects | ✅ (exact-equal accepted not tested) |
| No-split payment clean | service `records an unallocated payment`; contract default `[]` | ✅ |
| Legacy row read-back untouched | schema-migrations `backfills days=30 ... without touching amounts` + `mapEmployeeSalaryPayment` | ✅ |
| WEEKLY not offered | salary-days `leaves weekly unprorated`; web `resolveSalaryPaymentPeriod(...WEEKLY)→null` | ⚠️ helper-only; no selector/dialog assertion |

## 2. Pattern diversity
Good. Pure-unit (contracts), service-level (in-memory harness), schema-string/SQL-shape, real SQLite migration integration (`better-sqlite3`), web pure helpers. Not one pattern.

## 3. Duplicate coverage
- Proration asserted at 3 layers (contract / service / web) — intentional layering, not harmful.
- "unallocated" asserted in service and contract (defaults) — minor overlap.
- `computeUnallocatedDays` (web) re-expresses service `allocatedDays > days` rule — parallel logic, untested against service.

## 4. Missing
1. **AddSalaryPaymentDialog** (~257 lines changed) has ZERO tests: over-allocation warning that blocks submit, live re-derivation of line defaults until a line is hand-edited, explicit unallocated-remainder line. This is the largest untested surface and holds the reconciliation UX mandated by the issue.
2. **Sliding days** scenario (late assignment correction moving days p1→p2) — no test at any layer.
3. **Exact reconciliation boundary** (split sum == days) accepted by the service — only `<` and `>` tested.
4. **WEEKLY non-offering at the UI selector**, and the "legacy WEEKLY employee keeps the option" carve-out — only the pure `resolveSalaryPaymentPeriod` guard is exercised.
5. End-to-end wiring of `deriveSalaryProjectDays` + `computeProposedSalaryAmount` into the form/dialog (proposal cannot drift claim) — untested.

## Residual risk
Highest risk is #4.1: financial reconciliation and over-allocation blocking live entirely in untested dialog code. Next is the sliding-days rule, which is core to the issue's motivation.

## Test quality reviewer (raw)

# Test quality review — #412 (salary days + per-project split)

Scope: the 5 changed test files at `e07939a` + `988493d`. READ-ONLY review; no file edited.

## Grade: B (high B, borderline A)

Reasons: assertions are overwhelmingly exact-value, negative paths are real and
numerous, and the API/migration tests exercise a genuine harness rather than
mocks — but one assertion is tautological, one test name over-promises, and two
documented/error branches are unverified.

## Correct (strengths)

- `packages/contracts/src/salary-days.test.ts` — no `toBeTruthy`/loose matchers;
  every case pins a concrete number (`toBe(27000)`, `toBe(3.33)`). Negative paths
  are genuinely adversarial: unparseable timestamp, inverted period, `days: 0`,
  `days: 2.5`, window entirely outside the period, all-zero line dropped, rounding
  overshoot assigned to the largest line, deterministic ordering (`a` before `b`).
  The `#412` contract block asserts schema defaults AND wire rejection.
- `apps/web/.../salary-payment-form.test.ts` — exact `.toEqual` on period
  boundaries, plus negative paths (WEEKLY → null, unknown period, bad date,
  over-allocation → `-1`, unknown days → null). Feb 2028 leap case included.
- `apps/api/.../workforce.service-coverage.test.ts` — real `createHarness`
  service; error cases assert `toThrowError(CompanyError)` for over-allocation,
  ghost project, duplicate project, non-positive/fractional days, `NaN` amount.
- `schema-migrations.test.ts` — the strongest test here: drops the column,
  inserts a legacy row, re-runs `ensureDatabaseSchema`, then checks backfilled
  `days === 30` alongside untouched amounts and `mapEmployeeSalaryPayment`.
  It cannot pass vacuously; `await` handling is correct (no floating promises).
- Isolation is sound: `createCompanyHarnessTracker()` closes DBs in `afterEach`;
  each new case uses a distinct phone (`055400020x`), so no cross-test leakage.

## Notes (not blockers)

1. `workforce.service-coverage.test.ts:~1240` — `expect(allocated).toBeLessThan(payment.days)`
   is tautological after the exact `toEqual` above (20+5=25 < 30 by construction).
   Prefer `expect(allocated).toBe(25)` / `computeUnallocatedDays`-style exact value.
2. `schema-definitions.test.ts` — `expect(splitDef).toBeDefined()` is redundant
   before the `toContain` calls, and the two index checks via `.some(...)` →
   `toBe(true)` report no offending value; matching the specific definition would
   fail with better output. The name "adds an idempotent `days` column" claims
   idempotence that this file does not exercise (it is exercised in the migration
   test), so the name over-promises locally.
3. Unverified documented behaviour: the `deriveSalaryProjectDays` doc says
   "overlapping projects (coverage > 100%) can exceed `days`" — no test drives two
   *different* projects whose coverage sums above the period; only same-project
   overlap is covered. Also only an invalid `startDate` is tested; the invalid
   `endDate` branch (`if (!windowEndKey) continue`) is uncovered.
4. `apps/api/.../schema-migrations.test.ts` asserts the split table only via
   schema strings; the `days > 0` CHECK and `ON DELETE CASCADE` are never
   exercised at runtime.
5. Fixture duplication: contracts re-implements web's `toAlgeriaDayBoundaryIso` as
   a local `algeriaDay` mirror. I verified it matches (`start` = 23:00Z prev day,
   `end` = 22:59:59.999Z); still a silent-drift risk if web's helper changes.
6. `workforce.service-coverage.test.ts` is 1336 lines with per-test inline
   employee/project setup; the new local `createPaidWorker`/`createProject`
   helpers help, but a shared factory (as in `company.test-helpers.ts`) would cut
   the repetition further.

No blockers. Tests were not executed in this pass (review budget).
