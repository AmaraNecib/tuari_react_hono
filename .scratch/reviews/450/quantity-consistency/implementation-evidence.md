# Quantity consistency implementation evidence

Implementation child, not an independent review. No debate, test-audit or
code-review verdict is claimed by this file. Parent owns those gates.

## Boundary and state

- Tree: `D:/worktrees/tuari_react_hono/t3-004d9b35`.
- Branch: `agent/450-quantity-consistency`.
- Pinned base: `338cbde3c9b3a5645c98e86f9bdd70a15a41d6b6`, fetched and verified as `origin/fix/450-outbound-entry-id` before creating the branch.
- Tier: HIGH-ASSURANCE. Local implementation commit only, no publication.
- All shell commands after intake started with `cd D:/worktrees/tuari_react_hono/t3-004d9b35`.

## Findings supplied by parent

1. 'P2: outbound records persist a different quantity from the movement' — inventory.service.ts:1148,1203 and adapters/sqlite-inventory.repository.ts:914: 'The service normalizes item.quantity for consumption, but passes the original input.items to persistence. A request for 0.1000004 consumes and records a movement of 0.1, while the outbound transfer item stores 0.1000004.' Fix: normalize item array once; use it for both consumption and transfer persistence. Pin returned/stored quantity == movement == balance delta.
2. 'P2: split-balance rounding can commit an incompletely fulfilled transfer' — inventory.service.ts:1041-1069: 'Availability rounds the combined raw balances, but consumption rounds each balance separately. The loop never checks that remaining reaches zero.' Reproducer balances [1.0000014,1.0000014], request 2.000003 => available 2.000003, movements [1.000001,1.000001], remaining 0.000001. Fix shared per-balance precision model between availability and allocation, and transactional guard against surviving normalized remainder. Assert complete fulfillment OR complete rollback.
3. 'P2 coverage gap: the changed V2 picker has no behavioral regression test' — multi-source-item-picker.tsx:53-100. Add render test with DISTINCT definition, entry, balance, unit IDs; selection emits definition IDs while optionId independently deduplicates two rows of one definition. Missing test itself is not evidence of a production bug.

## One evidence line per finding

1. Quantity persistence: `pnpm --filter @tuari/api exec vitest run src/modules/inventory/outbound-transfer-availability.test.ts --maxWorkers=1 -t 'persists the normalized outbound'`, RED on unchanged pinned service, exit 1, 1 failed/22 skipped; GREEN after item-array normalization, exit 0, 1 passed/22 skipped. Logs `450-quantity-red.log`, `450-quantity-green.log`. Stored 0.1, movement 0.1, source 0.5 to 0.4, optional price 23 preserved, caller remains 0.1000004. Returned envelope has no quantity field; persisted rows are read by returned transfer ID.
2. Split allocation: `pnpm --filter @tuari/api exec vitest run src/modules/inventory/outbound-transfer-availability.test.ts --maxWorkers=1 -t 'split.balance|normalized split'`, RED on unchanged pinned service, exit 1, 2 failed/1 passed/23 skipped; final `pnpm --filter @tuari/api exec vitest run src/modules/inventory/outbound-transfer-availability.test.ts src/modules/inventory/inventory.helpers.test.ts --maxWorkers=1`, exit 0, 30 passed in 2 files. Logs `450-split-red-final.log`, `450-api-green.log`. Both warehouse and project shortage paths roll back an earlier valid item, all movements, transfer headers and item rows; exact normalized sum fulfills completely.
3. V2 picker: `pnpm --filter @tuari/web exec vitest run src/features/inventory/multi-source-item-picker.test.tsx src/features/inventory/outbound-transfer-create-page.test.tsx --maxWorkers=1`, exit 0, 9 passed in 2 files. Log `450-web-green.log`. New picker test has 2 cases, distinct definition/entry/balance/unit IDs, two units of one definition and two balances of another. Only selected concrete rows disable; callbacks emit definition IDs. Picker production code is unchanged from pinned head, so this added coverage passes the baseline. There is no fabricated RED production defect for a missing test.

## Dependency and command evidence

Initial `pnpm install --frozen-lockfile` installed packages but timed out at 120 seconds
before returning success. Retrying the same command exited 0 in 7.8 seconds,
including Husky prepare, with no package or lockfile changes. The install warned
that some dependency build scripts were ignored; applicable SQLite tests still
ran successfully without any approval bypass or package addition. The successful
install output is `450-install.log`.

