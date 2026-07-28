import type { Permission } from "./permissions";
import { ALL_PERMISSIONS } from "./permissions";

export type RoleSeed = {
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
};

export type RolePermissionSeed = {
  role: RoleSeed;
  permissions: Permission[];
};

/**
 * Default roles seeded on first run (Issue #10 — three-tier RBAC):
 *
 *  - ADMIN   → all permissions (system owner, bootstrap user)
 *  - MANAGER → day-to-day operations on employees, projects, warehouses,
 *              inventory, plus read-only on debts
 *  - VIEWER  → read-only across all entities
 *
 * Custom roles can be added at runtime; these three are the immutable
 * starting set. Other internal roles that previously existed
 * (worker, project_manager, warehouse_manager) are intentionally
 * consolidated into MANAGER per the Slice 3 acceptance criteria.
 *
 * All permission strings use the `resource:action` form.
 */
export const DEFAULT_ROLE_PERMISSIONS: RolePermissionSeed[] = [
  {
    role: {
      key: "admin",
      name: "مدير النظام",
      description: "الحساب الإداري الرئيسي — له جميع الصلاحيات",
      isSystem: true,
    },
    permissions: [...ALL_PERMISSIONS] as Permission[],
  },
  {
    role: {
      key: "manager",
      name: "مدير عمليات",
      description: "يدير الموظفين والمشاريع والمستودعات والمخزون — صلاحيات تشغيلية كاملة",
      isSystem: true,
    },
    permissions: [
      "employees:create",
      "employees:read",
      "employees:update",
      "employees:delete",
      "projects:create",
      "projects:read",
      "projects:update",
      "projects:delete",
      "warehouses:create",
      "warehouses:read",
      "warehouses:update",
      "warehouses:delete",
      "inventory:create",
      "inventory:read",
      "inventory:update",
      "inventory:delete",
      "inventory:transfer",
      "debts:read",
    ] as Permission[],
  },
  {
    role: {
      key: "viewer",
      name: "مشاهد",
      description: "حساب للقراءة فقط — لا يمكنه تعديل أي بيانات",
      isSystem: true,
    },
    permissions: [
      "employees:read",
      "projects:read",
      "warehouses:read",
      "inventory:read",
      "debts:read",
      "invoices:read",
      "payments:read",
    ] as Permission[],
  },
];

export function getPermissionsForRole(roleKey: string): Permission[] {
  const seed = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === roleKey);
  return seed ? [...seed.permissions] : [];
}
