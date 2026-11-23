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
import { Money, SalaryReference } from "./exact-money";
import { SALARY_DAYS_PER_MONTH } from "./salary-days";

export const roleSchema = z.object({
  id: entityIdSchema,
  key: roleKeySchema,
  name: z.string().trim().min(1).max(120),
  description: nullableTextSchema,
  isSystem: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const exactMoneyStringSchema = z.string().max(96).superRefine((value, ctx) => {
  try {
    Money.parse(value);
  } catch {
    ctx.addIssue({ code: "custom", message: "workforce.validation.earning.amountPrecision" });
  }
});

export const employeeSalaryReferenceSchema = z.object({
  period: salaryPeriodSchema,
  amount: z.string({ error: "workforce.validation.salaryReference.amountType" }).max(96, { message: "workforce.validation.salaryReference.amountLength" }),
}, { error: "workforce.validation.salaryReference.invalid" }).superRefine((value, ctx) => {
  try {
    SalaryReference.parse(value.period, value.amount);
  } catch {
    ctx.addIssue({ code: "custom", path: ["amount"], message: "workforce.validation.salaryReference.precision" });
  }
});

export const employeeSchema = z.object({
  id: entityIdSchema,
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: algerianPhoneSchema,
  roleId: entityIdSchema,
  status: employeeStatusSchema,
  salaryReference: employeeSalaryReferenceSchema.nullable(),
  notes: nullableTextSchema,
  occupation: nullableTextSchema,
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
  salaryReference: employeeSalaryReferenceSchema.nullable(),
  eventType: z.string(),
  startDate: timestampSchema,
  endDate: timestampSchema.nullable(),
  notes: nullableTextSchema,
  actorUserId: auditActorUserIdSchema,
  transactionId: auditTransactionIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const employeeEarningSegmentSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  days: z.number({ error: "workforce.validation.earning.daysPositive" })
    .int({ message: "workforce.validation.earning.daysPositive" })
    .positive({ message: "workforce.validation.earning.daysPositive" }),
  amount: exactMoneyStringSchema,
});

export const employeeEarningSchema = z.object({
  id: entityIdSchema,
  employeeId: entityIdSchema,
  periodStart: timestampSchema,
  periodEnd: timestampSchema,
  currencyCode: z.literal("DZD"),
  totalAmount: exactMoneyStringSchema,
  unallocatedAmount: exactMoneyStringSchema,
  referenceSalary: employeeSalaryReferenceSchema.nullable(),
  segments: z.array(employeeEarningSegmentSchema),
  approvedAt: timestampSchema,
  actorUserId: auditActorUserIdSchema,
  transactionId: auditTransactionIdSchema,
  createdAt: timestampSchema,
});

export const employeeEarningApprovalInputSchema = z.object({
  employeeId: entityIdSchema,
  requestId: z.string().uuid(),
  periodStart: timestampSchema,
  periodEnd: timestampSchema,
  currencyCode: z.literal("DZD"),
  totalAmount: exactMoneyStringSchema,
  unallocatedAmount: exactMoneyStringSchema,
  referenceSalary: employeeSalaryReferenceSchema.nullable().optional(),
  segments: z.array(employeeEarningSegmentSchema).max(10_000),
}).superRefine((value, ctx) => {
  if (Date.parse(value.periodStart) >= Date.parse(value.periodEnd)) {
    ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "workforce.validation.earning.periodOrder" });
  }
  const ids = new Set<string>();
  for (const [index, segment] of value.segments.entries()) {
    if (ids.has(segment.id)) {
      ctx.addIssue({ code: "custom", path: ["segments", index, "id"], message: "workforce.validation.earning.duplicateSegment" });
    }
    ids.add(segment.id);
  }
  try {
    const total = BigInt(Money.parse(value.totalAmount).toMinorUnits());
    const unallocated = BigInt(Money.parse(value.unallocatedAmount).toMinorUnits());
    const amounts = value.segments.map(segment => BigInt(Money.parse(segment.amount).toMinorUnits()));
    const allocated = amounts.reduce((sum, amount) => sum + amount, 0n);
    if (total <= 0n || unallocated < 0n || amounts.some(amount => amount < 0n)) {
      ctx.addIssue({ code: "custom", path: ["totalAmount"], message: "workforce.validation.earning.positiveTotal" });
    }
    if (total !== allocated + unallocated) {
      ctx.addIssue({ code: "custom", path: ["segments"], message: "workforce.validation.earning.conservation" });
    }
  } catch {
    // Field-level decimal validation above reports malformed or out-of-range values.
  }
});

