# Issue #10 — Role-Based Permissions (Slice 3) Design

**Issue**: #10
**Branch**: `feature/multi-role-permissions`
**Date**: 2026-07-22

## Context

Issue #10 requires the hybrid role-based permissions system, with employee mutations as the first protected operations. The acceptance criteria are:

- Role, Permission, and RolePermission tables exist (Drizzle schema)
- Default roles (ADMIN, MANAGER, VIEWER) are seeded on first run
- Permission check middleware rejects unauthorized mutations with clear error
- Employee create/update/delete operations check permissions
- Role management UI shows all roles and their assigned permissions
- Tests cover: Admin can do everything, Viewer cannot mutate, Manager has correct permissions
- Permission errors return 403 with a user-friendly message

## Current State

- ✅ `role` and `role_permission` tables exist in schema (`schema-definitions.ts`)
- ✅ Permission types defined (`permissions.ts`)
- ✅ `withPermission` middleware exists in `rpc-middleware.ts` and throws 403
- ✅ Employee CRUD already gated by `withPermission` in `workforce.ts`
- ⚠️ Default roles are currently `admin`, `viewer`, `worker`, `project_manager`, `warehouse_manager` — must be consolidated to `ADMIN`, `MANAGER`, `VIEWER`
- ❌ Role management UI shows only role name/key/description, not permissions
- ❌ No `RoleModule` (deep module) for role queries with permissions
- ❌ No RPC endpoint to list roles with their permissions

## Seams

1. **Role seeds** (`apps/api/src/modules/rbac/role-seeds.ts`) — what default roles exist and what they can do
2. **RoleModule** (`apps/api/src/modules/rbac/role.module.ts`) — deep module for role queries
3. **RBAC contract** (`packages/contracts/src/rbac-contract.ts`) — RPC schema
4. **RBAC handler** (`apps/api/src/rpc/handlers/rbac.ts`) — RPC endpoints
5. **RolesSection UI** (`apps/web/src/features/app-shell/roles-section.tsx`) — visible permissions per role

## Public API

### RoleModule (new)

```typescript
// apps/api/src/modules/rbac/role.module.ts
export type RoleWithPermissions = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
};

export class RoleModule {
  list(): Promise<RoleWithPermissions[]>;
  getByKey(key: string): Promise<RoleWithPermissions | null>;
  getById(id: string): Promise<RoleWithPermissions | null>;
}
```

### RoleRepository (new seam)

```typescript
// apps/api/src/modules/rbac/role.repository.ts
export interface RoleRepository {
  findAll(): Promise<RoleWithPermissions[]>;
  findById(id: string): Promise<RoleWithPermissions | null>;
  findByKey(key: string): Promise<RoleWithPermissions | null>;
}

export class InMemoryRoleRepository implements RoleRepository { /* tests */ }
export class SqliteRoleRepository implements RoleRepository { /* Drizzle */ }
```

### Default role permission set (refactor)

```typescript
ADMIN    → all permissions
MANAGER  → employees.*, projects.*, warehouses.*, inventory.*, debts.read
VIEWER   → employees.read, projects.read, warehouses.read, inventory.read,
           debts.read, invoices.read, payments.read
```

### RBAC RPC contract (new)

```typescript
// packages/contracts/src/rbac-contract.ts
export const rbacContract = {
  rbacRolesList: oc.output(createListSchema(roleWithPermissionsSchema)),
  rbacRolesGet: oc.input(idInputSchema).output(createEntityResultSchema(roleWithPermissionsSchema)),
} as const;
```

## Internal Dependencies

```
role.module.ts → role.repository.ts
rbac.ts handler → role.module
roles-section UI → rbacRolesList RPC → RoleModule
```

## Planned Tests

### Unit tests

- `role-seeds.test.ts` — ADMIN, MANAGER, VIEWER seeded with correct permission sets
- `role.module.test.ts` — `RoleModule.list()` returns all 3 roles with correct permissions
- `role.module.test.ts` — `RoleModule.getByKey("admin")` returns ADMIN
- `role.module.test.ts` — `RoleModule.getByKey("unknown")` returns null
- `in-memory-role.repository.test.ts` — repository CRUD

### Integration tests

- `rbac-handler.test.ts` — `rbacRolesList` returns ADMIN/MANAGER/VIEWER
- `rbac-handler.test.ts` — `rbacRolesList` rejects unauthorized (no permission)
- `workforce-handler.test.ts` — viewer cannot `employeesCreate` (403)
- `workforce-handler.test.ts` — manager can `employeesCreate` (success)
- `workforce-handler.test.ts` — admin can `employeesCreate` (success)

## Implementation Risks

- Changing role keys from `admin`/`viewer`/`worker`/`project_manager`/`warehouse_manager` to `admin`/`manager`/`viewer` may break existing databases. The `ensureSeedRolePermissions` migration must be idempotent.
- The 5-role → 3-role change must not break existing tests. The `role-seeds.test.ts` is the main test to update.
- The deep module pattern requires that all role queries go through `RoleModule`, not through direct repository calls in handlers.

## Deviations from Architecture

- We consolidate 5 default roles into 3 (ADMIN, MANAGER, VIEWER) per the issue's acceptance criteria. The 5-role system was an internal-only design that pre-dated the issue.
- The role management UI is admin-only via `withPermission("employees.read", ...)` for now. A more granular `rbac.roles.read` permission could be added later.
- `rbacRolesList` requires `employees.read` as a coarse-grained gate. This is intentional — anyone who can view employees can also see what role types exist.

## Optional employee authentication identity

Employee records remain workforce records and do not require login access. The
employee table therefore carries a nullable, unique-in-practice link to the
Better Auth `user` table through `user_id`. The initial schema only establishes
the nullable foreign key; creating users, enabling login, and resolving login
allow/deny policy are separate behavior changes.

The link uses `ON DELETE SET NULL` so removing an authentication identity does
not delete the employee's workforce history. The employee's current role
remains unchanged until the separate multi-role assignment model is adopted.

Focused tests for this foundation cover the fresh schema definition, upgrading
a legacy employee table with no `user_id`, idempotent reruns, enforcing one
employee per user, and enforcing the foreign-key delete behavior. The
status-constraint rebuild carries the same nullable column, uniqueness, and
foreign-key definition so existing links remain valid when that legacy rebuild
runs; a full startup integration fixture for that unrelated migration remains
future work.
