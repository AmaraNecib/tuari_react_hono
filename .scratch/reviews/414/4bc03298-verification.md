# #414 — verification review of PR #462's head

mode: remote
ticket: AmaraNecib/tuari_react_hono#414 (PR #462, `feat/project-cost`)
reviewed code HEAD: `af99be19af2ec8d538a86ec413aee81b6a9e17ed`
fix SHA: `4bc03298` (test-only; this report is an evidence-only commit on top)
base for the PR diff: `origin/develop` @ `4fcb844f`, merge-base `bfb87fbd`
tier: High-assurance (financial aggregation)

The lifecycle reviews under this directory are named for `d06ffee0`, an
orphaned pre-rebase commit, and they predate `85fdbf2e` (the netting rule) and
`790d79d1` (show-and-warn). They did not run on this head. This report is the
verification that did.

## Findings

| # | Severity | Finding | Verdict |
| --- | --- | --- | --- |
| 1 | Low (provably wrong) | `packages/contracts/src/index.test.ts` case was titled "requires a project id **and refuses a negative computed total**", but its body asserts a negative total parses (`-1` → success). That is a surviving claim of the removed refusal, and it contradicts what the test proves. | **Fixed** `4bc03298`: renamed to "accepts a signed-but-bounded computed total" and added the missing assertion that `chargedMaterialsDzd` is bounded on the negative side too (`-(MAX_SAFE_INTEGER+1)` → fail). |
| 2 | Low (test gap) | The `sortByDateDesc` id tie-break was exercised only for expenses. The salary/stock/material accessor pairs were never compared (single-row fixtures), so a wrong column in one accessor would not have failed any test. | **Fixed** `4bc03298`: a service test with three rows per source (two sharing a date) pins all three orderings. |
| 3 | Low (test gap) | `toFailureResult`'s rethrow branch (a non-`ProjectCostError`) had no test; only the map branch was covered via the router test. | **Fixed** `4bc03298`: a `project-cost.errors.test.ts` covers both branches. |
| 4 | Low (evidence) | `design-pass.md`'s "Re-pin" cites `94d5a202` — the pre-rebase SHA of `790d79d1`, not the branch head. No sibling evidence is pinned to the verified SHA. | **Reported.** This file is the fresh evidence; the stale re-pin is left to the owning lane/parent. |
| 5 | Low (display, not fixed) | In the negative-net case a positive part's share label can exceed 100%: the web test's own scenario (expenses 10 000, material −1 500, total 8 500) renders the expenses share as `118%`. The bar is clipped by `overflow-hidden`; the label is not. | **Reported, not fixed.** The owner's decision fixed the total (plain arithmetic sum) and clamped only the negative bar at 0; the percentage is display-only and the warning explains the anomaly. Re-normalising the shares would change owner-approved display behaviour. |
| 6 | Low (process, not fixed) | `apps/api/vitest.config.ts` `coverage.include` omits `src/modules/project-cost/**`, so the new money module is outside the CI 100% gate (`api test:coverage`). Scoped coverage was 90.69% stmts / 80.95% funcs for `project-cost.service.ts` and 83.33% for `project-cost.errors.ts`. | **Reported, not changed.** Other read modules (inventory, projects, debts) are also omitted, so this is gate scoping, not a defect. After the tests added in `4bc03298` the two files reach **100% statements/functions/lines** (branches inclusive; the excluded adapter keeps its policy branch gaps), so adding the include is now a one-line, zero-test change the parent can take. |

Verified and found **not** to be defects:

- **Fractional salary split days.** `splitDays` is `z.number().int().positive()` in the
  contract and the owning workforce service rejects a non-integer with
  `Number.isSafeInteger`. The project-cost read cannot see a non-whole share from
  any write path, and the salary module's own read would fail on one first. No fix.
- **Null entry price.** A consumable movement with no entry link (or a null
  `unit_price_dzd`) values at 0 and is documented as "honest 0, never an estimate"
  (`project-cost.service.test.ts` "values material movements at the entry unit price").
- **Same-project no-op movement.** Excluded in SQL and impossible from
  `transferConsumable` (`from === to` is rejected).

## Verification of the five points

