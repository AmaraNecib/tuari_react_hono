import { oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";

export const workerRoleValues = [
  "WORKER",
  "PROJECT_MANAGER",
  "WAREHOUSE_MANAGER",
] as const;

export const workerStatusValues = [
  "ACTIVE",
  "INACTIVE",
  "ON_LEAVE",
] as const;

export const salaryTransactionTypeValues = [
  "SALARY_SET",
  "SALARY_BONUS",
  "SALARY_DEDUCTION",
  "SALARY_PAYMENT",
] as const;

export const auditEntityTypeValues = [
  "WORKER",
  "PROJECT",
  "WAREHOUSE",
  "SALARY_TRANSACTION",
] as const;

export const auditActionTypeValues = [
  "CREATED",
  "UPDATED",
  "STATUS_CHANGED",
  "MANAGER_CHANGED",
  "PROJECT_CHANGED",
  "SALARY_CHANGED",
  "SOFT_DELETED",
] as const;

export const workerRoleSchema = z.enum(workerRoleValues);
export const workerStatusSchema = z.enum(workerStatusValues);
export const salaryTransactionTypeSchema = z.enum(salaryTransactionTypeValues);
export const auditEntityTypeSchema = z.enum(auditEntityTypeValues);
export const auditActionTypeSchema = z.enum(auditActionTypeValues);

const isoDateSchema = z.string().datetime({ offset: true });
const nullableIsoDateSchema = isoDateSchema.nullable();

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

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
});

export const workerReferenceSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  role: workerRoleSchema,
});

export const projectReferenceSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const warehouseReferenceSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const workerSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  phoneNumber: z.string(),
  role: workerRoleSchema,
  status: workerStatusSchema,
  salaryDzd: z.number().int().nonnegative(),
  managerId: z.string().nullable(),
  currentProjectId: z.string().nullable(),
  manager: workerReferenceSchema.nullable(),
  currentProject: projectReferenceSchema.nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  managerId: z.string(),
  warehouseId: z.string().nullable(),
  manager: workerReferenceSchema,
  warehouse: warehouseReferenceSchema.nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const warehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  managerId: z.string().nullable(),
  manager: workerReferenceSchema.nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const salaryTransactionSchema = z.object({
  id: z.string(),
  workerId: z.string(),
  type: salaryTransactionTypeSchema,
  amountDzd: z.number().int().nonnegative(),
  note: z.string().nullable(),
  beforeSalaryDzd: z.number().int().nonnegative().nullable(),
  afterSalaryDzd: z.number().int().nonnegative().nullable(),
  effectiveAt: isoDateSchema,
  createdAt: isoDateSchema,
  createdByUser: sessionUserSchema.nullable(),
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

const workerCoreInputSchema = z.object({
  fullName: z.string().min(1).max(160),
  phoneNumber: z.string().min(1).max(40),
  salaryDzd: z.number().int().nonnegative(),
});

export const createWorkerInputSchema = z.discriminatedUnion("role", [
  workerCoreInputSchema.extend({
    role: z.literal("WORKER"),
    managerId: z.string().min(1),
    currentProjectId: z.string().min(1),
  }),
  workerCoreInputSchema.extend({
    role: z.literal("PROJECT_MANAGER"),
  }),
  workerCoreInputSchema.extend({
    role: z.literal("WAREHOUSE_MANAGER"),
  }),
]);

export const updateWorkerInputSchema = z.object({
  id: z.string(),
  fullName: z.string().min(1).max(160).optional(),
  phoneNumber: z.string().min(1).max(40).optional(),
});

export const reassignWorkerInputSchema = z.object({
  workerId: z.string(),
  managerId: z.string(),
  projectId: z.string(),
});

export const changeWorkerStatusInputSchema = z.object({
  workerId: z.string(),
  status: workerStatusSchema,
});

export const recordSalaryTransactionInputSchema = z.object({
  workerId: z.string(),
  type: salaryTransactionTypeSchema,
  amountDzd: z.number().int().nonnegative(),
  note: z.string().trim().max(300).nullable().optional(),
  effectiveAt: isoDateSchema.optional(),
});

export const workerListInputSchema = z
  .object({
    role: workerRoleSchema.optional(),
    status: workerStatusSchema.optional(),
    managerId: z.string().optional(),
    currentProjectId: z.string().optional(),
    includeDeleted: z.boolean().optional(),
  })
  .optional();

export const createProjectInputSchema = z.object({
  name: z.string().min(1).max(160),
  managerId: z.string().min(1),
  warehouseId: z.string().nullable().optional(),
});

export const updateProjectInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(160).optional(),
  managerId: z.string().min(1).optional(),
  warehouseId: z.string().nullable().optional(),
});

export const projectListInputSchema = z
  .object({
    managerId: z.string().optional(),
    warehouseId: z.string().optional(),
    includeDeleted: z.boolean().optional(),
  })
  .optional();

export const createWarehouseInputSchema = z.object({
  name: z.string().min(1).max(160),
  managerId: z.string().nullable().optional(),
});

export const updateWarehouseInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(160).optional(),
  managerId: z.string().nullable().optional(),
});

export const warehouseListInputSchema = z
  .object({
    managerId: z.string().optional(),
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
  workers: {
    list: oc.input(workerListInputSchema).output(z.array(workerSchema)),
    get: oc.input(idInputSchema).output(workerSchema),
    create: oc.input(createWorkerInputSchema).output(workerSchema),
    update: oc.input(updateWorkerInputSchema).output(workerSchema),
    reassign: oc.input(reassignWorkerInputSchema).output(workerSchema),
    changeStatus: oc
      .input(changeWorkerStatusInputSchema)
      .output(workerSchema),
    delete: oc
      .input(idInputSchema)
      .output(z.object({ success: z.boolean() })),
    activity: oc.input(idInputSchema).output(z.array(auditLogSchema)),
    salary: {
      list: oc.input(idInputSchema).output(z.array(salaryTransactionSchema)),
      record: oc
        .input(recordSalaryTransactionInputSchema)
        .output(
          z.object({
            worker: workerSchema,
            transaction: salaryTransactionSchema,
          }),
        ),
    },
  },
  projects: {
    list: oc.input(projectListInputSchema).output(z.array(projectSchema)),
    get: oc.input(idInputSchema).output(projectSchema),
    create: oc.input(createProjectInputSchema).output(projectSchema),
    update: oc.input(updateProjectInputSchema).output(projectSchema),
    delete: oc
      .input(idInputSchema)
      .output(z.object({ success: z.boolean() })),
  },
  warehouses: {
    list: oc.input(warehouseListInputSchema).output(z.array(warehouseSchema)),
    get: oc.input(idInputSchema).output(warehouseSchema),
    create: oc.input(createWarehouseInputSchema).output(warehouseSchema),
    update: oc.input(updateWarehouseInputSchema).output(warehouseSchema),
    delete: oc
      .input(idInputSchema)
      .output(z.object({ success: z.boolean() })),
  },
  audits: {
    list: oc.input(auditListInputSchema).output(z.array(auditLogSchema)),
  },
};

export type AppContract = typeof appContract;
export type AppClient = ContractRouterClient<AppContract>;