Both API and web `node_modules/@tuari/contracts` realpaths were inspected before
tests and again before handoff. Both point to this tree's `packages/contracts`.
Neither links to the source root or another checkout.

`heavy_run` label `450 isolated contracts build` ran
`pnpm --filter @tuari/contracts build`, exit 0, before the CPU-policy update.
No further heavy job was started. Log `450-contracts-build.log`.

Focused baseline API command, before any production edits:
`pnpm --filter @tuari/api exec vitest run src/modules/inventory/outbound-transfer-availability.test.ts src/modules/inventory/inventory.helpers.test.ts --maxWorkers=1`,
exit 0, 26 passed in 2 files. Log `450-api-baseline.log`.

`pnpm typecheck`, exit 0, 4 successful Turbo tasks, 2 cached. API/web TypeScript
checks executed in this tree. Contracts/desktop task output was replayed from
Turbo cache, including an old desktop path in cached output; no foreign checkout
was invoked by this child. This is not a fresh Rust validation claim.
Log `450-typecheck.log`.

`pnpm lint`, exit 0, 2 successful uncached package lint tasks plus root checks.
Unslop reported 1702 warnings and 0 errors, with PASS. Log `450-lint.log`.
`git diff --check`, exit 0 for source/design before logs were staged.
The later all-file cached check exits 2 on untouched raw console logs, which
contain trailing spaces and blank final lines. Preserve those logs verbatim;
`git diff --cached --check -- '*.ts' '*.tsx' '*.md'` is the source/prose gate.

An ignored-file scan timed out and left this worktree's empty `index.lock`.
After confirming there were no remaining `git.exe` processes, the lock was moved,
not deleted, to `.scratch/sessions/450-quantity-consistency/preserved-index.lock`.
The first staging attempt failed with exit 128 before any staging; the retry
succeeded. No source-root or sibling-worktree index was touched.

The first split test run, `450-split-red.log`, includes a mistaken assertion that
the public balance list exposes a sub-quantum row. Inspection showed its existing
`quantity >= QUANTITY_MIN` filter excludes it. Corrected that assertion before
rerunning against pinned production code in `450-split-red-final.log`. Both logs
are preserved; the first is not the final red proof.

## Guard pre-commit and pre-report

Local checks run and green: frozen install, contracts build, typecheck, lint,
focused API and web tests, diff whitespace check. The commit hook runs web
tracking/hygiene checks, and its actual result is recorded in the commit log.

Deferred by explicit parent CPU policy: full API suite, full web suite, additional
builds and browser/E2E validation. No full-suite pass is claimed. Parent must
coordinate sustained headroom, then route heavy work through `heavy_run` with
limited workers. Rust source is unchanged.

Parent-owned gates still pending: independent debate, test-audit, code-review,
and publication. Existing verdicts have not been relabeled or fabricated.
This is a bounded implementation handoff, not a claim that the complete
HIGH-ASSURANCE publication gate is green. The parent explicitly reserved these
gates and deferred heavy validation. No push, PR, paid review, merge or issue
closure was attempted.

## Fractional UI follow-up, excluded by parent

`multi-source-item-picker.tsx:100` starts selections at 1; line 115 clamps edits
with `Math.max(1, quantity)`; line 246 renders `min="1"` with no fractional step.
A consumable balance below one starts above its maxQuantity, and ordinary
fractional inputs cannot be entered reliably. `git show` of the pinned base
confirms all three predate this follow-up. Proposed separate follow-up is
consumable-specific default/min/step behavior plus render tests for below-one
stock and fractional edits, while retaining integer asset quantities. No API
or schema migration is needed; no dependency on #480 or #491; no lane reorder.
This UX is unchanged under the parent's explicit scope decision.

## Durable lesson for parent wisdom capture

Availability must sum the same per-row normalized quantities allocation spends.
Rounding the raw aggregate can promise an extra storage quantum. Regressions
should check persisted item quantities as well as movement quantities, because
a correct stock deduction alone does not prove the transfer record is consistent.
This lesson is recorded here to avoid editing shared wisdom files in the bounded
lane; parent can distill it when integrating the reviewed change.
