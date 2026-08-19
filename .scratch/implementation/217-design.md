# 217-design — Deepen the dashboard view-model seam

- **Mode:** local-only (GitHub remote unavailable; grep/gh returns "repository
  not found" — see `docs/local-issue-status.md`)
- **Ticket source:** offline snapshot `docs/local-issue-snapshot.json` (#217
  "Deepen the dashboard view-model seam — one module for the workspace view
  model") + issuer brief handed to this lane. GitHub issue body is not
  retrievable; the issuer brief is the live scope.
- **Parent/map context:** #211 (architecture-review deepenings map); #214/#216
  are sibling lanes.
- **Branch:** `refactor/issue-217-dashboard-seam`
- **Base:** cached `origin/develop @ 6be3497` (pinned; `git merge-base develop HEAD`
  resolves to `bb144f3`, an ancestor of HEAD — the issuer pins the cached
  `origin/develop` ref `6be3497`, which we record as the fixed base).
- **Final HEAD:** recorded after implementation.
- **Review tier:** Standard (view-model refactor — code + tests)

---

## Problem

`buildHomeViewDerived` (and its `HomeViewDerived` type) in
`apps/web/src/features/app-shell/home-view-derived.ts` is *intended* to be the
single public seam for the dashboard's derived data, but the seam is leaky:

- The employees section (`employees-section.tsx`, a lazy-loaded page chunk)
  reaches **into the internal derived modules** to re-derive its own context:
  - `buildHomeViewDerivedLookups` from `./home-view-derived-lookups`
  - `buildEmployeeRelationshipFacts` and `buildEmployeeRow` from
    `./home-view-derived-employees`
- It then builds each *paged* employee row with a hand-assembled
  `copy` + `t` + those internals. The dashboard's full
  `derived.employeeRows` and the employees page's paged rows are produced by
  two different call paths over the same workspace → the seam's promise
  ("one module gives you all derived data") is broken, and drift risk exists
  between the two paths.

Goal (from issuer brief): make `buildHomeViewDerived`/`HomeViewDerived` the
**single public seam** for the dashboard's derived data, kill the reach-in from
`employees-section`, and add **one composition test**.

## Design

Deepen the seam by hiding its dependency graph (`lookups`, relationship facts,
copy, `t`) behind a narrow, purpose-shaped operation **on the derived object**:
a single-employee row builder. The employees section then consumes only
`HomeViewDerived` (via a prop) and never imports a `home-view-derived-*`
internal module.

### 1. `home-view-derived.ts` (the seam)

- Hoist `relationshipFacts` once: compute `buildEmployeeRelationshipFacts(workspace)`
  alongside `buildHomeViewDerivedLookups(workspace)`.
- Pass the computed facts into `buildEmployeeRows` (new **optional** param —
  see below) so facts aren't computed twice.
- Expose on the returned object:

  ```ts
  /**
   * Builds a single employee table row against the same workspace-derived
   * context (lookups + relationship facts + shell copy + t) that produced
   * `employeeRows`. Public row-builder for paged/search subsets (e.g. the
   * employees section); keeps consumers off the internal derived-* modules
   * (issue #217).
   */
  buildEmployeeTableRow: (employee) => buildEmployeeRow({ copy: { shell: copy.shell }, employee, lookups, relationshipFacts, t }),
  ```

  Named `buildEmployeeTableRow` (it returns exactly an `EmployeeTableRow`) to
  avoid a cross-scope name collision with the internal `buildEmployeeRow`
  helper (four-arg) that implements it — the seam owns the public name, the
  internal helper stays private to the pipeline.

- `HomeViewDerived = ReturnType<typeof buildHomeViewDerived>` picks up the new
  function property automatically — that type remains the single seam type.

### 2. `home-view-derived-employees.ts` (internal, no behavior change)

- `buildEmployeeRows` gains an **optional** `relationshipFacts` param:
  `relationshipFacts?: EmployeeRelationshipFacts`. When omitted it falls back
  to computing `buildEmployeeRelationshipFacts(workspace)` (existing callers —
  the builders test — unchanged). This is a pure de-dup wiring; not exported
  through the seam.

### 3. `employees-section.tsx` (kill the reach-in)

- Remove imports of `buildEmployeeRelationshipFacts`, `buildEmployeeRow`
  (`home-view-derived-employees`) and `buildHomeViewDerivedLookups`
  (`home-view-derived-lookups`).
- Remove props that existed only to feed the reach-in: `workspace`,
  `noManagerLabel`, `noProjectLabel`.
- Add one prop: `buildEmployeeTableRow: (employee: Employee) => EmployeeTableRow`.
- Replace the two `useMemo`s + row mapping with:

  ```tsx
  const rows = useMemo<EmployeeTableRow[]>(
    () => pagedQuery.data?.items.map((employee) => buildEmployeeRow(employee)) ?? [],
    [pagedQuery.data?.items, buildEmployeeRow],
  )
  ```

  Behavior for present/searching/paging/actions is unchanged (same underlying
  `buildEmployeeRow` logic, same context) — the rows now come through the seam.

### 4. `home-view-page-content-sections.tsx`

- Pass `buildEmployeeTableRow={derived.buildEmployeeTableRow}` to `<EmployeesSection>`.
- Stop passing `noManagerLabel`, `noProjectLabel`, `workspace`.
- Remove `"workspace"` from the props `Pick` (it is only used by the employees
  section; it flows through `...rest` in `home-view-page-content.tsx` for the
  other sections' needs — after this change nothing in the sections component
  consumes it).

Overlap guard: no changes to table/pagination primitives
(`EmployeeTable`, `app-shell-table-primitives`, `table-pagination-controls`,
paging). The employees section only stops re-deriving context; the table
render, pagination props, search, and CRUD actions are untouched.

## Tests

- **New composition test** `home-view-derived-composition.test.ts` — imports
  only the public seam (`buildHomeViewDerived`), the real copy builder
  (`buildHomeViewCopy` with a noop `t`), and `DemoWorkspace`. It:
  - builds a relationship-rich workspace fixture;
  - calls `buildHomeViewDerived({ copy, detailCopy, t, workspace })`;
  - asserts the **composition invariant**: `derived.buildEmployeeTableRow(employee)`
    deep-equals the matching `derived.employeeRows` entry for every employee —
    i.e. the employees-page row builder agrees with the dashboard's full list,
    so the two render paths cannot drift;
    (fixture also includes an inactive (LEFT) worker and an orphan-role employee
    so the drift invariant covers the leave-inactive and no-Manager fallback
    paths through the seam);
  - sanity-checks `derived.metrics` and `managerOptions === projectManagerOptions`.
- Existing unit tests (`home-view-derived-builders`, `-employee-row`,
  `-helpers`, `home-view-page-content-view-model`, `home-view.test.tsx`,
  `mock-dashboard.account-settings`) must stay green — no public behavior
  changes.

## Risks / migration notes

- Low: `buildEmployeeRows` signature gains an optional param (backward
  compatible, internal-only).
- Prop removals on `EmployeesSection` are safe: the only caller is the sections
  renderer and `workspace`/`noManagerLabel`/`noProjectLabel` were used solely
  to feed the removed reach-in (verified by grep).
- The seam row-builder closes over `t` (the same i18n instance the section
  uses) → identical label output; no i18n drift.
- No Playwright E2E added: this is an internal view-model refactor with no
  user-facing behavior change; the composition unit test pins the invariant.
- Local-only: no push, no PR, no merge. Reproved local checks + Greptile CLI
  only.

## Deferred / follow-up (recorded, not silent)

- **Shared pure test fixture** (from test-audit): the composition test's inline
  `DemoWorkspace` fixture largely duplicates the one in
  `home-view-derived-builders.test.ts`. `__test-utils__/workspace-fixtures.tsx`
  is unsuitable for these pure unit tests (jsdom env + hoisted `vi.mock`). A
  dedicated pure `home-view-derived-fixtures.ts` shared by both derived test
  files could remove the duplication. **Deferred** — not required for the #217
  seam fix; noted so it isn't silently dropped.

## Lifecycle gates (Standard)

Guard 1 → quality check (codebase-design) → test-audit → code-review → Guard 2
→ Greptile CLI (`--branch origin/develop`, pinned base) → Guard 3 → wisdom +
crew_report.
