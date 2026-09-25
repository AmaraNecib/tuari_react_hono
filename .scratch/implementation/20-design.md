# Issue #20 — UI to assign workers/employees to projects or warehouses

## Mode / base / tier

- `mode: local-only` (lane; remote reachable but parent owns push/PR — do NOT push/merge).
- Ticket: #20 (title-only in `docs/local-issue-snapshot.json`; no local status row).
- Target ref: `develop`. Resolved/fixed base SHA: **7097719c8b5e6526bf1386484e8750b1d5443d71** (HEAD is exactly this SHA).
- Review tier: **Standard**.

## Problem (verified against source + live API)

The user-facing "assign an employee to a project / warehouse" flow does not exist, and the
pre-existing lower-level seam it should reuse is **dormant**, not merely unwired:

1. RBAC consolidation (Slice 3 / issue #10) seeds only `admin` / `manager` / `viewer`.
   The workforce role keys (`worker`, `project_manager`, `warehouse_manager`) no longer exist
   (`ASSIGNABLE_ROLE_KEYS` vs `LEGACY_WORKFORCE_ROLE_KEYS` in `company.types.ts`).
2. The existing lifecycle still branches on the legacy keys, so in production:
   - `WorkforceService.assignEmployeeWorkplace` throws unless `role.key === worker`.
   - `syncManagedProjects` / `syncManagedWarehouses` throw unless `project_manager` / `warehouse_manager`.
   - `operations.createProject/createWarehouse/update*` reject a manager unless `project_manager`/`warehouse_manager`.
   - Web `isWorker` / `isProjectManager` / `isWarehouseManager` all compare `roleKey` to legacy keys,
     so the employee-edit worker-placement section and the details-page worker features never render.
   - Dashboard `metrics.workers` counts `role.key === "worker"` → always 0.
   - `employee_project_assignment` / `employee_warehouse_assignment` stay empty.
3. The read/render seam is already complete: `home-view-derived-*` builds
   `projectWorkersByProjectId`, `warehouseWorkersByWarehouseId`, `workHistoryByEmployeeId`
   and `metrics.workers` directly from `workspace.projectAssignments` / `.warehouseAssignments`,
   so once assignment rows exist the Project "العمال المرتبطون" tab, Warehouse "Team" tab,
   and worker work-history tab render correctly with no further wiring.

## Decision: map the seeded operational role `manager` onto the workforce lifecycle

> ⚠️ **SUPERSEDED — Revisions 1 and 2 below replace this.** The final model does NOT treat
> `manager` as a worker, and `manager`/`viewer` are not seeded at all. This section and the
> "Changed interfaces" blocks under it describe the original manager-mapping plan and are kept only
> for history. See "Revision 1" and "Revision 2 (FINAL)" for the authoritative description.

In the three-role model `manager` is the day-to-day operations role (the RBAC seed comment calls it
"يدير الموظفين والمشاريع والمستودعات والمخزون"). We treat `manager` as the assignable worker
**and** the project/warehouse manager, keeping the legacy keys accepted so the existing unit-test
harness (which seeds legacy roles) keeps passing and #263 can later build on it. `admin` is the
system owner and is deliberately NOT treated as an assignable worker; `viewer` is read-only.

This is the "complete it / wire the existing seam" path the issue asks for. It overlaps the
follow-up tracked by #263 (workforce role redesign); we implement the reachable subset now and do
not delete the legacy branches.

## Public surfaces & seams reused

Existing seams reused (no new parallel RPC/contract surface):
- RPC `employeesAssignWorkplace` (`workforce.ts`) → `WorkforceService.assignEmployeeWorkplace`
  (`employeesAssignWorkplaceInputSchema` already supports `nextType: NONE|PROJECT|WAREHOUSE`).
- RPC `employeesSyncManagedProjects` / `employeesSyncManagedWarehouses`.
- Web mutations `useUpdateEmployeeWorkplaceMutation` / `useSyncManagedProjectsMutation` /
  `useSyncManagedWarehousesMutation` (`workspace-mutations.ts`, re-exported from `mock-dashboard`).
- Web derived render layer (`home-view-derived-*`) — unchanged for (b)/(c).
- Employee edit page `/employees/:id/edit` (reachable via details-page `editHref`).

Changed interfaces:  (⚠️ **superseded by Revision 2** — the manager-mapping below no longer applies; actual final surface is `ASSIGNABLE_ROLE_KEYS` = admin + 3 labels, `role-classification.isEmployeeRoleSelectable` filtering the role selector, and the enabled WAREHOUSE branch of `assignEmployeeWorkplace`.)
- `requireEmployeeWithRoleKey(repo, id, roleKey, field)` now accepts `roleKey: string | string[]`
  (single-string callers unaffected).
- New web helper `features/employees/role-classification.ts`:
  `isWorkerRoleKey` (`manager`|`worker`), `isProjectManagerRoleKey` (`manager`|`project_manager`),
  `isWarehouseManagerRoleKey` (`manager`|`warehouse_manager`).

### Backend (`apps/api/src/modules/company`)
- `workforce.service.ts` `assignEmployeeWorkplace`:
  - gate now accepts `manager` OR legacy `worker`;
  - PROJECT branch manager requires `manager` OR legacy `project_manager`;
  - **enable WAREHOUSE branch** (remove the blanket throw): require `warehouseId` (VALIDATION),
    warehouse must exist (`requireWarehouse`) and be `ACTIVE` (BUSINESS_RULE).
- `workforce.service.ts` `syncManagedProjects` → `[manager, project_manager]`;
  `syncManagedWarehouses` → `[manager, warehouse_manager]`.
- `operations.service.ts` `createProject`/`updateProject` → `[manager, project_manager]`;
  `createWarehouse`/`updateWarehouse` → `[manager, warehouse_manager]`.

### Web (`apps/web/src/features`)
- `employees/role-classification.ts`: new shared helper.
- `app-shell/home-view-derived-employees.ts`: `isWorker` (feeds `metrics.workers`,
  employees table, details); `deriveEmployeeLeaveState` role-key guards;
  `buildManagerOptions`/`buildWarehouseManagerOptions` filters → use helper.
- `employees/employee-details-page.tsx`: `isWorker`/`isProjectManager`/`isWarehouseManager` → helper.
- `employees/employee-edit-page.tsx`: role flags → helper; add **warehouse placement** select next to
  the existing project placement (worker section now supports a single current workplace: none /
  project-via-manager / warehouse); validation requires a chosen placement for an active worker.
- `employees/employee-edit-page-v2.tsx`: same role flags (kept consistent; not routed).

## Tests

### Unit / integration (API)
- `workforce.service-coverage.test.ts`:
  - `assignEmployeeWorkplace` accepts a `manager`-role employee for PROJECT and WAREHOUSE.
  - WAREHOUSE branch: rejects missing `warehouseId`, inactive/missing warehouse; applies end-to-end;
    verifies the old blanket-throw test is updated (now valid).
  - `requireEmployeeWithRoleKey` array form derives error copy from the legacy key.
- `operations.service` project/warehouse create/update accept `manager`-role managers (via existing suites
  or added cases).
- Router wire tests still green (legacy-harness exercise the legacy path).

### Unit (web)
- `home-view-derived-builders.test.ts`: manager-role employee is `isWorker` → counted in `metrics.workers`;
  appears in a project's `projectWorkersByProjectId` after PROJECT assignment.
- `role-classification` helper tests.

### Playwright E2E (`tests/e2e/worker-assignment.spec.ts`)
Seeds the E2E DB (via `tests/e2e/helpers/db-seed.ts` extension): an `admin`-owned workspace,
one `manager`-role employee (ops lead), one `manager`-role "worker" employee, one ACTIVE project
(with the ops-lead as manager via `syncManagedProjects`) and one ACTIVE warehouse. Then:
1. assign the worker to the project from the worker's edit page;
2. assert the worker shows on the project "العمال المرتبطون" tab and the worker's work-history tab;
3. assign the worker to the warehouse from the worker's edit page;
4. assert the worker shows on the warehouse Team tab;
5. assert the dashboard "العمال النشطون" counter reflects the active worker.

## Risks
- **Overlap with #263** (workforce role redesign follow-up). We deliver the reachable manager-role subset;
  legacy branches stay; #263 remains the owner of any further role-key work. Flagged to parent — not a
  silent deferral: this lane does not remove/redesign roles, it unblocks them for the seeded role.
- E2E employee creation via UI is still blocked for worker-role (role keys absent) — the E2E therefore
  seeds rows directly (established pattern, see `db-seed.ts` + wisdom `testing.md`).
- API coverage gate is strict (100% lines/stmts/funcs, branch 99+) → every new backend branch must be
  covered by a test in the coverage-included suite.
- `assignEmployeeWorkplace` is a single-current-workplace model (one active project + one active
  warehouse per worker, mutually exclusive by design); "one or more projects" is satisfied over time
  via the accumulating assignment history rendered in work-history.

## Deliverable boundary
Implement + verify locally (contracts build, typecheck, lint, test:api, test:web, targeted e2e),
run guard Phase 1 + Phase 2, save evidence under `.scratch/reviews/20/`, and STOP. Parent owns
push/PR/merge and any decision on the #263 overlap.

## Revision 1 — workforce labels + RBAC (superseded by Revision 2)

> ⚠️ **SUPERSEDED.** Revision 1 still seeded `manager` (ops CRUD) and `viewer` (read-only). The
> captain then directed a single-actor model and the user confirmed manager/viewer are not wanted.
> Revision 2 below is authoritative.

The original plan treated the seeded `manager` role as the universal workforce. The user clarified the
domain model and it was implemented as follows:

- Revision 1 seeded `admin` (all permissions), `manager` (operations CRUD), `viewer` (read-only),
  plus the **workforce labels** `project_manager`, `warehouse_manager`, `worker` (empty permission
  sets). [Replaced in Revision 2.]
- The workforce labels are organizational only for now — they do not sign in or act; the `admin`
  performs every action. Empty permissions make a future grant purely additive (no callers break).
- **RBAC, not ABAC**: every assignment RPC stays permission-gated on the actor
  (`m.withPermission("employees:update")`); actor authorization (admin) is by permission. The only
  role-NAME branching is centralized in `features/employees/role-classification.ts` and classifies the
  *target employee* (a label, since these roles hold no permissions).
- **The assignment lifecycle now works natively**: the existing worker/project_manager/warehouse_manager
  service/repo logic was already written for these keys; seeding them as real roles makes it live.
  Only the WAREHOUSE branch in `assignEmployeeWorkplace` was enabled (was a hard throw).
- **Roles add/edit UI is hidden (404)** — `case "roles"` renders a not-found surface; the
  `RolesSection` component file is kept for a future surface.
- **Worker model**: a worker is assigned to one project under a manager (`assignEmployeeWorkplace`
  PROJECT, single-active), or to a warehouse (WAREHOUSE branch). Matches the user's rules.
- **i18n-code errors**: agreed to return stable codes and translate in the UI; applied to the new
  UI surface (client-side i18n validation on the edit page; no hardcoded UI strings). A full
  backend-error→code transport refactor across all handlers is flagged as a follow-up (large, cross-
  cutting), not done silently in this lane.
- `requireEmployeeWithRoleKey` accepts `string | string[]` (backwards-compatible single-string calls).

## Revision 2 (FINAL) — single-actor: `manager` / `viewer` removed

The captain directed a single-actor model — only `admin` acts — and the user asked that `manager`
and `viewer` be removed (or at least never shown when selecting a role). **We removed them entirely**
from the seeds. This is the authoritative model:

- **Seeded roles** (`role-seeds.ts` / `schema-definitions.ts` / `ASSIGNABLE_ROLE_KEYS` in
  `company.types.ts`): exactly **four** — `admin` (all permissions) plus the three **workforce
  labels** `project_manager`, `warehouse_manager`, `worker` (each with EMPTY permissions).
- **`manager` and `viewer` are gone** from fresh seeds, from `ASSIGNABLE_ROLE_KEYS`, and from the
  employee role selector. They cannot be assigned to a new employee and hold no permissions.
  (An already-provisioned database that seeded them earlier keeps its rows, but the selector and
  assignability no longer offer them — issue #20's scope is the fresh-creation path; long-lived DB
  teardown is the #263 follow-up.) See the "why / how to re-add" note in `role-seeds.ts`.
- **`admin` is the only role that acts.** `permission-enforcement.test.ts` derives the role set from
  the seeds, so admin is granted everything and every workforce label (and any user reaching the
  app) is FORBIDDEN for all permissions. Authorization is RBAC / permission-based, not role-name
  based.
- **Role selection when creating/editing an employee** (`role-classification.ts`
  `isEmployeeRoleSelectable`) offers ONLY the three workforce labels — no `manager`, no `viewer`,
  no `admin`. The workforce labels remain the mechanism for issue #20 assignments.
- **Roles add/edit UI stays hidden (404)** — no "coming soon" placeholder.
- **Tests** updated to the 4-role set: `role-seeds`, `schema-definitions`, `role.module`,
  `rbac` handlers, `dependencies`, `permission-enforcement`, and the role-assignability suite wired
  to the workforce labels as accepted placeholder roles.
