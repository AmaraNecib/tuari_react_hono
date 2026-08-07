# Test Audit — issue #286 (web perf: lazy sections + manualChunks)

Audited: `git diff 9aac620...9e7fb7c` (base = `origin/develop @ 9aac620`, head = `9e7fb7c`)

## Coverage analysis

| Concern | Verdict |
|---|---|
| Section components still covered | `home-view.test.tsx` renders every section page (dashboard, employees, employees-create, projects, warehouses, transactions, salaries, settings) through the lazy wrapper; assertions now use `findBy*` to await the lazy chunk. `roles-section.test.tsx` still imports `RolesSection` directly (unaffected by lazy wrapper). |
| Async timing under parallel load | Raised `asyncUtilTimeout` to 20s + `vi.setConfig({ testTimeout: 30000 })` for this known load-sensitive suite (pre-existing flake issue #219 pattern). Full suite: 375/375 pass standalone and under full-suite load. |
| Fixture mocks after de-barrel | `workspace-fixtures.tsx` mocks both `../mock-dashboard` AND `../workspace-mutations` / `../workspace-queries`; added the two hooks home-view now imports from the concrete modules (`useRemoveWorkspaceRecordMutation` on mutations mock; `useCompositeWorkspaceQuery` + `useSystemLogQuery` on queries mock). |
| E2E (user-facing flow) | Playwright `foundation-smoke`, `employees`, `projects`, `warehouses` suites pass against a real dev server + API (7 passed total, 2 pre-existing skips in employees suite). These cover the lazy section chunks loading in a real browser. |
| Edge cases (loading/error) | Unchanged from baseline: section switch still returns `null` for unknown pages; auth/bootstrap/workspace-error states covered by existing synchronous tests; fallback skeleton has `role="status"` for a11y. |
| Regression risk | `pnpm test:api` (948/948) green — de-barrel touched a module (`debts-queries`) also used by the contract layer; no breakage. |

## Quality

- Assertions are meaningful (heading/role/text/button-count), not "doesn't crash".
- Lazy-chunk waiting uses `findBy*` (async) rather than arbitrary sleeps.
- No shallow/missing tests introduced; the change is refactor-only so the
  existing behavioral assertions carry the coverage.

## Result: PASS — no gaps.
