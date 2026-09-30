# #414 — verification review of PR #462's head

mode: remote
ticket: AmaraNecib/tuari_react_hono#414 (PR #462, `feat/project-cost`)
reviewed code HEAD: `6b19b673eaba3ba18641d07fc8b239d58d6c94e4`
fix SHAs: `4bc03298` (test hardening), `6b19b673` (share cap + coverage gate)
base for the PR diff: `origin/develop` @ `4fcb844f`, merge-base `bfb87fbd`
tier: High-assurance (financial aggregation)

The lifecycle reviews under this directory are named for `d06ffee0`, an
orphaned pre-rebase commit, and they predate `85fdbf2e` (the netting rule) and
`790d79d1` (show-and-warn). They did not run on this head. This report is the
verification that did; it supersedes `4bc03298-verification.md`.

## Findings

| # | Severity | Finding | Verdict |
| --- | --- | --- | --- |
| 1 | Low (provably wrong) | Contract test titled "requires a project id **and refuses a negative computed total**" asserted the opposite (a negative total parses) — a surviving claim of the removed refusal. | **Fixed** `4bc03298`: renamed; added the negative-side part bound. |
| 2 | Low (test gap) | The `sortByDateDesc` id tie-break was exercised only for expenses; salary/stock/material accessors were never compared. | **Fixed** `4bc03298`: three rows per source, two sharing a date. |
| 3 | Low (test gap) | `toFailureResult`'s rethrow branch had no test. | **Fixed** `4bc03298`: `project-cost.errors.test.ts`. |
| 4 | Low (evidence) | `design-pass.md`'s "Re-pin" cites the pre-rebase SHA `94d5a202`. | **Accepted** by the parent; this report is the current evidence. |
| 5 | Low (display) | A negative material net makes a positive part larger than the total, so the share label rendered `118%` — a wrong number on screen. | **Fixed** `6b19b673` (parent decision). |
| 6 | Low (process) | The new `project-cost` module was outside the API coverage `include`, so the CI 100% gate did not guard it. | **Fixed** `6b19b673` (parent decision). |

### Fix 5 — cap the displayed share at 100%

`project-cost-section.tsx` now computes `Math.min(100, Math.max(0, Math.round(value / total * 100)))`.
**Approach taken: clamp the resulting percentage**, not re-base it on a
non-negative denominator. The denominator approach would silently redefine
"share of the total" into "share of the positive parts" exactly when the
material net is negative, so the label would no longer describe the number the
page is built around. A display cap keeps the meaning (the share of the plain
arithmetic total) and only refuses to print a figure above 100%; the total and
the netting are untouched, and the existing warning explains why a part can
exceed the total. When every part is non-negative the clamp is a no-op.

**Red proof:** the new web test `caps every source share at 100% when a
negative net inflates a positive part` was run against the pre-fix component
(`git show 31c9b308:…`): exit 1, failing on `expect(queryByText("118%")).toBeNull()`
with "118%" found. Restored; 11/11 pass on the fixed component.

### Fix 6 — put the module under the coverage gate

`apps/api/vitest.config.ts` `coverage.include` now lists
`src/modules/project-cost/**/*.ts`. The config's existing exclusions
(`**/*.types.ts`, `**/adapters/**/*.ts`, `**/*.test.ts`) keep the adapter and
types out, so only `project-cost.service.ts` and `project-cost.errors.ts` join
the gate — both at 100% after `4bc03298`. No file outside the PR needed a
change.

## Verification of the five points

1. **The owner's netting rule — `PASS`.** `netMaterialCost` sums `IN` and
   subtracts `OUT`; the adapter reads consumable movements in either direction
   and excludes a same-project no-op; value is `roundMoney(unitPriceDzd ×
   quantity)`. `apps/api/src/tests/integration/project-cost-materials.test.ts`
   runs the owner's 500-DZD/bag example through the **real** `InventoryService`,
   the real sqlite adapter and the real `ProjectCostService` (0 → 5 000 → 5 000
   on physical use → 3 500 → A 2 500 / B 1 000), and its consistency case
   reduces the inventory module's own `listMovementValuations()` and asserts
   the service figure **equals** that reduction (2 500). That is what makes the
   cost figure impossible to drift from the movements.
2. **Honest terminology — `PASS`.** The fourth source is
   `المواد المحمّلة على المشروع` in the UI, contracts, service/port comments and
   the design record. No `consumed`/`مستهلكة` label remains in the cost surface
   (the only `مستهلكات` hit is `reports.consumableTransfers`, a transfer count).
   The contract rejects a `CONSUMED` direction.
3. **No double count — `PASS` (structural).** `parkedInventory` has no
   consumables field at all; `getProjectParkedAssets` reads only
   `inventory_asset_unit.current_project_id`; the service never adds parked to
   the total. The integration test asserts `"consumables" in parkedInventory`
   is false while the same consumable is charged.
4. **Show-and-warn — `PASS`.** A negative net renders the screen, shows
   `-1,500 دج`, shows the Arabic warning, and the total is the arithmetic sum
   (8 500). No test asserts a refusal; the misleading refusal title is fixed.
   The contract accepts a negative part and bounds it on both sides, asserted
   for the part as well as the total.
5. **What the reviews missed — no high/medium.** Each of the four queries reads
   what the owning module writes (expense `status='LIVE'`; split × payment;
   `inventory_asset_charge status='LIVE'`; consumable `inventory_movement`
   valued at `inventory_entry.unit_price_dzd`). No-activity, voided-expense and
   null-entry-price cases behave as designed; fractional `splitDays` is
   unreachable (the write module enforces `Number.isSafeInteger`). Every money
   figure carries a sign or a direction, and the share cap closes the one
   display artifact.

## Commands

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | exit 0 |
| `pnpm --filter @tuari/contracts test` | exit 0 — 5 files, 223 tests |
| `pnpm --filter @tuari/api exec vitest run src/modules/project-cost src/tests/integration/project-cost-materials.test.ts src/rpc/router.test.ts` | exit 0 — 6 files, 80 tests |
| `pnpm --filter @tuari/api test:coverage` (gate now includes project-cost) | **exit 0 — 87 files, 1571 passed / 2 skipped; 100% statements (1901/1901), branches (1479/1479), functions (458/458), lines (1808/1808)** |
| `pnpm --filter @tuari/api test` (clean full run at `4bc03298`) | exit 0 — 87 files, 1571 passed, 2 skipped |
| `pnpm --filter @tuari/api test` (first run, other-lane load) | exit 1 — only `beforeEach` hook timeouts in `auth/recovery-key.service.test.ts` (5) and `update/update-history.service.test.ts` (4); those files isolated → exit 0 (35 tests), confirming load |
| `pnpm --filter @tuari/web exec vitest run src/features/projects/project-cost-section.test.tsx` | exit 0 — 11 tests (was 10; the new share-cap test) |
| same web file against the pre-fix component (red proof) | exit 1 — 1 failed (`118%` found), 10 passed |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm check:unslop` | exit 0 (1676 warn / 0 error) |
| Playwright | **skipped** — the PR ships no project-cost E2E (documented deferral) and another lane may hold the ports |

## Scope note

The parent approved both deferred lows. No production money logic changed: the
netting, the parked separation, the money bounds and the total are untouched.
Fix 5 is a display cap, fix 6 is a coverage-gate entry.
