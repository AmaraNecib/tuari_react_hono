import { z } from "zod";

import {
  algerianPhoneSchema,
  assignmentStatusSchema,
  auditActorUserIdSchema,
  auditTransactionIdSchema,
  cursorPaginationInputSchema,
  employeeBatchLimit,
  employeeStatusSchema,
  entityIdSchema,
  nullableTextSchema,
  roleKeySchema,
  salaryPeriodSchema,
  timestampSchema,
} from "./core";

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
  salaryAmountDzd: z.number().nonnegative().nullable(),
  salaryPeriod: salaryPeriodSchema.nullable(),
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
  actorUserId: auditActorUserIdSchema,
  transactionId: auditTransactionIdSchema,
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
  actorUserId: auditActorUserIdSchema,
  transactionId: auditTransactionIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const employeeWarehouseAssignmentSchema = z.object({
  id: entityIdSchema,
  employeeId: entityIdSchema,
  warehouseId: entityIdSchema,
  status: assignmentStatusSchema,
  startDate: timestampSchema,
  endDate: timestampSchema.nullable(),
  notes: nullableTextSchema,
  actorUserId: auditActorUserIdSchema,
  transactionId: auditTransactionIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const employeeStateHistorySchema = z.object({
  id: entityIdSchema,
  employeeId: entityIdSchema,
  roleId: entityIdSchema,
  status: z.string(),
  salaryAmountDzd: z.number().nullable(),
  salaryPeriod: salaryPeriodSchema.nullable(),
  eventType: z.string(),
  startDate: timestampSchema,
  endDate: timestampSchema.nullable(),
  notes: nullableTextSchema,
  actorUserId: auditActorUserIdSchema,
  transactionId: auditTransactionIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const employeeSalaryPaymentSchema = z.object({
  id: entityIdSchema,
  employeeId: entityIdSchema,
  periodType: salaryPeriodSchema,
  expectedAmountDzd: z.number().nonnegative(),
  actualAmountDzd: z.number().nonnegative(),
  paymentDate: timestampSchema,
  note: nullableTextSchema,
  actorUserId: auditActorUserIdSchema,
  transactionId: auditTransactionIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
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
  salaryAmountDzd: z.number().nonnegative().nullable().optional(),
  salaryPeriod: salaryPeriodSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const employeeBatchCreateRowInputSchema = employeeCreateInputSchema.extend({
  managerId: entityIdSchema.nullable().optional(),
  projectId: entityIdSchema.nullable().optional(),
});

export const employeeUpdateInputSchema = z.object({
  id: entityIdSchema,
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  phone: algerianPhoneSchema.optional(),
  roleId: entityIdSchema.optional(),
  status: employeeStatusSchema.optional(),
  salaryAmountDzd: z.number().nonnegative().nullable().optional(),
  salaryPeriod: salaryPeriodSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const employeeListInputSchema = z
  .object({
    roleId: entityIdSchema.optional(),
    status: employeeStatusSchema.optional(),
  })
  .optional();

/**
 * Paginated input for the employee list. Composes the existing filters
 * with cursor pagination fields. The `cursor` and `limit` come from the
 * shared cursor pagination schema.
 */
export const employeePagedListInputSchema = cursorPaginationInputSchema.extend({
  roleId: entityIdSchema.optional(),
  status: employeeStatusSchema.optional(),
}).optional();

export const employeeBatchCreateInputSchema = z
  .object({
    employees: z.array(employeeBatchCreateRowInputSchema).min(1).max(employeeBatchLimit),
  })
  .superRefine(({ employees }, ctx) => {
    const seenPhones = new Map<string, number>();

    employees.forEach((employee, index) => {
      const normalizedPhone = employee.phone.trim();
      const existingIndex = seenPhones.get(normalizedPhone);

      if (existingIndex !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "تم تكرار رقم الهاتف داخل نفس الدفعة.",
          path: ["employees", index, "phone"],
        });
        return;
      }

      seenPhones.set(normalizedPhone, index);
    });
  });

export const employeeBatchCreateResultSchema = z.object({
  employees: z.array(employeeSchema),
  managerAssignments: z.array(employeeManagerAssignmentSchema),
  projectAssignments: z.array(employeeProjectAssignmentSchema),
});

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

export const warehouseAssignmentCreateInputSchema = z.object({
  employeeId: entityIdSchema,
  warehouseId: entityIdSchema,
  status: assignmentStatusSchema.default("ACTIVE"),
  startDate: timestampSchema.optional(),
  endDate: timestampSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const employeeWorkplaceTypeSchema = z.enum(["NONE", "PROJECT", "WAREHOUSE"]);

export const employeeAssignWorkplaceInputSchema = z.object({
  employeeId: entityIdSchema,
  nextType: employeeWorkplaceTypeSchema,
  managerId: entityIdSchema.nullable().optional(),
  projectId: entityIdSchema.nullable().optional(),
  warehouseId: entityIdSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const employeeSyncManagedProjectsInputSchema = z.object({
  employeeId: entityIdSchema,
  projectIds: z.array(entityIdSchema),
});

export const employeeSyncManagedWarehousesInputSchema = z.object({
  employeeId: entityIdSchema,
  warehouseIds: z.array(entityIdSchema),
});

export const warehouseAssignmentEndInputSchema = z.object({
  id: entityIdSchema,
  endDate: timestampSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const warehouseAssignmentListInputSchema = z
  .object({
    employeeId: entityIdSchema.optional(),
    warehouseId: entityIdSchema.optional(),
    status: assignmentStatusSchema.optional(),
  })
  .optional();

export const employeeStateHistoryListInputSchema = z
  .object({ employeeId: entityIdSchema.optional() })
  .optional();

export const employeeSalaryPaymentCreateInputSchema = z.object({
  employeeId: entityIdSchema,
  actualAmountDzd: z.number().nonnegative(),
  paymentDate: timestampSchema.optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const employeeSalaryPaymentListInputSchema = z
  .object({ employeeId: entityIdSchema.optional() })
  .optional();

export type Role = z.infer<typeof roleSchema>;
export type Employee = z.infer<typeof employeeSchema>;
export type EmployeeManagerAssignment = z.infer<typeof employeeManagerAssignmentSchema>;
export type EmployeeProjectAssignment = z.infer<typeof employeeProjectAssignmentSchema>;
export type EmployeeWarehouseAssignment = z.infer<typeof employeeWarehouseAssignmentSchema>;
export type EmployeeStateHistory = z.infer<typeof employeeStateHistorySchema>;
export type EmployeeSalaryPayment = z.infer<typeof employeeSalaryPaymentSchema>;
export type RoleCreateInput = z.infer<typeof roleCreateInputSchema>;
export type RoleUpdateInput = z.infer<typeof roleUpdateInputSchema>;
export type EmployeeCreateInput = z.infer<typeof employeeCreateInputSchema>;
export type EmployeeBatchCreateRowInput = z.infer<typeof employeeBatchCreateRowInputSchema>;
export type EmployeeBatchCreateInput = z.infer<typeof employeeBatchCreateInputSchema>;
export type EmployeeBatchCreateResult = z.infer<typeof employeeBatchCreateResultSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateInputSchema>;
export type EmployeeAssignWorkplaceInput = z.infer<typeof employeeAssignWorkplaceInputSchema>;
export type EmployeeSyncManagedProjectsInput = z.infer<typeof employeeSyncManagedProjectsInputSchema>;
export type EmployeeSyncManagedWarehousesInput = z.infer<typeof employeeSyncManagedWarehousesInputSchema>;
export type EmployeeSalaryPaymentCreateInput = z.infer<typeof employeeSalaryPaymentCreateInputSchema>;
export type ManagerAssignmentCreateInput = z.infer<typeof managerAssignmentCreateInputSchema>;
export type ManagerAssignmentEndInput = z.infer<typeof managerAssignmentEndInputSchema>;
export type ProjectAssignmentCreateInput = z.infer<typeof projectAssignmentCreateInputSchema>;
export type ProjectAssignmentEndInput = z.infer<typeof projectAssignmentEndInputSchema>;
export type WarehouseAssignmentCreateInput = z.infer<typeof warehouseAssignmentCreateInputSchema>;
export type WarehouseAssignmentEndInput = z.infer<typeof warehouseAssignmentEndInputSchema>;
