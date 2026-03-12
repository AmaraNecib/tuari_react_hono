import { oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";

export const systemRoleKeyValues = [
  "worker",
  "project_manager",
  "warehouse_manager",
] as const;

export const employeeStatusValues = [
  "ACTIVE",
  "INACTIVE",
  "LEFT",
] as const;

export const projectStatusValues = [
  "ACTIVE",
  "STOPPED",
  "COMPLETED",
  "ARCHIVED",
] as const;

export const warehouseStatusValues = [
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
] as const;

export const assignmentStatusValues = [
  "ACTIVE",
  "ENDED",
  "CANCELLED",
] as const;

export const auditEntityTypeValues = [
  "ROLE",
  "EMPLOYEE",
  "PROJECT",
  "WAREHOUSE",
  "EMPLOYEE_MANAGER_ASSIGNMENT",
  "EMPLOYEE_PROJECT_ASSIGNMENT",
] as const;

export const auditActionTypeValues = [
  "CREATED",
  "UPDATED",
  "STATUS_CHANGED",
  "SOFT_DELETED",
  "MANAGER_ASSIGNED",
  "MANAGER_REASSIGNED",
  "MANAGER_UNASSIGNED",
  "PROJECT_ASSIGNED",
  "PROJECT_REASSIGNED",
  "PROJECT_UNASSIGNED",
  "PROJECT_MANAGER_ASSIGNED",
  "PROJECT_MANAGER_REASSIGNED",
  "PROJECT_MANAGER_UNASSIGNED",
  "WAREHOUSE_MANAGER_ASSIGNED",
  "WAREHOUSE_MANAGER_REASSIGNED",
  "WAREHOUSE_MANAGER_UNASSIGNED",
] as const;

export const systemRoleKeySchema = z.enum(systemRoleKeyValues);
export const employeeStatusSchema = z.enum(employeeStatusValues);
export const projectStatusSchema = z.enum(projectStatusValues);
export const warehouseStatusSchema = z.enum(warehouseStatusValues);
export const assignmentStatusSchema = z.enum(assignmentStatusValues);
export const auditEntityTypeSchema = z.enum(auditEntityTypeValues);
export const auditActionTypeSchema = z.enum(auditActionTypeValues);

const isoDateSchema = z.string().datetime({ offset: true });
const nullableIsoDateSchema = isoDateSchema.nullable();
const optionalTextSchema = z.string().trim().max(500).nullable().optional();
const roleKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_]+$/);
const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
});

export const roleSchema = z.object({
  id: z.string(),
  key: roleKeySchema,
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const roleReferenceSchema = roleSchema.pick({
  id: true,
  key: true,
  name: true,
  isSystem: true,
});

export const projectReferenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: projectStatusSchema,
  managerId: z.string().nullable(),
});

export const warehouseReferenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: warehouseStatusSchema,
  managerId: z.string().nullable(),
});

export const employeeReferenceSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  displayName: z.string(),
  status: employeeStatusSchema,
  role: roleReferenceSchema,
});

export const employeeManagerAssignmentSummarySchema = z.object({
  id: z.string(),
  managerId: z.string(),
  status: assignmentStatusSchema,
  startDate: isoDateSchema,
  endDate: nullableIsoDateSchema,
  notes: z.string().nullable(),
  manager: employeeReferenceSchema,
});

export const employeeProjectAssignmentSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  status: assignmentStatusSchema,
  startDate: isoDateSchema,
  endDate: nullableIsoDateSchema,
  notes: z.string().nullable(),
  project: projectReferenceSchema,
});