export const employeeEarningListInputSchema = z.object({
  employeeId: entityIdSchema.optional(),
}).optional();

export const employeeSalaryPaymentProjectSplitSchema = z.object({
  projectId: entityIdSchema,
  days: z.number().int().positive(),
});

export const employeeSalaryPaymentSchema = z.object({
  id: entityIdSchema,
  employeeId: entityIdSchema,
  periodType: salaryPeriodSchema,
  /**
   * Whole days the payment covers (default 30 on create). A monthly wage is
   * prorated at `salaryAmountDzd / 30`; a daily wage is multiplied by days.
   */
  days: z.number().int().positive(),
  expectedAmountDzd: z.number().nonnegative(),
  /** The amount actually paid. Authoritative: a hand edit overrides the proposal. */
  actualAmountDzd: z.number().nonnegative(),
  /** Per-project day attribution. Empty when the payment stays unallocated. */
  projectSplits: z.array(employeeSalaryPaymentProjectSplitSchema),
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
  salaryReference: employeeSalaryReferenceSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  occupation: z.string().trim().max(120).nullable().optional(),
}).strict();

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
  salaryReference: employeeSalaryReferenceSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  occupation: z.string().trim().max(120).nullable().optional(),
}).strict();

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
 *
 * `search` matches employees across ALL records (before pagination) by
 * first name, last name, or phone — case-insensitive substring. An empty
 * or whitespace-only term is treated as "no search" (unfiltered).
 */
export const employeePagedListInputSchema = cursorPaginationInputSchema.extend({
  roleId: entityIdSchema.optional(),
  status: employeeStatusSchema.optional(),
  search: z.string().trim().max(120).optional(),
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

/** Atomic employee edit payload. Profile and submitted relationship writes share one transaction.
 *
 * Relationship fields are optional on purpose (PR #51 review): an omitted field means
 * "leave the server-side relationships untouched", so a stale page saving only profile
 * fields cannot revert newer concurrent placement or managed-scope updates. A submitted
 * `placement` still follows the issue #20 rule (ignored for non-active workers). */
export const employeeSaveInputSchema = employeeUpdateInputSchema.extend({
  placement: employeeAssignWorkplaceInputSchema
    .omit({ employeeId: true })
    .nullable()
    .optional(),
  managedProjectIds: z.array(entityIdSchema).optional(),
  managedWarehouseIds: z.array(entityIdSchema).optional(),
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
  /** Whole days paid. Defaults to a full 30-day month. */
  days: z.number().int().positive().default(SALARY_DAYS_PER_MONTH),
  /** Overridable paid amount. Omitted → the server stores the proposed amount. */
  actualAmountDzd: z.number().nonnegative().optional(),
  paymentDate: timestampSchema.optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  /** Per-project day attribution. Empty/omitted → the payment stays unallocated. */
  projectSplits: z.array(employeeSalaryPaymentProjectSplitSchema).default([]),
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
export type EmployeeEarning = z.infer<typeof employeeEarningSchema>;
export type EmployeeEarningSegment = z.infer<typeof employeeEarningSegmentSchema>;
export type EmployeeEarningApprovalInput = z.infer<typeof employeeEarningApprovalInputSchema>;
export type EmployeeSalaryPayment = z.infer<typeof employeeSalaryPaymentSchema>;
export type EmployeeSalaryPaymentProjectSplit = z.infer<typeof employeeSalaryPaymentProjectSplitSchema>;
export type RoleCreateInput = z.infer<typeof roleCreateInputSchema>;
export type RoleUpdateInput = z.infer<typeof roleUpdateInputSchema>;
export type EmployeeCreateInput = z.infer<typeof employeeCreateInputSchema>;
export type EmployeeBatchCreateRowInput = z.infer<typeof employeeBatchCreateRowInputSchema>;
export type EmployeeBatchCreateInput = z.infer<typeof employeeBatchCreateInputSchema>;
export type EmployeeBatchCreateResult = z.infer<typeof employeeBatchCreateResultSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateInputSchema>;
export type EmployeeSaveInput = z.infer<typeof employeeSaveInputSchema>;
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
