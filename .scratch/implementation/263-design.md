# Issue #263 — Employee create flow blocked by workforce role validation mismatch

**Issue**: #263
**Branch**: `refactor/issue-263`
**Tier**: High-assurance (RBAC / authorization validation)
**Base SHA**: `bb144f3a3a22fe5f72904aaafa511b16a9e4dec2` (merge-base with origin/develop)
**Date**: 2026-08

## Context

`employeesCreate` / `employeesBatchCreate` / `employeesUpdate` validate the
requested role through `requireAssignableEmployeeRole`, which whitelists only
the legacy role keys `worker` / `project_manager` / `warehouse_manager`. The
Slice-3 RBAC consolidation (issue #10) dropped those roles — the production
seeds (`apps/api/src/modules/rbac/role-seeds.ts`,
`apps/api/src/infrastructure/database/schema-definitions.ts`) and the
`applyRbacThreeRoleMigration` (schema.ts) guarantee only `admin` / `manager` /
`viewer` exist, and the employee create form offers exactly those. Every role
the UI can send is rejected with "يمكن اختيار الأدوار النظامية فقط في هذه
المرحلة.", so onboarding employees through the UI is impossible.

Discovered on #227, which `describe.skip`ped `tests/e2e/employees.spec.ts`
with this root cause.

## Decision — intended assignable-role set post-Slice 3

**The assignable set is the three seeded system roles: `admin`, `manager`,
`viewer`.** This matches, by construction:

- the RBAC seeds (`role-seeds.ts` / `schema-definitions.ts` `roleSeeds`),
- the Slice-3 migration guarantee ("only admin, manager, viewer exist"),
- the employee create form's role options (`rbacRolesList`).

The assignable predicate (`isAcceptedEmployeeRoleKey`) **also** accepts the
legacy workforce keys (`worker` / `project_manager` / `warehouse_manager`).
That acceptance is a deliberate, documented no-op in production — the
Slice-3 migration deletes those role rows, so the branch can never fire
against real data. It exists so the dormant workforce assignment lifecycle
(which still branches on those keys and is exercised by the unit-test
harness with isSystem legacy roles) can create its employees. It is **not**
a mapping of legacy keys onto `manager`: the lifecycle's worker vs
project_manager vs warehouse_manager distinctions are preserved verbatim
(see `LEGACY_WORKFORCE_ROLE_KEYS`) because redesigning that lifecycle is a
separate domain change (follow-up #338).

Note (debate F3): `employees:create` is held by the `manager` role, so a
manager-role user can create an employee with the `admin` role. An employee
record is a workforce label — employees do not authenticate through their
role (the `user_id` login link is a separate, not-yet-enabled change per the
#10 design) — so this mints no login account today. Whether `admin` should
be assignable at all is a product decision tracked as follow-up #340.

This issue only aligns the **assignable-role validation** so the create/
update flows work with the roles the system actually seeds.

## Changes

### 1. `apps/api/src/modules/company/company.types.ts`

Split the single legacy `SYSTEM_ROLE_KEYS` const into two named consts:

- `ASSIGNABLE_ROLE_KEYS = { admin, manager, viewer }` — the whitelist used by
  `requireAssignableEmployeeRole` and the batch-create validation. Matches the
  RBAC seeds; a drift-guard test pins it against
  `DEFAULT_ROLE_PERMISSIONS` (system roles only).
- `LEGACY_WORKFORCE_ROLE_KEYS = { worker, project_manager, warehouse_manager }`
  — preserved verbatim for the dormant workforce lifecycle logic, with a
  comment explaining the roles no longer exist post-Slice 3 and the lifecycle
  awaits a redesign.

### 2. `apps/api/src/modules/company/company.entity-resolvers.ts`

- `requireAssignableEmployeeRole`: accept `role.isSystem &&
  key ∈ ASSIGNABLE_ROLE_KEYS`.
- `requireEmployeeWorker`, `ensureEmployeeTransitionAllowed`,
  `ensureProjectTransitionAllowed`, `listActiveWorkerIdsForProject`: switch to
  `LEGACY_WORKFORCE_ROLE_KEYS` (unchanged semantics).

### 3. `apps/api/src/modules/company/workforce.service.ts`

- Batch-create role check (`role.isSystem && key ∈ ASSIGNABLE_ROLE_KEYS`).
- All lifecycle references (`worker` / `project_manager` /
  `warehouse_manager` in batch worker-branch, update transition guard,
  `createManagerAssignment`, `assignEmployeeWorkplace`,
  `syncManagedProjects`, `syncManagedWarehouses`): switch to
  `LEGACY_WORKFORCE_ROLE_KEYS` (unchanged semantics).

### 4. `apps/api/src/modules/company/operations.service.ts`

- Project/warehouse manager checks: switch to `LEGACY_WORKFORCE_ROLE_KEYS`
  (unchanged semantics).

### 5. Tests

- `company.test-helpers.ts`, `company.system-log.test.ts`,
  `company.unit.test.ts`: `SYSTEM_ROLE_KEYS` → `LEGACY_WORKFORCE_ROLE_KEYS`
  (the harness keeps seeding the legacy lifecycle roles; references are
  mechanical).
- New `company.role-assignability.test.ts`:
  - `ASSIGNABLE_ROLE_KEYS` matches the seeded system role keys from BOTH
    seed sources (`DEFAULT_ROLE_PERMISSIONS` and `roleSeeds` in
    `schema-definitions.ts`) — drift guard.
  - The helper still accepts the legacy workforce keys (pinned contract).
  - `requireAssignableEmployeeRole` accepts each of admin/manager/viewer and
    rejects a non-system role.
  - `createEmployee` / `createEmployeesBatch` succeed with admin/manager/viewer
    roles; batch create rejects a non-system role.

### 6. E2E — `tests/e2e/employees.spec.ts`

Remove `describe.skip` so the create + update tests run. The salary-pair
fields are filled by the spec already; the form's salary validation is
conditional (only when one of the pair is present), so the spec does not
depend on the issue's "native validation" claim — verify empirically in the
E2E run.

## Public API / interfaces

No contract changes (`workforce-contract.ts` untouched). No new RPC surface.
Behavior change: `employeesCreate` / `employeesBatchCreate` / `employeesUpdate`
now accept admin/manager/viewer roles instead of rejecting them.

## Dependencies

- `company.types.ts` (consts), `company.entity-resolvers.ts`,
  `workforce.service.ts`, `operations.service.ts` (all in the `company`
  module), plus the four test files and the E2E spec. No cross-module
  production imports added (the drift-guard test imports the RBAC seeds,
  test-only).

## Planned tests

| Test | Where |
|---|---|
| Assignable set matches RBAC seeds | `company.role-assignability.test.ts` |
| `requireAssignableEmployeeRole` accepts admin/manager/viewer, rejects non-system | `company.role-assignability.test.ts` (+ existing reject test in `company.unit.test.ts`) |
| `createEmployee` succeeds with each assignable role | `company.role-assignability.test.ts` |
| `createEmployeesBatch` succeeds with assignable roles, rejects non-system role | `company.role-assignability.test.ts` |
| Full create + update employee flow through the UI | `tests/e2e/employees.spec.ts` (un-skipped) |
| Existing lifecycle tests keep passing (harness unchanged) | `company.unit.test.ts`, `*-coverage.test.ts` |

## Implementation risks

1. **Mechanical rename fallout** — 61 references across 6 files; TypeScript
   will catch every one (properties `worker`/`projectManager`/
   `warehouseManager` no longer exist on `ASSIGNABLE_ROLE_KEYS`).
2. **Drift between the assignable set and the seeds** — mitigated by the
   drift-guard test (both seed sources).
3. **Dormant lifecycle debt** — the assignment lifecycle remains keyed on
   non-existent roles; it is unreachable from the post-Slice-3 UI and keeps
   its pinned tests. Follow-up #338: redesign the workforce assignment
   lifecycle for the 3-role model (includes project/warehouse manager
   selection, which today also rejects every seeded employee).
4. **E2E flakiness** — the un-skipped spec runs in the existing serial suite;
   the create test selects its role explicitly and the update test asserts
   the notes field unconditionally.
5. **Admin assignability** — `employees:create` holders can mint an
   `admin`-role employee (workforce label only, no login account). Product
   decision tracked as follow-up #340.
6. **Issue's salary claim** — the reported "native validation" block on the
   salary pair is stale: the batch form's salary fields are conditionally
   required (only when one of the pair is present), verified by
   `employee-batch-schema.ts`. The spec fills the pair regardless.

## P1 fix — admin-role assignment privilege gate (Greptile, PR #342)

**Finding**: `requireAssignableEmployeeRole` (company.entity-resolvers.ts)
accepted the `admin` role for any caller holding `employees:create` (the
`manager` role). Permission resolution matches users to employees by phone
and derives authorization from `employee.roleId`, so a manager could mint an
`admin` employee whose matching account would inherit every admin permission
— a privilege-escalation path (risk 5 above, deferred to follow-up #340).

**Decision (Direction 1 — caller-grant check, not removal from the set)**:
assigning the `admin` role now requires the caller to hold the admin-level
grant — the bootstrap owner, per `WorkspaceAdminAuthorizer.isBootstrapOwner`
(the only admin-level identity the system models). Callers without a provable
grant (managers, anonymous actors, systems without an authorizer configured)
are rejected with `UNAUTHORIZED`. The gate **fails closed**: no authorizer /
no actor ⇒ no provable grant ⇒ admin assignment rejected.

- `requireAssignableEmployeeRole` takes an optional `caller`
  (`{ authorizer, actorUserId }`) and delegates to the new
  `requireAdminAssignmentGrant` guard; `createEmployee` / `updateEmployee`
  pass the mutation audit actor. The batch path applies the same rule per
  row and throws `UNAUTHORIZED` when any row requests `admin` without the
  grant (atomic — nothing persists).
- `manager` / `viewer` and the legacy workforce keys are unaffected.
- `WorkspaceMutationContext` exposes the configured authorizer via a getter
  so the service can hand it to the pure resolver guard; the guard itself
  stays a pure function over `(authorizer, actorUserId, roleKey, field)`.
- Tests (`company.role-assignability.test.ts`, 29 tests): resolver-level
  pins (admin without grant ⇒ reject, admin with owner ⇒ accept, manager
  caller ⇒ reject), service-level create/update/batch pins (manager cannot
  mint admin; admin-holder can; batch UNAUTHORIZED persists nothing). The
  harness accepts an optional `workspaceAdminAuthorizer` for the
  admin-holder scenarios.
- The `ASSIGNABLE_ROLE_KEYS` set still contains `admin` — the set is what
  the UI/validation offer; the grant check is what decides who may use it.
  Whether non-owner admins should ever mint admins remains the #340 product
  decision; today the answer is no.