export const employeeSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  displayName: z.string(),
  phone: z.string().nullable(),
  roleId: z.string(),
  role: roleReferenceSchema,
  status: employeeStatusSchema,
  notes: z.string().nullable(),
  activeManagerAssignment: employeeManagerAssignmentSummarySchema.nullable(),
  activeProjectAssignments: z.array(employeeProjectAssignmentSummarySchema),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const employeeManagerAssignmentSchema = z.object({
  id: z.string(),
  workerId: z.string(),
  managerId: z.string(),
  status: assignmentStatusSchema,
  startDate: isoDateSchema,
  endDate: nullableIsoDateSchema,
  notes: z.string().nullable(),
  worker: employeeReferenceSchema,
  manager: employeeReferenceSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const employeeProjectAssignmentSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  projectId: z.string(),
  status: assignmentStatusSchema,
  startDate: isoDateSchema,
  endDate: nullableIsoDateSchema,
  notes: z.string().nullable(),
  employee: employeeReferenceSchema,
  project: projectReferenceSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string().nullable(),
  managerId: z.string().nullable(),
  manager: employeeReferenceSchema.nullable(),
  status: projectStatusSchema,
  notes: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const warehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  managerId: z.string().nullable(),
  manager: employeeReferenceSchema.nullable(),
  status: warehouseStatusSchema,
  notes: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const auditLogSchema = z.object({
  id: z.string(),
  entityType: auditEntityTypeSchema,
  entityId: z.string(),
  actionType: auditActionTypeSchema,
  summaryKey: z.string(),
  actorUser: sessionUserSchema.nullable(),
  occurredAt: isoDateSchema,
  before: jsonObjectSchema.nullable(),
  after: jsonObjectSchema.nullable(),
  metadata: jsonObjectSchema.nullable(),
});

const roleCoreInputSchema = z.object({
  key: roleKeySchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).nullable().optional(),
});

export const createRoleInputSchema = roleCoreInputSchema.extend({
  isSystem: z.literal(false).optional(),
});

export const updateRoleInputSchema = z.object({
  id: z.string(),
  key: roleKeySchema.optional(),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export const roleListInputSchema = z
  .object({
    key: roleKeySchema.optional(),
    isSystem: z.boolean().optional(),
    includeDeleted: z.boolean().optional(),
  })
  .optional();

export const createEmployeeInputSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  roleId: z.string().min(1),
  notes: z.string().trim().max(500).nullable().optional(),
  managerId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});

export const updateEmployeeInputSchema = z.object({
  id: z.string(),
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  roleId: z.string().min(1).optional(),
  status: employeeStatusSchema.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const employeeListInputSchema = z
  .object({
    roleId: z.string().optional(),
    roleKey: roleKeySchema.optional(),
    status: employeeStatusSchema.optional(),
    managerId: z.string().optional(),
    projectId: z.string().optional(),
    includeDeleted: z.boolean().optional(),
  })
  .optional();

const assignmentCoreInputSchema = z.object({
  status: assignmentStatusSchema.optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const createEmployeeManagerAssignmentInputSchema =
  assignmentCoreInputSchema.extend({
    workerId: z.string().min(1),
    managerId: z.string().min(1),
  });

export const updateEmployeeManagerAssignmentInputSchema =
  assignmentCoreInputSchema.extend({
    id: z.string(),
    managerId: z.string().min(1).optional(),
  });

export const employeeManagerAssignmentListInputSchema = z
  .object({
    workerId: z.string().optional(),
    managerId: z.string().optional(),
    status: assignmentStatusSchema.optional(),
    includeDeleted: z.boolean().optional(),
  })
  .optional();

export const createEmployeeProjectAssignmentInputSchema =
  assignmentCoreInputSchema.extend({
    employeeId: z.string().min(1),
    projectId: z.string().min(1),
  });

export const updateEmployeeProjectAssignmentInputSchema =
  assignmentCoreInputSchema.extend({
    id: z.string(),
    projectId: z.string().min(1).optional(),
  });

export const employeeProjectAssignmentListInputSchema = z
  .object({
    employeeId: z.string().optional(),
    projectId: z.string().optional(),
    status: assignmentStatusSchema.optional(),
    includeDeleted: z.boolean().optional(),
  })
  .optional();

export const createProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  location: z.string().trim().max(240).nullable().optional(),
  managerId: z.string().nullable().optional(),
  status: projectStatusSchema.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const updateProjectInputSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(160).optional(),
  location: z.string().trim().max(240).nullable().optional(),
  managerId: z.string().nullable().optional(),
  status: projectStatusSchema.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const projectListInputSchema = z
  .object({
    managerId: z.string().optional(),
    status: projectStatusSchema.optional(),
    includeDeleted: z.boolean().optional(),
  })
  .optional();

export const createWarehouseInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(240).nullable().optional(),
  managerId: z.string().nullable().optional(),
  status: warehouseStatusSchema.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const updateWarehouseInputSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(160).optional(),
  address: z.string().trim().max(240).nullable().optional(),
  managerId: z.string().nullable().optional(),
  status: warehouseStatusSchema.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const warehouseListInputSchema = z
  .object({
    managerId: z.string().optional(),
    status: warehouseStatusSchema.optional(),
    includeDeleted: z.boolean().optional(),
  })
  .optional();

export const auditListInputSchema = z
  .object({
    entityType: auditEntityTypeSchema.optional(),
    entityId: z.string().optional(),
    actorUserId: z.string().optional(),
    limit: z.number().int().positive().max(200).optional(),
  })
  .optional();

export const idInputSchema = z.object({
  id: z.string(),
});

export const appContract = {
  health: oc.output(
    z.object({
      status: z.literal("ok"),
      timestamp: isoDateSchema,
    }),
  ),
  session: oc.output(
    z.object({
      user: sessionUserSchema.nullable(),
    }),
  ),
  roles: {
    list: oc.input(roleListInputSchema).output(z.array(roleSchema)),
    get: oc.input(idInputSchema).output(roleSchema),
    create: oc.input(createRoleInputSchema).output(roleSchema),
    update: oc.input(updateRoleInputSchema).output(roleSchema),
    delete: oc.input(idInputSchema).output(z.object({ success: z.boolean() })),
  },
  employees: {
    list: oc.input(employeeListInputSchema).output(z.array(employeeSchema)),
    get: oc.input(idInputSchema).output(employeeSchema),
    create: oc.input(createEmployeeInputSchema).output(employeeSchema),
    update: oc.input(updateEmployeeInputSchema).output(employeeSchema),
    delete: oc.input(idInputSchema).output(z.object({ success: z.boolean() })),
    managerAssignments: {
      list: oc
        .input(employeeManagerAssignmentListInputSchema)
        .output(z.array(employeeManagerAssignmentSchema)),
      get: oc.input(idInputSchema).output(employeeManagerAssignmentSchema),
      create: oc
        .input(createEmployeeManagerAssignmentInputSchema)
        .output(employeeManagerAssignmentSchema),
      update: oc
        .input(updateEmployeeManagerAssignmentInputSchema)
        .output(employeeManagerAssignmentSchema),
      delete: oc
        .input(idInputSchema)
        .output(z.object({ success: z.boolean() })),
    },
    projectAssignments: {
      list: oc
        .input(employeeProjectAssignmentListInputSchema)
        .output(z.array(employeeProjectAssignmentSchema)),
      get: oc.input(idInputSchema).output(employeeProjectAssignmentSchema),
      create: oc
        .input(createEmployeeProjectAssignmentInputSchema)
        .output(employeeProjectAssignmentSchema),
      update: oc
        .input(updateEmployeeProjectAssignmentInputSchema)
        .output(employeeProjectAssignmentSchema),
      delete: oc
        .input(idInputSchema)
        .output(z.object({ success: z.boolean() })),
    },
  },
  projects: {
    list: oc.input(projectListInputSchema).output(z.array(projectSchema)),
    get: oc.input(idInputSchema).output(projectSchema),
    create: oc.input(createProjectInputSchema).output(projectSchema),
    update: oc.input(updateProjectInputSchema).output(projectSchema),
    delete: oc.input(idInputSchema).output(z.object({ success: z.boolean() })),
  },
  warehouses: {
    list: oc.input(warehouseListInputSchema).output(z.array(warehouseSchema)),
    get: oc.input(idInputSchema).output(warehouseSchema),
    create: oc.input(createWarehouseInputSchema).output(warehouseSchema),
    update: oc.input(updateWarehouseInputSchema).output(warehouseSchema),
    delete: oc.input(idInputSchema).output(z.object({ success: z.boolean() })),
  },
  audits: {
    list: oc.input(auditListInputSchema).output(z.array(auditLogSchema)),
  },
};

export type AppContract = typeof appContract;
export type AppClient = ContractRouterClient<AppContract>;
