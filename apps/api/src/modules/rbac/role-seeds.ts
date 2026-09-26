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
 * Default roles seeded on first run (issue #20 workforce model — single-actor):
 *
 *  - ADMIN             → all permissions (system owner / bootstrap user). In
 *                        the MVP the admin is the ONLY role that acts in the
 *                        app and performs every assignment.
 *  - PROJECT_MANAGER   → organizational label (one or more projects + their
 *                        workers); no app permissions yet.
 *  - WAREHOUSE_MANAGER → organizational label (a warehouse + its team); no
 *                        app permissions yet.
 *  - WORKER            → organizational label (a worker assigned to one
 *                        project under a manager, or to a warehouse); no app
 *                        permissions yet.
 *
 * WHY `manager` / `viewer` were REMOVED, and how to bring them back:
 *  The captain moved to a single-actor model — only `admin` acts. The former
 *  `manager` (day-to-day ops CRUD) and `viewer` (read-only) roles from the
 *  older three-tier RBAC were removed from the seed entirely: they held
 *  permissions that let a non-admin account act, which is not wanted. They are
 *  GONE from freshly-seeded databases. (An already-provisioned database that
 *  seeded them before this change keeps its rows, but the UI role selector and
 *  the backend `ASSIGNABLE_ROLE_KEYS` no longer offer them, so they cannot be
 *  assigned to a new employee; issue #20's scope covers the fresh-creation
 *  path, not tearing down long-lived databases — see the #263 follow-up.)
 *  To re-add manager or viewer later, define a RolePermissionSeed here (with
 *  the desired permission strings), add the key to `roleSeeds` in
 *  schema-definitions.ts and to `ASSIGNABLE_ROLE_KEYS` in company.types.ts,
 *  then offer it in the UI role selector. RBAC reads these seeds at first-run
 *  seeding and enforces whatever permissions the role holds.
 *
 * The three workforce labels carry EMPTY permissions on purpose: they do not
 * sign in or act in the MVP (the admin orchestrates; the labels organize who
 * manages what and which worker belongs to which project). Empty keeps any
 * future permission grant purely additive and unable to break callers.
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
      key: "project_manager",
      name: "مدير مشروع",
      description: "منظم — يدير واحدًا أو أكثر من المشاريع والعاملين المرتبطين بها",
      isSystem: true,
    },
    // Organizational labels: they do NOT sign in or hold app permissions in
    // the MVP — the admin performs every action. Empty here on purpose so a
    // future permission grant is purely additive and cannot break callers.
    permissions: [] as Permission[],
  },
  {
    role: {
      key: "warehouse_manager",
      name: "مدير مخزن",
      description: "منظم — يدير المستودع وفريق العاملين المرتبطين به",
      isSystem: true,
    },
    permissions: [] as Permission[],
  },
  {
    role: {
      key: "worker",
      name: "عامل",
      description: "منظم — العامل الميداني المرتبط بمشروع تحت مدير أو بمستودع",
      isSystem: true,
    },
    permissions: [] as Permission[],
  },
];

export function getPermissionsForRole(roleKey: string): Permission[] {
  const seed = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === roleKey);
  return seed ? [...seed.permissions] : [];
}
