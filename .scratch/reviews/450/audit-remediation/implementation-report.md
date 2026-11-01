# #450 audit remediation handoff

Read this as an implementation report, not an independent review verdict.

## Checkout and scope

- Tree: `D:/worktrees/tuari_react_hono/t3-6557dc2c`.
- Branch: `agent/450-audit-remediation`, newly created from local object `73bfeb9a36fc4538207ad0c2a1ac56bdad6bad34`.
- Mode: local-only implementation child, HIGH-ASSURANCE. Parent owns publication and independent review. No subagents, paid reviews, pushes, PR changes, merges or new packages.
- Fixed remediation base: `73bfeb9a36fc4538207ad0c2a1ac56bdad6bad34`. Local `develop` resolved to `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`; it was not substituted for the requested base. The earlier follow-up remains an ancestor.
- Parent inputs, read-only: `D:/projects/tuari_react_hono/.scratch/sessions/477-test-audit-{edge,quality,coverage}-r2.md`. Those original outputs reviewed `73bfeb9a36fc4538207ad0c2a1ac56bdad6bad34` against `338cbde3c9b3a5645c98e86f9bdd70a15a41d6b6`. They are not verdicts on this remediation.

No parent or sibling source tree was edited. No extra worktree was created. A stale empty index lock in the shared Git metadata for this worktree blocked the first staging attempt. After confirming no `git.exe` process was running, only `.git/worktrees/t3-6557dc2c/index.lock` was removed. The parent checkout's index was not touched. Every shell command changed to the prepared absolute tree first. Fractional UI UX, shared rounding extraction #480 and fleet #491 remain outside the parent-approved scope.

## Accepted findings and changes

1. Picker query discrimination now uses a `vi.hoisted` spy. Both warehouse and project cases assert the selected source field and the opposite field explicitly undefined. The empty initial warehouse selection is asserted too. Existing distinct definition, entry, unit and balance IDs, independent row selection and disabled-row deduplication assertions remain intact.
2. Exact split fulfillment now queries the raw balance table. The only surviving row is `bal-full-0` with quantity `0.0000004`, proving `bal-full-1` and `bal-full-2` are physically absent. The test title and comment explicitly say the repository excludes dust upstream; this does not exercise the allocator's zero-row skip.
3. Availability fixtures now wire real `CompanyService` and `SqliteCompanyRepository` to the inventory connection. Both source types observe OPENING `500`, PAYMENT `-200`, earlier stock `5 -> 4` and movement `1` before a split shortage. Full raw snapshots then require stock, assets, accounts, debt entries, movements, headers and items to equal their pre-call state. A separate TEMP trigger aborts before transfer-item insertion on an otherwise fulfillable request, after observing that the header, stock mutation and both debt entries really exist. Everything rolls back.
4. Service-level coverage pins `0.0000005 -> 0.000001`, `0.000001 -> 0.000001` and `0.1000005 -> 0.100001`, stored quantity equal to movement, literal expected stock and unchanged caller input. Invalid SECOND quantities `NaN`, `Infinity`, `-1`, `0` and `0.0000004` identify `items.1.quantity`, call neither debt method, and leave all observed tables unchanged. Upward-rounded legacy rows produce movements `[1.000002, 0.000001]` and remaining `1.000001`. Repeated lines `0.1000004` each persist/move `0.1` against stock `0.2`; stock `0.199999` rolls back completely, including real debt writes.
5. The pre-existing large-magnitude allocation defect has a failing baseline regression and a transaction-local fail-closed guard. Boundary tests cover accepted and rejected deductions, plus loss from the remaining-request subtraction. Normal fractional behavior remains green.

Findings 1 through 4 were missing proof or assertion quality, not newly demonstrated production failures. Only finding 5 is claimed as a reproduced production defect.

## Exact representability policy

For each candidate movement, keep the existing six-decimal normalization and compute:

```ts
consumed = roundQuantity(Math.min(normalizedBalance, remaining))
left = roundQuantity(normalizedBalance - consumed)
nextRemaining = roundQuantity(remaining - consumed)
```

Before writing stock or movement, require both remainders to be finite, nonnegative and strictly smaller than their respective prior values. Also require:

```ts
roundQuantity(normalizedBalance - left) === consumed
roundQuantity(remaining - nextRemaining) === consumed
```

A violation throws `InventoryError` with code `BUSINESS_RULE` inside the existing outbound transaction. Earlier stock, movement and debt work rolls back. This is an operation-specific storage-precision invariant, not exact binary equality of raw deltas and not a public magnitude limit.

Examples in the tests:

- `1e12` stock cannot fund a `0.000001` movement because subtraction leaves stock unchanged. An earlier valid item is rolled back too.
- One quantum near `2 ** 32` and `2 ** 33` succeeds when its normalized reverse delta is one quantum. At `2 ** 34`, one quantum is rejected but two quanta succeed.
- A two-quantum deduction at `2 ** 35` and a `0.0001` deduction at `1e12` are rejected because their normalized deltas remove the wrong amount.
- Deducting `2` from `1e12` succeeds. Deducting `1` fails closed because the existing normalizer yields `999999999999.0001`, whose normalized reverse delta is not `1`. This intentionally does not rewrite the global helper.
- Allocating a tiny first row against a `1e12` remaining request is rejected when the request subtraction cannot decrease, preventing an extra tiny movement from being hidden by lost request precision.

