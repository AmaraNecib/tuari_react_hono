import { oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";

export const entityIdSchema = z.string().min(1);
export const timestampSchema = z.string().datetime({ offset: true });
export const nullableTextSchema = z.string().trim().min(1).nullable();

export const algerianPhoneSchema = z.string().trim().regex(/^(05|06|07)\d{8}$/);

export const phonePasswordSignInSchema = z.object({
  phone: algerianPhoneSchema,
  password: z.string().min(8).max(128),
  rememberMe: z.boolean().optional(),
});

export const authBootstrapInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: algerianPhoneSchema,
  password: z.string().min(8).max(128),
  setupSecret: z.string().trim().min(1).max(256).optional(),
});

export const appErrorCodeSchema = z.enum([
  "VALIDATION",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "CONFLICT",
  "BUSINESS_RULE",
]);

export const fieldErrorSchema = z.object({
  field: z.string().min(1),
  message: z.string().min(1),
});

export const appErrorSchema = z.object({
  code: appErrorCodeSchema,
  message: z.string().min(1),
  fieldErrors: z.array(fieldErrorSchema).default([]),
});

export const mutationSuccessSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1),
});

export const mutationFailureSchema = z.object({
  success: z.literal(false),
  error: appErrorSchema,
});

const createListSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
  });

const createEntityResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.union([
    mutationFailureSchema,
    mutationSuccessSchema.extend({
      item: itemSchema,
    }),
  ]);

const createDeleteResultSchema = z.union([
  mutationFailureSchema,
  mutationSuccessSchema,
]);

export const employeeStatusSchema = z.enum(["ACTIVE", "INACTIVE", "LEFT"]);
export const projectStatusSchema = z.enum([
  "ACTIVE",
  "STOPPED",
  "COMPLETED",
  "ARCHIVED",
]);
export const warehouseStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
export const assignmentStatusSchema = z.enum(["ACTIVE", "ENDED", "ARCHIVED"]);

export const roleKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/);

