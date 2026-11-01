# #450 micro-conservation implementation report

## Checkout

- Worktree: `D:/worktrees/tuari_react_hono/t3-b83e09ba`
- Branch: `agent/450-micro-conservation`
- Base: `43b87b72c768d69012c73a0ae8076a1cfaa3bafc`
- Final source SHA: `b7b8062ad68bd98d7727d337efedaa5b24f3c01b`
- Base verification: the source commit exists; the implementation commit's parent is the exact base SHA.
- PR #477 stayed OPEN at expected head `338cbde3c9b3a5645c98e86f9bdd70a15a41d6b6` at intake and before commit.
- The branch is local only. No push, PR mutation, merge, reviewer dispatch, paid review, dependency change, or sibling-tree edit.

## Change

`normalizedQuantityMicroUnits` parses the shortest decimal `String(value)` form into `BigInt` six-decimal units. It expands scientific notation and returns `null` for non-finite or non-micro-representable values. The allocator still uses `Number` and `roundQuantity` for normalization and subtraction.

Before stock or movement writes, the allocator keeps its finite, nonnegative, and strict-decrease checks. It now also requires exact normalized ledger deltas:

```text
micro(balance) - micro(left) = micro(consumed)
micro(remaining) - micro(nextRemaining) = micro(consumed)
```

A missing conversion or mismatch throws `BUSINESS_RULE` inside the transaction. The tests prove raw snapshots of stock, assets, debt accounts and entries, movements, transfer headers, and transfer items remain unchanged.

The two-row regression uses request `8589934592.000011`, oldest balance `0.000006`, and next balance `8589934592.000006`. Its expected movement units total `8589934592000012`, one micro more than the request's `8589934592000011`. It pins `createdAt` ordering and runs for both warehouse and project sources. A second fixture isolates the stock reverse delta: normalized stock changes by five micro-units for a six-micro movement even though the former rounded binary reverse subtraction reports six. Both fixtures require the specific `BUSINESS_RULE` and transaction rollback.

The existing `1e12 - 0.0001` case is now accepted: its normalized decimal values differ by exactly 100 micro-units. The old binary reverse subtraction rounded to 122 micro-units and rejected it. `1e12 - 1` remains in the rejection matrix. This is exact verification of normalized decimal representations, not arbitrary-precision allocation or support for every magnitude.

The project wrong-source parity test now asserts `appError.code === "BUSINESS_RULE"`. Movement sums in the large-success and final-remainder tests use the BigInt parser, not `Math.round(number * 1e6)`.

## Red and green

The first test attempt could not import contracts because the frozen install left `packages/contracts/dist` absent. `contracts-dist-missing.log` records that setup failure; it is not the RED result. After building contracts in this worktree, the regression ran against unchanged `43b87b72` production code.

- RED command: `pnpm --dir apps/api exec vitest run src/modules/inventory/outbound-transfer-availability.test.ts -t "rejects a micro-unit ledger mismatch" --maxWorkers=1`
- RED result: exit 1, 1 file, 2 failed and 53 skipped. Both warehouse and project cases received no error where the new test required `BUSINESS_RULE`. Log: `red.log`.
- GREEN command: `pnpm --dir apps/api exec vitest run src/modules/inventory/outbound-transfer-availability.test.ts src/modules/inventory/inventory.helpers.test.ts -t "micro-unit ledger mismatch|five-micro stock|converts normalized quantities" --maxWorkers=1`
- GREEN result: exit 0, 2 files, 5 passed and 57 skipped. Log: `green.log`.
- Focused inventory suite: `pnpm --dir apps/api exec vitest run src/modules/inventory --maxWorkers=1`, through `heavy_run`; exit 0, 9 files, 169 passed. This includes the 13-row success and final-remainder rollback. Log: `inventory-focused.log`.

## Verification

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Exit 0; no lockfile or package diff | `install.log`, `git diff -- package.json pnpm-lock.yaml` empty |
| `pnpm --filter @tuari/contracts build` through `heavy_run` | Exit 0; generated this worktree's `dist` | Tool output; contracts import resolved under this worktree |
| `pnpm --dir apps/api exec tsc --noEmit` | Exit 0 | `api-typecheck.log` |
| ESLint on the four changed API files | Exit 0 | `api-lint.log` |
| `pnpm --dir apps/api exec vitest run --maxWorkers=1` through `heavy_run` | Exit 0; 96 files, 1,743 passed, 3 skipped | `api-full.log` |
| `pnpm --filter @tuari/api build` through `heavy_run` | Exit 0 | `api-build.log` |
| `pnpm check:web-tracking` and `pnpm check:web-hygiene` | Both exit 0; hygiene 9/9 | `precommit-checks.log`; the commit hook also passed |
| `git diff --check` | Clean | Tool output |

Before each heavy run, `heavy_status` showed CPU at 0% and at least 16.1 GB free. Heavy jobs ran one at a time; Vitest used `--maxWorkers=1`. No process-attributable CPU trace was collected.

The repository unslop gate passed with zero ERROR-tier findings. It reported 1,702 advisory WARN-tier messages across 188 markdown files; `.scratch` reports are outside that scan. I reviewed this report and design against the unslop skill.

## Remaining gates

The parent owns the final review and publication. No final-source debate, test-audit, code-review, or design-pass verdict was produced by this implementation lane. Earlier evidence for `43b87b72` and its ancestors is stale for this change. The parent should review final source SHA `b7b8062ad68bd98d7727d337efedaa5b24f3c01b`.

The full web suite, root-wide typecheck/lint, and browser tests were not run. This API-only change has no UI behavior. No merge or issue closure is claimed.
