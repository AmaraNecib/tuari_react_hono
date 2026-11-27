# #252 shared pagination test batch

## Scope and pin

- Worktree: `D:/worktrees/tuari_react_hono/t3-df4796eb-344707007568a70f`
- Branch: `test/nonfinite-page-size-defaults`
- Base: `cd8c18a1c77e0151fc3dd3beb5169532fe6a6d25`
- Verification mode: `focused-local / CI-final-pending`
- Review tier: Standard. This adds narrow regression tests for an unchanged shared utility. Three initial review lenses remain parent-owned.
- Intended committed paths: `apps/api/src/modules/shared/cursor.test.ts` and this design note.

## Contract and gap

`normalizePageSize(limit)` is the public function under test. Its contract already maps non-finite numeric limits to the default page size, 50. Existing tests cover undefined, finite bounds and rounding, but do not directly assert `NaN`, `Infinity` or `-Infinity`. Add a parameterized test at this interface with each expected result written as literal `50`.

The behavior already exists in `apps/api/src/modules/shared/cursor.ts`; no production change is intended. A temporary removal of only its non-finite guard will be used as a local mutation probe, then the exact baseline bytes will be restored before green verification. The mutation is not part of the commit.

## Interface and architecture

The shared module owns `normalizePageSize`. Direct callers include `CatalogService.listItemDefinitionOptions` in `apps/api/src/modules/inventory/catalog.service.ts` and `EmployeeModule.listPaged` in `apps/api/src/modules/workforce/employee.module.ts`. Both pass the normalized limit to repository paging. This test targets the shared public function, not caller internals.

No interface or seam moves. The changed module remains small and callers retain their existing contract. No glossary, ADR or architecture expansion is warranted.

## Lessons

- Applied `testing/test-fixture-data-must-satisfy-contracts-schemas-vitest-does-not-typecheck`: the input cases are numeric literals and expected values are independent literal `50`; focused typecheck will supplement Vitest.
- Applied `architecture/collapsing-a-primitive-family-means-choosing-one-owner-and-moving-not-just-deleting-the-duplicate`: keep the shared utility as the single owner and test through its exported interface; no ownership change is in scope.
- `process/evidence-sha-must-track-the-final-reviewed-commit` and `architecture/evidence-files-must-be-re-pinned-to-the-final-head-after-any-reviewable-change` contain historical advice to commit or rename review evidence. Current workflow overrides that advice: reports and logs stay ignored, with no evidence-only commit.
- `process/pass-powershell-scripts-by-file-across-bash` applies if PowerShell commands are needed. Use saved scripts and fresh, unique logs; avoid cleanup.

## Proof boundary

Run only the focused `cursor.test.ts` file, relevant focused lint/typecheck where available, and inspect the final source fingerprint and diff. Preserve the expected-red mutation result separately from restored-source green proof. Do not run full suites, coverage, builds or unrelated cases. Parent owns the debate, test-audit and code-review sessions and any publication or issue closure.

## Implementation and proof disposition

The Luna worker drafted the three-case test and stopped when the fresh tree lacked Vitest. The parent then provisioned pinned dependencies with a filtered, frozen-lockfile, offline install. Install scripts were skipped because this pure utility test requires no native database or generated contracts build. No package manifest or lockfile changed, and no dependencies were borrowed from another checkout.

After the worker's terminal handoff, the parent took sole ownership of verification in this same tree. Removing only the non-finite guard made all three new cases fail while the 17 existing cases passed. Restoring the exact baseline source bytes made all 20 cases pass. Focused ESLint and strict typecheck of the test and helper passed. This is mutation discrimination of already-correct behavior, not a production bug fix. Failed setup and expected-red logs remain separate from passing proof in ignored review evidence.

The final production source remains identical to the pinned base. Parent-owned independent review and partial publication handoff remain required. This batch adds assertions only; it does not widen coverage scope or complete #252, #255 or #257.
