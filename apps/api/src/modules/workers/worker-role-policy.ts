import type { WorkerRole } from "./worker.entity";

type WorkerRolePolicy = {
  requiresManager: boolean;
  requiresProject: boolean;
  canManageProjects: boolean;
  canManageWarehouses: boolean;
};

const workerRolePolicies: Record<WorkerRole, WorkerRolePolicy> = {
  WORKER: {
    requiresManager: true,
    requiresProject: true,
    canManageProjects: false,
    canManageWarehouses: false,
  },
  PROJECT_MANAGER: {
    requiresManager: false,
    requiresProject: false,
    canManageProjects: true,
    canManageWarehouses: false,
  },
  WAREHOUSE_MANAGER: {
    requiresManager: false,
    requiresProject: false,
    canManageProjects: false,
    canManageWarehouses: true,
  },
};

export function getWorkerRolePolicy(role: WorkerRole): WorkerRolePolicy {
  return workerRolePolicies[role];
}
