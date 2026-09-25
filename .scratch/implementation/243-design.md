# Issue #243 — Collapse the table-primitive families

- **Mode:** local-only (GitHub unavailable; source of truth = checkout + cached refs)
- **Ticket source:** `docs/local-issue-snapshot.json` (#243) / `docs/local-issue-status.md` row 45
- **Parent/map:** #235 (web-layer deepenings map). Sibling seam #244 (workspace page union) — **no overlap**: #244 owns the WorkspacePage union in `home-view-page-content-*.tsx` / `home-view.tsx`; this issue owns table/pagination/filter primitives only. No shared files touched.
- **Branch:** `refactor/issue-243-table-primitives`
- **Base SHA (pinned):** `6be34976954dee8b6ef33a34ce923d348270cdb0` (= `origin/develop` = local `develop`)
- **Review tier:** Standard (web UI/component refactor; no authz/crypto/financial). Debate not required.

## 1. Problem statement

Two parallel table/pagination/filter primitive families exist, plus dead code:

| Family | Home | Members | Consumers (production) |
| --- | --- | --- | --- |
| AppShell table primitives | `features/app-shell/app-shell-table-primitives.tsx` | `AppShellSectionSurface` (0), `AppShellSectionBody` (0), `AppShellTableFrame`, `AppShellTableHead`, `AppShellTableHeaderCell`, `AppShellTableRow`, `AppShellEmptyStateRow`, `AppShellActionGroup`, `AppShellActionButtonWithReason`, `AppShellFilterShell`, `DateRangeFilter`, `usePaginatedRows` | projects, roles, salaries, system-log, warehouses (app-shell), audit, employees (employee-table), record-page-frame, inventory-invoices, report-builder |
| AppShell page pagination | `features/app-shell/table-pagination-controls.tsx` | `TablePaginationControls` | projects, system-log, warehouses, audit, debts-hub, externals, inventory-invoices |
| Shared record-page frame | `features/shared/record-page-frame.tsx` | `RecordPageFrame`, `RecordTabs`, `RecordTabPanel`, `RecordInfoGrid`, `RecordInfoCard`, `RecordHistoryTable`, `RecordHistoryCard` | 15 detail/section pages |
| Shared cursor pagination | `features/shared/pagination-controls.tsx` | `PaginationControls` | **none (0 production consumers)** — only its test |

Facts found by import/test inspection:
- `record-page-frame.tsx` (shared) already imports the AppShell table primitives for `RecordHistoryTable` — a shared-feature → app-shell-feature dependency inversion.
- `AppShellSectionSurface` and `AppShellSectionBody` have **zero** consumers (dead code, present since the feature split).
- `PaginationControls` (cursor-based, `features/shared/pagination-controls.tsx`, 12 tests) has **zero** production consumers. The employee list pagination is server-side cursor-based (`useEmployeesPagedQuery` via router `paginationCursor`), and renders no `PaginationControls` UI. It is superseded by the page-based `usePaginatedRows` + `TablePaginationControls`.
- Raw inline `<table>` markup remains in `debt-ledger-panel.tsx` and the employee-details finance table — single-use detail tables with bespoke styles, **not a family**. Out of scope (see §5).
- shadcn `components/ui/table.tsx` (`Table`/`TableHead`/…) is the design-system UI layer used by debts-hub/externals/inventory-item-definitions alongside `TablePaginationControls` — **not a duplicate family**; kept as-is.

## 2. Decision: single owner = `features/shared/`

The primitives are consumed by every feature folder (app-shell, audit, debts, employees,
externals, inventory, reports); the "app-shell" location is a historical accident. The shared
layer already hosts the page primitives. **Move both AppShell primitive files into
`features/shared/` so the shared layer is the one owner of the table/pagination/filter family.**

### File moves (source-only)

| From | To |
| --- | --- |
| `features/app-shell/app-shell-table-primitives.tsx` | `features/shared/table-primitives.tsx` |
| `features/app-shell/table-pagination-controls.tsx` | `features/shared/table-pagination-controls.tsx` |

### Dead code removed (verified zero-consumer via repo-wide grep + `git log -S`)

- `AppShellSectionSurface`, `AppShellSectionBody` — zero consumers.
- `features/shared/pagination-controls.tsx` + `pagination-controls.test.tsx` — cursor-based
  parallel family with zero production consumers; `usePaginatedRows` + `TablePaginationControls`
  is the kept family. Deleting the orphan (and its test) completes the collapse instead of
  leaving two pagination UIs in the tree.

### Deliberately NOT renamed

Component identifiers stay `AppShell*` (stable public identifiers used across ~30 import
lines; the `AppShell` prefix also avoids colliding with the shadcn `Table*` names in
`components/ui/table.tsx` consumed in the same files). Renaming is cosmetic and deferred
(see §7). The ownership change (file location + import paths) is the collapse.

### Dependency inversion resolved

`record-page-frame.tsx` now imports the table primitives from the same folder
(`./table-primitives`) instead of reaching into the app-shell feature — shared → shared.
No other feature imports the app-shell folder for primitives after the move.

## 3. Public API and behavior preservation

Move is a pure relocation — **no component implementation changes** except:
- `table-pagination-controls.tsx` keeps importing `Surface` from `./page-primitives`
  (both live in `features/shared/` now).
- All component props/rendered DOM classes stay byte-identical. Behavior to preserve:
  - RTL layout: `dir="rtl"` on `AppShellSectionSurface`, `AppShellSectionBody`,
    `AppShellActionGroup`, `AppShellFilterShell`, `AppShellTableFrame`; `text-start` on
    header/data cells; RTL pagination row layout.
  - Accessibility: `scope="col"` on `AppShellTableHeaderCell`, `colSpan` on empty-state row,
    tooltip-wrapped disabled buttons (`AppShellActionButtonWithReason`), `aria-live="polite"`
    is only on the deleted orphan (no behavior change).
  - Pagination semantics: `usePaginatedRows` clamping (`page > maxPage`), page reset on
    `resetPageDeps`, slice math; `TablePaginationControls` disable logic and
    `tables.range`/`tables.rowsPerPage` i18n.
  - Filtering: `AppShellFilterShell` wrap layout, `DateRangeFilter` paired date inputs.

## 4. Import migration plan (every importer, before any deletion)

App-shell relative importers (become `@/features/shared/...`):
1. `features/app-shell/projects-section.tsx`
2. `features/app-shell/roles-section.tsx`
3. `features/app-shell/salaries-section.tsx`
4. `features/app-shell/system-log-section.tsx`
5. `features/app-shell/warehouses-section.tsx`

Absolute importers (path swap in place):
6. `features/audit/audit-log-page.tsx`
7. `features/employees/employee-table.tsx`
8. `features/shared/record-page-frame.tsx` (→ `./table-primitives`)
9. `features/inventory/inventory-invoices-page.tsx`
10. `features/reports/report-builder.tsx`
11. `features/debts/debts-hub-page.tsx` (`TablePaginationControls`)
12. `features/externals/externals-page.tsx` (`TablePaginationControls`)

Deletions happen only after all consumers are migrated and `tsc --noEmit` is clean.

## 5. Explicit non-goals

- Migrating the two raw inline tables (`debt-ledger-panel.tsx`, employee-details finance
  section) — single-use bespoke styling, not a family; migration would be a visual redesign.
- Migrating shadcn `components/ui/table.tsx` consumers to the primitive family — design-system
  layer, not a feature-family duplicate.
- #244 workspace page union / home-view composition — sibling lane.

## 6. Tests (regression for the collapse)

- **New** `features/shared/table-primitives.test.tsx`:
  - `usePaginatedRows`: page slicing, clamp when rows shrink below current page,
    reset-to-1 on `resetPageDeps` change, pageSize change re-slices, empty rows.
  - `AppShellTableHeaderCell` renders a `th` with `scope="col"`.
  - `AppShellEmptyStateRow` renders `colSpan` cell.
  - `AppShellTableRow` forwards `onClick` and `hover` classes.
  - `AppShellFilterShell`/`DateRangeFilter` render RTL labels + paired pickers.
  - `AppShellActionButtonWithReason` wraps a disabled button in a tooltip with the reason
    and renders a plain button when enabled.
- **New** `features/shared/table-pagination-controls.test.tsx`:
  - range text (`tables.range` i18n), page-size select presets [10,25,50,100], prev/next
    disable logic, callback wiring, zero-total state.
- **Updated** `features/shared/record-page-frame.test.tsx` keeps passing (RecordTabs) —
  plus a `RecordHistoryTable` render test pinning the migrated AppShell primitives.
- Existing suite (494 tests) is the behavioral regression net for all ~12 migrated pages.
- E2E: no new Playwright spec — existing `projects/warehouses/debts/inventory/employees`
  specs already exercise the migrated pages; run targeted specs if the dev server setup allows.

## 7. Risks / migration concerns

- Import-path typo risk in 12 consumer files → mitigated by `tsc --noEmit` + full web suite.
- Deleted orphan `PaginationControls` is referenced by its test only; grep-verified zero
  production imports and zero E2E references.
- `AppShell*` names staying in shared/ may read oddly — documented rationale in §2; deferred
  follow-up: rename components to a neutral prefix (e.g. `PrimitiveTable*` / drop prefix)
  **excluding** `TableHead`/`TableRow`/`TableHeader` to avoid shadcn collisions.
- Windows git mv: use `git mv` for rename history; verify no case-only path issues.
- Local-only: no fetch/push/PR; evidence SHAs pinned to HEAD after final commit.

## 8. Lifecycle evidence plan

- `.scratch/reviews/243/<HEAD>-code-review.md` (Standards + Spec axes)
- `.scratch/reviews/243/<HEAD>-test-audit.md`
- `.scratch/reviews/243/<HEAD>-greptile-local.json` + `.md` (CLI, base `origin/develop`)