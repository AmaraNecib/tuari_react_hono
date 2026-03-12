export const systemRoleKeys = {
  worker: "worker",
  projectManager: "project_manager",
  warehouseManager: "warehouse_manager",
} as const;

export type SystemRoleKey = (typeof systemRoleKeys)[keyof typeof systemRoleKeys];

export type SystemRoleSeed = {
  id: string;
  key: SystemRoleKey;
  name: string;
  description: string;
};

export const systemRoles: SystemRoleSeed[] = [
  {
    id: "system-role-worker",
    key: systemRoleKeys.worker,
    name: "Worker",
    description: "Field employee assigned to day-to-day project work.",
  },
  {
    id: "system-role-project-manager",
    key: systemRoleKeys.projectManager,
    name: "Project Manager",
    description: "Employee responsible for managing projects and supervising workers.",
  },
  {
    id: "system-role-warehouse-manager",
    key: systemRoleKeys.warehouseManager,
    name: "Warehouse Manager",
    description: "Employee responsible for warehouse operations.",
  },
];