1. **The owner's netting rule — `PASS`.** `netMaterialCost` sums `IN` and
   subtracts `OUT`; the adapter reads movements in either direction and excludes
   a same-project no-op; the value is `roundMoney(unitPriceDzd × quantity)`.
   `apps/api/src/tests/integration/project-cost-materials.test.ts` runs the
   owner's 500-DZD/bag example through the **real** `InventoryService`, the real
   sqlite adapter and the real `ProjectCostService` (0 → 5 000 → 5 000 on
   physical use → 3 500 → A 2 500 / B 1 000). Its second case reduces the
   inventory module's own `listMovementValuations()` and asserts the service
   figure **equals** that reduction (2 500). The consistency oracle replicates
   the sign rule rather than the netting code, which is what stops the figure
   drifting from the movements.
2. **Honest terminology — `PASS`.** The fourth source is
   `المواد المحمّلة على المشروع` in `ar.ts` (both the source label and the card
   title), the contract, the service/port comments and the design record. No
   `consumed`/`مستهلكة` label remains in the cost surface. The only `مستهلكات`
   hit is `reports.consumableTransfers` ("تحويلات المستهلكات"), a transfer count
   on the reports screen, not a consumption claim. The contract test
   `"labels material charged to the project, not consumed"` rejects a
   `CONSUMED` direction.
3. **No double count — `PASS` (structural).** `parkedInventory` has no
   consumables field at all; the port's `getProjectParkedAssets` reads only
   `inventory_asset_unit.current_project_id`, and the service never adds parked
   to the total. The integration test asserts `"consumables" in parkedInventory`
   is false while the same project's consumable is charged (`chargedMaterialsDzd`).
4. **Show-and-warn — `PASS`.** A negative net renders the screen, shows the
   negative figure (`-1,500 دج`), shows the Arabic warning, and the total is the
   arithmetic sum (8 500). No test asserts a refusal of a negative net; the one
   misleading refusal **title** is fixed (finding 1). The contract accepts a
   negative part and bounds it on both sides (`signedPaymentAmountSchema`), now
   asserted for the part as well as the total.
5. **What the reviews missed — no high/medium.** Each of the four queries reads
   what the owning module writes (expenses `status='LIVE'`; split × payment
   joins; `inventory_asset_charge status='LIVE'`; consumable
   `inventory_movement` by party, valued at `inventory_entry.unit_price_dzd`).
   No-activity, voided-expense, nullable-price and non-whole-day cases behave as
   above. All money figures carry a sign or a direction; the only display
   artifact is the >100% share label in the negative case (finding 5).

## Commands

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | exit 0 |
| `pnpm --filter @tuari/contracts test` | exit 0 — 5 files, 223 tests |
| `pnpm --filter @tuari/api exec vitest run src/modules/project-cost src/tests/integration/project-cost-materials.test.ts src/rpc/router.test.ts` | exit 0 — 5 files, 77 tests |
| `pnpm --filter @tuari/api test` (first, under other-lane load) | exit 1 — only `beforeEach` hook timeouts: `auth/recovery-key.service.test.ts` (5) and `update/update-history.service.test.ts` (4), the known load flakes |
| `pnpm --filter @tuari/api exec vitest run src/modules/auth/recovery-key.service.test.ts src/modules/update/update-history.service.test.ts` (isolated) | exit 0 — 2 files, 35 tests; confirms the failures were load, not code |
| `pnpm --filter @tuari/api test` (clean run after the fix commit) | **exit 0 — 87 files, 1571 passed, 2 skipped** |
| `pnpm --filter @tuari/web exec vitest run src/features/projects/project-cost-section.test.tsx` | exit 0 — 10 tests |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm check:unslop` | exit 0 (1676 warn / 0 error) |
| scoped coverage over `src/modules/project-cost/**` (`--coverage`, adapter excluded by policy) | `project-cost.service.ts` and `project-cost.errors.ts` **100% stmts/functions/lines** (72/72 stmts, 37/37 funcs); adapter 66.66% branches, excluded by policy |
| Playwright | **skipped** — the PR ships no project-cost E2E (`tests/e2e/project-cost.spec.ts` is a documented deferral), and another lane may hold the ports |

## Scope note

No production code was changed. The netting, the parked separation and the
money bounds were not weakened; the only source change is test hardening plus
the corrected refusal claim.
