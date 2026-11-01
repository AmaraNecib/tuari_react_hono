# #450 availability precision follow-up

## Scope and ancestry

- Worktree: `D:/worktrees/tuari_react_hono/t3-af2f7992`
- Branch: `agent/450-availability-precision-r3`
- Base: `546be3e5a98627984218bf8474895036219835a7`
- Remote PR #477 head at intake: `338cbde3c9b3a5645c98e86f9bdd70a15a41d6b6`
- Ancestry verified: `546` parent is `73bfeb9a36fc4538207ad0c2a1ac56bdad6bad34`; `73` parent is the actual `338` SHA; `338` is ancestor of `546`.
- Mode: isolated implementation child. No push, PR mutation, merge, reviewer dispatch, paid review, package change, or parent/sibling edits.
- Resource sample before heavy test launch: 16.1 GB free of 34 GB, CPU 0%, heavy queue empty (capacity 5). Focused inventory suite ran with one worker through `heavy_run`.

## Fix

Removed the aggregate `available` precheck in `consumeConsumableFromSource`. It rounded one IEEE-754 sum of individually normalized balances, which rejected `[4294967296, ...Array(12).fill(0.000001)]` for request `4294967296.000012`, even though guarded sequential allocation could deduct the large row and all 12 micros exactly. Per-row six-decimal normalization and both guarded stock/request subtraction checks remain. The final `remaining > 0` check still throws the friendly insufficient-stock `BUSINESS_RULE` inside the outbound transaction.

The successful regression asserts raw balance rows are gone, stored outbound-item quantity equals the request, and all 13 movement entry IDs/quantities match. It asserts the repository's `createdAt, id` ordering, with explicit unique timestamps for large and micro rows and zero-padded IDs within the micro timestamp.

The second regression is coverage, not a newly found production defect. `[8589934592, 0.000001]` appears to total `8589934592.000002` as a Number, so the removed precheck accepted it. The first row leaves a representable request remainder of two micros; the micro row leaves one. Both local deduction guards pass. The test observes both movements and the unpaid final micro before the final remainder guard throws. It then compares raw snapshots of stock, debt accounts/entries, movements, transfer headers, and transfer items to prove rollback. A mutation probe that removed only the final remainder check failed this test at the expected `toThrow`, confirming it discriminates that guard.

## Red and green

- Regression against pinned base `546`, before production edit: `red.log`, exit 1; 1 failed, 51 skipped. It failed with the friendly insufficient-stock error at the aggregate precheck.
- After production edit: `green.log`, exit 0; 1 passed, 51 skipped.
- Final remainder guard test: `final-remainder-guard.log`, exit 0; 1 passed, 52 skipped.
- Mutant with only the final remainder check removed: `final-remainder-mutant.log`, exit 1 at the expected `toThrow` because allocation returned instead of rejecting.
- Inventory module suite: `inventory-suite-final-rerun.log`, exit 0; 164 tests across 9 files passed, maxWorkers 1.
- API typecheck: `api-typecheck-final.log`, exit 0.
- API lint: `api-lint-final.log`, exit 0.
- Prose gate: `prose-check.log`, exit 0; error tier clean. Existing repository-wide warnings remain advisory.
- Contracts build: `contracts-build.log`, exit 0. API and workspace contracts resolve to this worktree's `packages/contracts`.
- Console logs retain their original terminal blank lines. The staged whitespace check disables only `blank-at-eof` for those logs; source and Markdown use the normal check.

Diagnostics retained: `contracts-dist-missing.log` records an initial test invocation before contracts dist existed. `inventory-suite.log` records an initial suite run where two existing rollback observer tests expected one movement event; after the aggregate check removal, allocation correctly reached the final remainder check after three movements. Assertions now observe the intermediate writes and final failed attempt. The corrected complete suite is green. A first `final-remainder-mutant` run used a broken test condition (`8_589_934_592 + 0.000001` is floating-point-different from the rounded request); the test now compares with `roundQuantity`, and the retained mutant log is from the corrected test.

Full API/web suites, root typecheck/lint, browser/E2E, contracts/full builds, debate, test-audit, code-review and design review were not run. Parent owns the independent reviews and broader checks. This report is not a clean-review or merge-readiness claim.

## Changed files

- `apps/api/src/modules/inventory/inventory.service.ts`
- `apps/api/src/modules/inventory/outbound-transfer-availability.test.ts`
- `.scratch/implementation/450-design.md`
- `.scratch/reviews/450/availability-precision/` (commands' logs and this handoff)

No new global precision helper, schema magnitude bound, public contract, dependency, or package was introduced.