No schema, public contract or dependency change was required. The inbound allocator is unchanged.

## Red and green evidence

The baseline test was added while `inventory.service.ts` still matched the requested base. `representability-red.log` records **1 failed, 26 skipped**: the expected rejection did not occur. The failing expectation is at the real service seam, not a fabricated missing-test failure.

After adding the invariant, `representability-green.log` records **27 passing availability tests** at that stage. The final expanded source passes **162 inventory tests across 9 files** and **9 web tests across 2 files**. These totals overlap earlier focused runs and must not be added to them.

During test construction, three fixture diagnostics were retained honestly:

- `fixture-diagnostic-busy.log`: the first observer queried SQLite from inside a callback while a statement was busy. The observer now receives JSON assembled in the trigger SQL instead.
- `fixture-diagnostic-column.log`: the first observer used the legacy column name `signed_amount_dzd`; the production schema uses `signed_amount`.
- `fixture-diagnostic-boundaries.log`: an initially assumed accepted large deduction was unsafe under the current normalizer, and the legacy-row assertion initially relied on the repository's reverse chronological read order. The matrix now rejects that deduction; allocation order is asserted with raw insertion order and concrete entry IDs.

Those logs are test-authoring failures, not production regressions. `debt-proof-green.log` records the corrected **3 passing real-debt rollback cases**.

## Verification

All commands ran from the absolute prepared tree. Tests used `--maxWorkers=1`; no test jobs overlapped. Heavy commands used `heavy_run`. Queue measurements before heavy launches reported total CPU `0%`; no heavy launch occurred near the forbidden threshold. One test worker targets the requested low CPU share, but this report does not claim a measured hard process CPU cap.

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Exit 0, lockfile unchanged, no dependency changes | Session tool output |
| API and web contracts realpaths | Both resolve to this tree's `packages/contracts` | Session tool output |
| `pnpm --filter @tuari/contracts build` through `heavy_run` | Exit 0, tree-local JS and DTS output | Session tool output |
| Inventory suite through `heavy_run`, `vitest run src/modules/inventory --maxWorkers=1` | 162 passed, 9 files, final production source | `inventory-suite-final.log` |
| Picker and outbound page tests, `--maxWorkers=1` | 9 passed, 2 files | `picker-focused.log` |
| API and web package `typecheck` | Both exit 0 | `api-typecheck-final.log`, `web-typecheck.log` |
| API and web package `lint` | Both exit 0 | `api-package-lint-final.log`, `web-package-lint.log` |
| `pnpm check:unslop` | Error tier clean; existing advisory warnings remain | `prose-check.log` |
| `git diff --check` on source/docs | Clean after removing a trailing blank line in wisdom | Session tool output |

`api-focused.log` also records 63 passing tests across the availability, debt-sign and helper files before the final nonnegative-remainder condition was added. The final inventory-suite run includes those same files after that condition. Raw console logs retain their terminal blank lines. Their staged whitespace check disables only `blank-at-eof`; source/docs use the normal whitespace check. Generated dependencies and contracts `dist` stay ignored and unstaged. `status-before-commit.log` records that check.

Verified production/test blob IDs:

```text
b774d2a385ae59d3a9219192c628cabc1c16e569  apps/api/src/modules/inventory/inventory.service.ts
ab158aa9586c0d191f24867f0d46c4a0474d8033  apps/api/src/modules/inventory/outbound-transfer-availability.test.ts
46473c027392d9c875ad68f2097099b2774d47c6  apps/web/src/features/inventory/multi-source-item-picker.test.tsx
```

## Files and remaining gate

The remediation changes the inventory service, its availability integration tests and the picker render test. It also updates `.scratch/implementation/450-design.md` and records the precision lesson in `.agents/wisdom/architecture.md`. All new verification logs and this report live only under `.scratch/reviews/450/audit-remediation/`.

Guard Phase 1 is bounded by the parent's focused-check authorization. Contracts build, relevant tests, package typechecks and package lints pass. Full API/web suites, root-wide checks, browser/E2E and application builds were not run and remain parent-scheduled validation; Rust is unchanged. Guard Phases 2 and 3 are not green because fresh final-source HIGH-ASSURANCE reviews are not performed by this child.

The parent must run fresh debate, test-audit, Standards/Spec code-review and applicable design review on the committed final source. Existing historical debate and reviewer outputs were not renamed, copied as current verdicts, or claimed to cover these changes. No publication or merge readiness is claimed.

Next: inspect this branch's committed diff against `73bfeb9a36fc4538207ad0c2a1ac56bdad6bad34` and dispatch the final-source review.
