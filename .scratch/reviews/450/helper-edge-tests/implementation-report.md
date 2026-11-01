# #450 helper edge tests

## Checkout

- Worktree: `D:/worktrees/tuari_react_hono/t3-1397b650`
- Branch: `agent/450-helper-edge-tests`
- Base: `35bb9e2ed2ad3260254db68f6c1785956f425f73`
- Test commit: `e52eabf5dc1aae5eb5ffdba16555e5b6bf38f2d6`
- Ancestry: the base commit's parent is source commit `b7b8062ad68bd98d7727d337efedaa5b24f3c01b`. The base commit changes only `.scratch/reviews/450/micro-conservation/*`. PR #477 head `338cbde3c9b3a5645c98e86f9bdd70a15a41d6b6` is an ancestor.

## Change

Added direct assertions that `normalizedQuantityMicroUnits(-1.25)` returns `-1_250_000n` and zero returns `0n`. The helper implementation is unchanged. These inputs are outside service-accepted requests; this adds helper-contract coverage, not a production fix.

## Verification

- `pnpm install --frozen-lockfile`: exit 0; `package.json` and `pnpm-lock.yaml` unchanged. The worktree had no installed `node_modules` before this setup step.
- `pnpm --dir apps/api exec vitest run src/modules/inventory/inventory.helpers.test.ts --maxWorkers=1`: exit 0, 1 file and 5 tests passed. Output: `focused-test.log`.
- Pre-commit checks passed: `check:web-tracking` and `check:web-hygiene` (9/9).
- `git diff --check`: clean. The only source diff is `inventory.helpers.test.ts`; `inventory.helpers.ts` is unchanged from base.
- No full or heavy suite was run, as requested.

The report and test log are committed in a scratch-only evidence commit after the test commit. The final branch HEAD is recorded in the handoff.