export const roleSchema = z.object({
  id: entityIdSchema,
  key: roleKeySchema,
  name: z.string().trim().min(1).max(120),
  description: nullableTextSchema,
  isSystem: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const employeeSchema = z.object({
  id: entityIdSchema,
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: algerianPhoneSchema,
  roleId: entityIdSchema,
  status: employeeStatusSchema,
  notes: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const employeeManagerAssignmentSchema = z.object({
  id: entityIdSchema,
  workerId: entityIdSchema,
  managerId: entityIdSchema,
  status: assignmentStatusSchema,
  startDate: timestampSchema,
  endDate: timestampSchema.nullable(),
  notes: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const employeeProjectAssignmentSchema = z.object({
  id: entityIdSchema,
  employeeId: entityIdSchema,
  projectId: entityIdSchema,
  status: assignmentStatusSchema,
  startDate: timestampSchema,
  endDate: timestampSchema.nullable(),
  notes: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const projectSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(160),
  location: nullableTextSchema,
  managerId: entityIdSchema.nullable(),
  status: projectStatusSchema,
  notes: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const warehouseSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(160),
  address: nullableTextSchema,
  managerId: entityIdSchema.nullable(),
  status: warehouseStatusSchema,
  notes: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const sessionUserSchema = z.object({
  id: entityIdSchema,
  name: z.string().min(1).nullable(),
  phone: z.string().min(1),
});

export const healthCheckSchema = z.object({
  status: z.literal("ok"),
  timestamp: timestampSchema,
});

export const sessionSchema = z.object({
  user: sessionUserSchema.nullable(),
});

export const authSetupStatusSchema = z.object({
  hasUsers: z.boolean(),
  requiresSetupKey: z.boolean(),
});

export const idInputSchema = z.object({
  id: entityIdSchema,
});

export const roleCreateInputSchema = z.object({
  key: roleKeySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
});

export const roleUpdateInputSchema = z.object({
  id: entityIdSchema,
  key: roleKeySchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export const employeeCreateInputSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: algerianPhoneSchema,
  roleId: entityIdSchema,
  status: employeeStatusSchema.default("ACTIVE"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const employeeUpdateInputSchema = z.object({
  id: entityIdSchema,
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  phone: algerianPhoneSchema.optional(),
  roleId: entityIdSchema.optional(),
  status: employeeStatusSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const employeeListInputSchema = z
  .object({
    roleId: entityIdSchema.optional(),
    status: employeeStatusSchema.optional(),
  })
  .optional();

export const projectCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  location: z.string().trim().max(500).nullable().optional(),
  managerId: entityIdSchema.nullable().optional(),
  status: projectStatusSchema.default("ACTIVE"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const projectUpdateInputSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(160).optional(),
  location: z.string().trim().max(500).nullable().optional(),
  managerId: entityIdSchema.nullable().optional(),
  status: projectStatusSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const projectListInputSchema = z
  .object({
    managerId: entityIdSchema.optional(),
    status: projectStatusSchema.optional(),
  })
  .optional();

export const warehouseCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(500).nullable().optional(),
  managerId: entityIdSchema.nullable().optional(),
  status: warehouseStatusSchema.default("ACTIVE"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const warehouseUpdateInputSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(160).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  managerId: entityIdSchema.nullable().optional(),
  status: warehouseStatusSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const warehouseListInputSchema = z
  .object({
    managerId: entityIdSchema.optional(),
    status: warehouseStatusSchema.optional(),
  })
  .optional();

export const managerAssignmentCreateInputSchema = z.object({
  workerId: entityIdSchema,
  managerId: entityIdSchema,
  status: assignmentStatusSchema.default("ACTIVE"),
  startDate: timestampSchema.optional(),
  endDate: timestampSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const managerAssignmentEndInputSchema = z.object({
  id: entityIdSchema,
  endDate: timestampSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const managerAssignmentListInputSchema = z
  .object({
    workerId: entityIdSchema.optional(),
    managerId: entityIdSchema.optional(),
    status: assignmentStatusSchema.optional(),
  })
  .optional();

export const projectAssignmentCreateInputSchema = z.object({
  employeeId: entityIdSchema,
  projectId: entityIdSchema,
  status: assignmentStatusSchema.default("ACTIVE"),
  startDate: timestampSchema.optional(),
  endDate: timestampSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const projectAssignmentEndInputSchema = z.object({
  id: entityIdSchema,
  endDate: timestampSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const projectAssignmentListInputSchema = z
  .object({
    employeeId: entityIdSchema.optional(),
    projectId: entityIdSchema.optional(),
    status: assignmentStatusSchema.optional(),
  })
  .optional();

export const appContract = {
  health: oc.output(healthCheckSchema),
  session: oc.output(sessionSchema),
  authSetupStatus: oc.output(authSetupStatusSchema),
  authBootstrap: oc
    .input(authBootstrapInputSchema)
    .output(createEntityResultSchema(sessionUserSchema)),
  rolesList: oc.output(createListSchema(roleSchema)),
  rolesGet: oc.input(idInputSchema).output(createEntityResultSchema(roleSchema)),
  rolesCreate: oc
    .input(roleCreateInputSchema)
    .output(createEntityResultSchema(roleSchema)),
  rolesUpdate: oc
    .input(roleUpdateInputSchema)
    .output(createEntityResultSchema(roleSchema)),
  rolesDelete: oc.input(idInputSchema).output(createDeleteResultSchema),
  employeesList: oc
    .input(employeeListInputSchema)
    .output(createListSchema(employeeSchema)),
  employeesGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(employeeSchema)),
  employeesCreate: oc
    .input(employeeCreateInputSchema)
    .output(createEntityResultSchema(employeeSchema)),
  employeesUpdate: oc
    .input(employeeUpdateInputSchema)
    .output(createEntityResultSchema(employeeSchema)),
  projectsList: oc.input(projectListInputSchema).output(createListSchema(projectSchema)),
  projectsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(projectSchema)),
  projectsCreate: oc
    .input(projectCreateInputSchema)
    .output(createEntityResultSchema(projectSchema)),
  projectsUpdate: oc
    .input(projectUpdateInputSchema)
    .output(createEntityResultSchema(projectSchema)),
  warehousesList: oc
    .input(warehouseListInputSchema)
    .output(createListSchema(warehouseSchema)),
  warehousesGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(warehouseSchema)),
  warehousesCreate: oc
    .input(warehouseCreateInputSchema)
    .output(createEntityResultSchema(warehouseSchema)),
  warehousesUpdate: oc
    .input(warehouseUpdateInputSchema)
    .output(createEntityResultSchema(warehouseSchema)),
  managerAssignmentsList: oc
    .input(managerAssignmentListInputSchema)
    .output(createListSchema(employeeManagerAssignmentSchema)),
  managerAssignmentsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(employeeManagerAssignmentSchema)),
  managerAssignmentsCreate: oc
    .input(managerAssignmentCreateInputSchema)
    .output(createEntityResultSchema(employeeManagerAssignmentSchema)),
  managerAssignmentsEnd: oc
    .input(managerAssignmentEndInputSchema)
    .output(createEntityResultSchema(employeeManagerAssignmentSchema)),
  projectAssignmentsList: oc
    .input(projectAssignmentListInputSchema)
    .output(createListSchema(employeeProjectAssignmentSchema)),
  projectAssignmentsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(employeeProjectAssignmentSchema)),
  projectAssignmentsCreate: oc
    .input(projectAssignmentCreateInputSchema)
    .output(createEntityResultSchema(employeeProjectAssignmentSchema)),
  projectAssignmentsEnd: oc
    .input(projectAssignmentEndInputSchema)
    .output(createEntityResultSchema(employeeProjectAssignmentSchema)),
};

export type PhonePasswordSignInInput = z.infer<typeof phonePasswordSignInSchema>;
export type AuthBootstrapInput = z.infer<typeof authBootstrapInputSchema>;
export type AppErrorCode = z.infer<typeof appErrorCodeSchema>;
export type AppError = z.infer<typeof appErrorSchema>;
export type RoleCreateInput = z.infer<typeof roleCreateInputSchema>;
export type RoleUpdateInput = z.infer<typeof roleUpdateInputSchema>;
export type EmployeeCreateInput = z.infer<typeof employeeCreateInputSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateInputSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateInputSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateInputSchema>;
export type WarehouseCreateInput = z.infer<typeof warehouseCreateInputSchema>;
export type WarehouseUpdateInput = z.infer<typeof warehouseUpdateInputSchema>;
export type ManagerAssignmentCreateInput = z.infer<typeof managerAssignmentCreateInputSchema>;
export type ManagerAssignmentEndInput = z.infer<typeof managerAssignmentEndInputSchema>;
export type ProjectAssignmentCreateInput = z.infer<typeof projectAssignmentCreateInputSchema>;
export type ProjectAssignmentEndInput = z.infer<typeof projectAssignmentEndInputSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Employee = z.infer<typeof employeeSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Warehouse = z.infer<typeof warehouseSchema>;
export type EmployeeManagerAssignment = z.infer<
  typeof employeeManagerAssignmentSchema
>;
export type EmployeeProjectAssignment = z.infer<
  typeof employeeProjectAssignmentSchema
>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type AppContract = typeof appContract;
export type AppClient = ContractRouterClient<AppContract>;
