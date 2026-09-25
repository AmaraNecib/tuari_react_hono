# Issue #27 — Empty states teach the next action

- mode: remote-capable (base pushed by parent; lane owns push, parent owns merge)
- ticket: #27 "UX: Empty states say 'nothing here' without teaching the next action"
- target ref: `fix/issue-27-empty-states`
- base SHA: `fbb7d02` (= `origin/develop` @ fbb7d02, verified HEAD == base at lane start)
- review tier: Standard
- Playwright: EXCLUDED this round (lane #25 owns E2E). Coverage via RTL unit/integration.

## Problem

Four surfaces are dead-ends when empty:

1. Project detail → "العمال المرتبطون" tab: `detailPages.project.workersEmpty` only.
2. Warehouse detail → "الفريق" tab: `detailPages.warehouse.teamEmpty` only.
3. Worker detail → "سجل العمل" tab: `detailPages.employee.noWorkHistory` only.
4. Items catalog (دليل العناصر): `inventoryPage.itemDefinitions.empty` + a create CTA,
   but no one-line hint about what a definition unlocks.

The list sections (employees/projects/warehouses) and the invoices list already
render a working "add" CTA in their empty rows — they are not dead-ends, so they
stay untouched (scope).

## Design

### Shared primitive (extend, do not fork)

`RecordHistoryTable` in `apps/web/src/features/shared/record-page-frame.tsx` is
the shared empty-state surface used by all three detail tabs. Extend it with two
optional, backward-compatible props:

```ts
emptyHint?: string
emptyAction?: { label: string; target: WorkspaceRouteTarget }
```

Empty branch renders (inside the existing `AppShellEmptyStateRow`):

```
<label text>            (existing emptyLabel — unchanged)
<one-line hint>         (emptyHint, text-[12px] muted — compact)
<CTA WorkspaceLink>     (emptyAction, buttonVariants default sm)
```

`WorkspaceRouteTarget` is the existing typed route union from
`@/router/navigation`, so CTAs are type-checked route destinations; no new
design system, RTL inherits the frame's `dir="rtl"`.

### Callers

| Surface | hint | CTA label | CTA target |
| --- | --- | --- | --- |
| project workers tab | employees can be assigned via their worker file | إدارة العاملين | `workspaceRoutes.employees()` |
| warehouse team tab | same pattern for team members | إدارة العاملين | `workspaceRoutes.employees()` |
| worker work-history tab | history appears once the worker is assigned to a project/warehouse | تعديل مكان العمل | `workspaceRoutes.employeeEdit(employee.id)` (this worker's assignment surface, issue #20) |

Items catalog: add the hint paragraph under the existing empty label; the CTA
(create definition) already exists.

### i18n keys (ar.ts only — single-locale app)

- `detailPages.project.workersEmptyHint`
- `detailPages.project.workersEmptyAction`
- `detailPages.warehouse.teamEmptyHint`
- `detailPages.warehouse.teamEmptyAction`
- `detailPages.employee.noWorkHistoryHint`
- `detailPages.employee.noWorkHistoryAction`
- `inventoryPage.itemDefinitions.emptyHint`

Key names follow the existing `*Empty*` pattern; check-i18n-keys gates literal
`t()` keys.

### Review-driven revisions (round 1, Standard tier)

- Worker work-history guidance is gated on `isWorker`: the workplace placement
  surface (issue #20) is worker-only, so a non-worker's empty history stays
  label-only (no dead-end CTA to a page without a workplace field).
- Hint styling is unified through a new shared `AppShellEmptyHint` primitive in
  `table-primitives.tsx` (used by `RecordHistoryTable` empty rows and the
  items-catalog empty state) instead of per-page forked classes.

### Review-driven revisions (round 2 — hosted Greptile on PR #40, 4/5)

- Work-history guidance is additionally gated on `status === "ACTIVE"`
  (`canAssignWorkplace = isWorker && status === "ACTIVE"`): the #20 placement
  flow persists only for ACTIVE workers, so an INACTIVE/LEFT worker must get a
  label-only empty state instead of an edit-placement CTA that would be
  silently ignored. Regression: `it.each` INACTIVE/LEFT cases in
  `empty-state-cta.test.tsx`.

## Ownership / deps

- `record-page-frame.tsx` imports `WorkspaceLink`/`WorkspaceRouteTarget` from
  `@/router/navigation` (already a shared layer; no cycle: navigation imports only
  TanStack `Link`).
- No API/contract changes. No RBAC changes. No role/job-label changes.
- Invoice create/details pages untouched (lanes #25/#34).

## Tests (RTL only, no Playwright)

1. `record-page-frame-empty-state.test.tsx` — unit, mocks `@tanstack/react-router`
   Link to capture target props:
   - hint renders only in the empty branch
   - CTA link renders with label in the empty branch
   - CTA carries the correct `to`/`params`/`search` target
   - populated state renders rows and NO hint/CTA (unchanged behavior)
   - no-props empty state still renders only the label (backward compat)
2. `empty-state-cta.test.tsx` — integration via `renderWorkspace` (fixtures mock
   Link + hooks):
   - project-details workers tab (empty assignments) → hint + CTA link present
   - project-details workers tab (populated, default data) → rows, no hint/CTA
   - warehouse-details team tab (empty) → hint + CTA link present
   - employee-details history tab (empty history) → hint + CTA
   - inventory page (empty definitions) → hint + create CTA
3. Existing suites must stay green (`record-page-frame.test.tsx` etc.).

## Risks

- `RecordHistoryTable` gains a `Link` render path only when `emptyAction` is set;
  existing callers/tests pass no props → unchanged.
- Workspace fixtures mock Link as `<a>`; click-navigation cannot be asserted in
  integration, so the route target is asserted at unit level via captured props.
- Arabic copy must stay RTL-safe and dense (no new layout system).