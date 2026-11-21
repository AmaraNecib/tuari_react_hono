# Catalog empty-state CI correction

## Authority and scope

Worktree: `D:/worktrees/tuari_react_hono/t3-8d33afaa-37208ee3e1cc0bb5`.
Base: `18b065b1345653166eec74ade50ba9c41b7333fc`.
Mode: focused-local / CI-final-pending. High-assurance because the failing CI integration test crosses the inventory route. Local-only worker; the parent owns reviews, publication and hosted acceptance.

Changed paths for this correction:

- `apps/web/src/features/app-shell/empty-state-cta.test.tsx`
- `apps/web/src/features/app-shell/__test-utils__/workspace-fixtures.tsx`
- `.scratch/implementation/558-ci-empty-state-design.md`

The parent separately authorized the shared fixture change after execution exposed missing query exports. No production UI, query, API, contracts or checker source changes are included.

Translation commit `f9a27a09e1893a927ed248f17aca383af71bc162` was independently cherry-picked as `c7caacba`. Its resource and design files match the original commit. It remains separate from this test correction.

## Contract and diagnosis

The approved seam is the existing `renderWorkspace` integration interface. `/inventory` starts on stock. The catalog is a sibling section reached through the real `دليل العناصر` button in `ExactFinancialRoutePage`. The test must activate that control before asserting the existing catalog hint and create action. Neither assertion is removed or relaxed. Catalog definitions are not stock balances. The route default remains unchanged.

The shared harness mocked only invoice and definition queries. The real stock page also reads outbounds, detail, location, project charges, project contribution and the inventory action. Missing exports crashed the page before navigation. Add only those used exports. Their empty arrays, location contents and project totals match current contract shapes; absent detail corresponds to no selected invoice. Query functions are `vi.fn` mocks so consumers can override pending/error states and refetch. The unconfigured mutation rejects rather than pretending a write succeeded. No component is replaced.

Architecture: no seam moved. The harness retains its existing query adapter seam; the test crosses real route navigation and real catalog rendering. Deleting this correction would restore the missing-export crash and wrong-section assertion, not remove production complexity. No new module or domain glossary is needed.

## Honest chronology and proof

The previous worker's test/design draft existed before this recovery. It had static diagnosis but no passing tests. Only those two files were copied from its tree. The copied native `.click()` was changed to Testing Library `fireEvent.click` for React scheduling.

Dependency junctions reuse already-installed packages. Web `@tuari/contracts` resolves to this worktree, whose own contracts build produced valid JS and declarations. No packages or lockfiles changed. Temporary files use D:.

Early `old-navigation-red` execution hit the logger's PowerShell stderr handling; its raw log remains. `old-navigation-red-2` and the first `focused-green` execution exposed the missing fixture export. Those failures are setup evidence, not selector discrimination.

After the fixture repair, `old-navigation-clean-red` waited successfully for the real catalog control but deliberately omitted its click. It failed at the original hint assertion, exit 1, one failed test and eight skipped, in 36 seconds. With the click restored, the five affected files passed all 94 tests in 88 seconds. These include all three shared-harness consumers, the direct item-definition page tests and exact-commerce translation tests.

The production i18n gate and all eight checker tests pass in 18 seconds. Web typecheck passes with valid owned contracts output, including the final fixture scope in 43 seconds. Configured ESLint passes for the two changed test files and translation resource in 18 seconds. `git diff --check` is required before commit. Raw commands, native exits, elapsed times and source fingerprints are retained under ignored `.scratch/reviews/558-recovery/`.

Applied wisdom: real Arabic resources resolve translations rather than fallback-only mocks; the production scanner distinguishes text fallbacks from options and checks live references before removing leaves. No checker semantics changed. No new repeated lesson is claimed.

## Limits

This worker cannot obtain independent reviews because children are forbidden by the brief. The parent must arrange the required current-head review. No full suite, browser run, hosted CI acceptance, protection activation, PR or merge is claimed. Guard Phase 2 evidence is recorded against the committed SHA in the ignored verification report; unchanged exact-source executions retain their original execution identity rather than being relabeled as post-commit runs.
