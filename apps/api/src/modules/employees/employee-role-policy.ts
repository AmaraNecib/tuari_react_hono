import { systemRoleKeys } from "../roles/system-roles";

export type EmployeeRolePolicy = {
  requiresManager: boolean;
  requiresProject: boolean;
  canSuperviseEmployees: boolean;
  canManageProjects: boolean;
  canManageWarehouses: boolean;
};

const defaultPolicy: EmployeeRolePolicy = {
  requiresManager: false,
  requiresProject: false,
  canSuperviseEmployees: false,
  canManageProjects: false,
  canManageWarehouses: false,
};

const rolePolicies: Record<string, EmployeeRolePolicy> = {
  [systemRoleKeys.worker]: {
    requiresManager: true,
    requiresProject: true,
    canSuperviseEmployees: false,
    canManageProjects: false,
    canManageWarehouses: false,
  },
  [systemRoleKeys.projectManager]: {
    requiresManager: false,
    requiresProject: false,
    canSuperviseEmployees: true,
    canManageProjects: true,
    canManageWarehouses: false,
  },
  [systemRoleKeys.warehouseManager]: {
    requiresManager: false,
    requiresProject: false,
    canSuperviseEmployees: false,
    canManageProjects: false,
    canManageWarehouses: true,
  },
};

export function getEmployeeRolePolicy(roleKey: string): EmployeeRolePolicy {
  return rolePolicies[roleKey] ?? defaultPolicy;
}
