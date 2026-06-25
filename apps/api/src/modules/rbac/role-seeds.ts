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
      key: "viewer",
      name: "مشاهد",
      description: "حساب للقراءة فقط — لا يمكنه تعديل أي بيانات",
      isSystem: true,
    },
    permissions: ["employees.read"],
  },
  {
    role: {
      key: "worker",
      name: "عامل",
      description: "الدور التنفيذي الأساسي للعمال الميدانيين",
      isSystem: true,
    },
    permissions: ["employees.read"],
  },
  {
    role: {
      key: "project_manager",
      name: "مدير مشروع",
      description: "مسؤول عن متابعة العمال والمشاريع الميدانية",
      isSystem: true,
    },
    permissions: ["employees.read", "employees.update", "invoices.read", "invoices.create", "invoices.update", "payments.read", "payments.create"],
  },
  {
    role: {
      key: "warehouse_manager",
      name: "مدير مخزن",
      description: "مسؤول عن تشغيل وإدارة المستودعات",
      isSystem: true,
    },
    permissions: ["employees.read", "invoices.read", "invoices.create", "invoices.update", "payments.read"],
  },
];

export function getPermissionsForRole(roleKey: string): Permission[] {
  const seed = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === roleKey);
  return seed ? [...seed.permissions] : [];
}
