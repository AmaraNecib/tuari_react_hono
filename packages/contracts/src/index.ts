import { oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";

export const entityIdSchema = z.string().min(1);
export const timestampSchema = z.string().datetime({ offset: true });
export const nullableTextSchema = z.string().trim().min(1).nullable();
export const auditActorUserIdSchema = entityIdSchema.nullable();
export const auditTransactionIdSchema = z.string().uuid().nullable();

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
export const salaryPeriodSchema = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);
export const debtPartyTypeSchema = z.enum(["INTERNAL_WORKER", "EXTERNAL_COUNTERPARTY"]);
export const debtAccountStatusSchema = z.enum(["OPEN", "SETTLED"]);
export const debtEntryTypeSchema = z.enum(["OPENING", "PAYMENT", "ADJUSTMENT", "SETTLEMENT", "CLOSURE"]);
export const projectStatusSchema = z.enum([
  "ACTIVE",
  "STOPPED",
  "COMPLETED",
  "ARCHIVED",
]);
export const warehouseStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
export const assignmentStatusSchema = z.enum(["ACTIVE", "ENDED", "ARCHIVED"]);
export const employeeBatchLimit = 24;

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

export const projectManagerOwnershipHistorySchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  managerId: entityIdSchema,
  status: z.string(),
  startDate: timestampSchema,
  endDate: timestampSchema.nullable(),
  notes: nullableTextSchema,
  actorUserId: auditActorUserIdSchema,
  transactionId: auditTransactionIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const warehouseManagerOwnershipHistorySchema = z.object({
  id: entityIdSchema,
  warehouseId: entityIdSchema,
  managerId: entityIdSchema,
  status: z.string(),
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

export const externalCounterpartySchema = z.object({
  id: entityIdSchema,
  fullName: z.string().trim().min(1).max(160),
  phoneNumber: algerianPhoneSchema,
  note: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const debtAccountSchema = z.object({
  id: entityIdSchema,
  partyType: debtPartyTypeSchema,
  workerId: entityIdSchema.nullable(),
  externalCounterpartyId: entityIdSchema.nullable(),
  status: debtAccountStatusSchema,
  currentBalanceDzd: z.number(),
  note: nullableTextSchema,
  settledAt: timestampSchema.nullable(),
  actorUserId: auditActorUserIdSchema,
  actorLabel: nullableTextSchema,
  transactionId: auditTransactionIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const debtEntrySchema = z.object({
  id: entityIdSchema,
  debtAccountId: entityIdSchema,
  entryType: debtEntryTypeSchema,
  signedAmountDzd: z.number(),
  entryDate: timestampSchema,
  note: nullableTextSchema,
  balanceAfterDzd: z.number(),
  actorUserId: auditActorUserIdSchema,
  actorLabel: nullableTextSchema,
  transactionId: auditTransactionIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const debtClosureLinkSchema = z.object({
  id: entityIdSchema,
  sourceDebtAccountId: entityIdSchema,
  targetDebtAccountId: entityIdSchema,
  closedAmountDzd: z.number().positive(),
  entryDate: timestampSchema,
  note: nullableTextSchema,
  actorUserId: auditActorUserIdSchema,
  actorLabel: nullableTextSchema,
  transactionId: auditTransactionIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const debtPartySummaryItemSchema = z.object({
  partyType: debtPartyTypeSchema,
  workerId: entityIdSchema.nullable(),
  externalCounterpartyId: entityIdSchema.nullable(),
  displayName: z.string().trim().min(1).max(160),
  phoneNumber: algerianPhoneSchema.nullable(),
  totalBalanceDzd: z.number(),
  balanceLabel: z.enum(["لنا عنده", "علينا له", "مغلق"]),
  openDebtCasesCount: z.number().int().nonnegative(),
  settledDebtCasesCount: z.number().int().nonnegative(),
  latestActivityAt: timestampSchema,
});

export const debtPartyDetailSchema = z.object({
  partyType: debtPartyTypeSchema,
  workerId: entityIdSchema.nullable(),
  externalCounterpartyId: entityIdSchema.nullable(),
  displayName: z.string().trim().min(1).max(160),
  phoneNumber: algerianPhoneSchema.nullable(),
  note: nullableTextSchema,
  totalBalanceDzd: z.number(),
  balanceLabel: z.enum(["لنا عنده", "علينا له", "مغلق"]),
  debtAccounts: z.array(debtAccountSchema),
});

export const debtSummaryItemSchema = z.object({
  accountId: entityIdSchema,
  partyType: debtPartyTypeSchema,
  workerId: entityIdSchema.nullable(),
  externalCounterpartyId: entityIdSchema.nullable(),
  displayName: z.string().trim().min(1).max(160),
  phoneNumber: algerianPhoneSchema.nullable(),
  status: debtAccountStatusSchema,
  currentBalanceDzd: z.number(),
  balanceLabel: z.enum(["لنا عنده", "علينا له", "مغلق"]),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const debtsSummarySchema = z.object({
  parties: z.array(debtPartySummaryItemSchema),
  debtAccounts: z.array(debtSummaryItemSchema),
});

export const systemLogActionTypeSchema = z.enum([
  "ACCOUNT_UPDATED",
  "DEBT_ACCOUNT_CREATED",
  "DEBT_ENTRY_RECORDED",
  "DEBT_SETTLED",
  "EMPLOYEE_CREATED",
  "EMPLOYEE_UPDATED",
  "WORKPLACE_ASSIGNED",
  "PROJECT_MANAGER_CHANGED",
  "WAREHOUSE_MANAGER_CHANGED",
  "SALARY_PAYMENT_RECORDED",
])

export const systemLogEntityTypeSchema = z.enum([
  "ACCOUNT",
  "DEBT_ACCOUNT",
  "DEBT_ENTRY",
  "EMPLOYEE",
  "EXTERNAL_COUNTERPARTY",
  "PROJECT",
  "WAREHOUSE",
  "MANAGER_ASSIGNMENT",
  "PROJECT_ASSIGNMENT",
  "WAREHOUSE_ASSIGNMENT",
  "SALARY_PAYMENT",
])

export const systemLogEntrySchema = z.object({
  id: entityIdSchema,
  transactionId: auditTransactionIdSchema,
  actorUserId: auditActorUserIdSchema,
  actorLabel: nullableTextSchema,
  actorCurrentLabel: nullableTextSchema.optional().default(null),
  actionType: systemLogActionTypeSchema,
  entityType: systemLogEntityTypeSchema,
  entityId: entityIdSchema.nullable(),
  entityLabel: nullableTextSchema,
  summary: z.string().trim().min(1),
  detail: nullableTextSchema,
  createdAt: timestampSchema,
})

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

export const workspaceSnapshotSchema = z.object({
  roles: z.array(roleSchema),
  employees: z.array(employeeSchema),
  externalCounterparties: z.array(externalCounterpartySchema),
  debtAccounts: z.array(debtAccountSchema),
  debtEntries: z.array(debtEntrySchema),
  debtClosureLinks: z.array(debtClosureLinkSchema),
  projects: z.array(projectSchema),
  warehouses: z.array(warehouseSchema),
  managerAssignments: z.array(employeeManagerAssignmentSchema),
  projectAssignments: z.array(employeeProjectAssignmentSchema),
  warehouseAssignments: z.array(employeeWarehouseAssignmentSchema),
  employeeStateHistory: z.array(employeeStateHistorySchema),
  projectManagerOwnershipHistory: z.array(projectManagerOwnershipHistorySchema),
  warehouseManagerOwnershipHistory: z.array(warehouseManagerOwnershipHistorySchema),
  salaryPayments: z.array(employeeSalaryPaymentSchema),
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

export const projectManagerOwnershipHistoryListInputSchema = z
  .object({ managerId: entityIdSchema.optional(), projectId: entityIdSchema.optional() })
  .optional();

export const warehouseManagerOwnershipHistoryListInputSchema = z
  .object({ managerId: entityIdSchema.optional(), warehouseId: entityIdSchema.optional() })
  .optional();

export const employeeSalaryPaymentCreateInputSchema = z.object({
  employeeId: entityIdSchema,
  actualAmountDzd: z.number().nonnegative(),
  paymentDate: timestampSchema.optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const externalCounterpartyCreateInputSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  phoneNumber: algerianPhoneSchema,
  note: z.string().trim().max(1000).nullable().optional(),
});

export const externalCounterpartyListInputSchema = z
  .object({
    fullName: z.string().trim().min(1).max(160).optional(),
  })
  .optional();

export const debtAccountListInputSchema = z
  .object({
    partyType: debtPartyTypeSchema.optional(),
    workerId: entityIdSchema.optional(),
    externalCounterpartyId: entityIdSchema.optional(),
    status: debtAccountStatusSchema.optional(),
  })
  .optional();

export const debtAccountCreateInputSchema = z
  .object({
    partyType: debtPartyTypeSchema,
    workerId: entityIdSchema.nullable().optional(),
    externalCounterpartyId: entityIdSchema.nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
    openingBalanceDzd: z.number().finite().optional(),
    openingEntryDate: timestampSchema.optional(),
    openingEntryNote: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((input, ctx) => {
    const hasWorker = Boolean(input.workerId);
    const hasExternal = Boolean(input.externalCounterpartyId);

    if (hasWorker === hasExternal) {
      ctx.addIssue({
        code: "custom",
        message: "يجب ربط الحساب بطرف واحد فقط.",
        path: ["workerId"],
      });
    }

    if (input.partyType === "INTERNAL_WORKER" && !hasWorker) {
      ctx.addIssue({
        code: "custom",
        message: "يجب اختيار عامل صالح.",
        path: ["workerId"],
      });
    }

    if (input.partyType === "EXTERNAL_COUNTERPARTY" && !hasExternal) {
      ctx.addIssue({
        code: "custom",
        message: "يجب اختيار طرف خارجي صالح.",
        path: ["externalCounterpartyId"],
      });
    }
  });

export const debtEntryCreateInputSchema = z.object({
  debtAccountId: entityIdSchema,
  entryType: z.enum(["OPENING", "PAYMENT", "ADJUSTMENT"]),
  signedAmountDzd: z.number().finite(),
  entryDate: timestampSchema.optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const debtSettlementInputSchema = z.object({
  id: entityIdSchema,
  entryDate: timestampSchema.optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const debtClosureLinkListInputSchema = z.object({
  debtAccountId: entityIdSchema,
});

export const debtCloseAgainstInputSchema = z
  .object({
    sourceDebtAccountId: entityIdSchema,
    targetDebtAccountId: entityIdSchema,
    entryDate: timestampSchema.optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.sourceDebtAccountId === input.targetDebtAccountId) {
      ctx.addIssue({
        code: "custom",
        message: "يجب اختيار حسابي دين مختلفين.",
        path: ["targetDebtAccountId"],
      })
    }
  });

export const debtPartyDetailInputSchema = z
  .object({
    partyType: debtPartyTypeSchema,
    workerId: entityIdSchema.nullable().optional(),
    externalCounterpartyId: entityIdSchema.nullable().optional(),
  })
  .superRefine((input, ctx) => {
    const hasWorker = Boolean(input.workerId)
    const hasExternal = Boolean(input.externalCounterpartyId)

    if (hasWorker === hasExternal) {
      ctx.addIssue({
        code: "custom",
        message: "يجب تحديد طرف واحد فقط.",
        path: ["workerId"],
      })
    }

    if (input.partyType === "INTERNAL_WORKER" && !hasWorker) {
      ctx.addIssue({
        code: "custom",
        message: "يجب اختيار عامل صالح.",
        path: ["workerId"],
      })
    }

    if (input.partyType === "EXTERNAL_COUNTERPARTY" && !hasExternal) {
      ctx.addIssue({
        code: "custom",
        message: "يجب اختيار طرف خارجي صالح.",
        path: ["externalCounterpartyId"],
      })
    }
  });

export const employeeSalaryPaymentListInputSchema = z
  .object({ employeeId: entityIdSchema.optional() })
  .optional();

export const systemLogListInputSchema = z
  .object({
    actionType: systemLogActionTypeSchema.optional(),
    actorUserId: entityIdSchema.optional(),
    entityId: entityIdSchema.optional(),
    entityType: systemLogEntityTypeSchema.optional(),
    fromDate: timestampSchema.optional(),
    toDate: timestampSchema.optional(),
  })
  .optional();

export const appContract = {
  health: oc.output(healthCheckSchema),
  session: oc.output(sessionSchema),
  authSetupStatus: oc.output(authSetupStatusSchema),
  authBootstrap: oc
    .input(authBootstrapInputSchema)
    .output(createEntityResultSchema(sessionUserSchema)),
  workspaceSnapshot: oc.output(workspaceSnapshotSchema),
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
  employeesBatchCreate: oc
    .input(employeeBatchCreateInputSchema)
    .output(createEntityResultSchema(employeeBatchCreateResultSchema)),
  employeesUpdate: oc
    .input(employeeUpdateInputSchema)
    .output(createEntityResultSchema(employeeSchema)),
  employeesDelete: oc.input(idInputSchema).output(createDeleteResultSchema),
  employeesAssignWorkplace: oc
    .input(employeeAssignWorkplaceInputSchema)
    .output(createDeleteResultSchema),
  employeesSyncManagedProjects: oc
    .input(employeeSyncManagedProjectsInputSchema)
    .output(createDeleteResultSchema),
  employeesSyncManagedWarehouses: oc
    .input(employeeSyncManagedWarehousesInputSchema)
    .output(createDeleteResultSchema),
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
  warehouseAssignmentsList: oc
    .input(warehouseAssignmentListInputSchema)
    .output(createListSchema(employeeWarehouseAssignmentSchema)),
  warehouseAssignmentsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(employeeWarehouseAssignmentSchema)),
  warehouseAssignmentsCreate: oc
    .input(warehouseAssignmentCreateInputSchema)
    .output(createEntityResultSchema(employeeWarehouseAssignmentSchema)),
  warehouseAssignmentsEnd: oc
    .input(warehouseAssignmentEndInputSchema)
    .output(createEntityResultSchema(employeeWarehouseAssignmentSchema)),
  employeeStateHistoryList: oc
    .input(employeeStateHistoryListInputSchema)
    .output(createListSchema(employeeStateHistorySchema)),
  projectManagerOwnershipHistoryList: oc
    .input(projectManagerOwnershipHistoryListInputSchema)
    .output(createListSchema(projectManagerOwnershipHistorySchema)),
  warehouseManagerOwnershipHistoryList: oc
    .input(warehouseManagerOwnershipHistoryListInputSchema)
    .output(createListSchema(warehouseManagerOwnershipHistorySchema)),
  salaryPaymentsList: oc
    .input(employeeSalaryPaymentListInputSchema)
    .output(createListSchema(employeeSalaryPaymentSchema)),
  salaryPaymentsCreate: oc
    .input(employeeSalaryPaymentCreateInputSchema)
    .output(createEntityResultSchema(employeeSalaryPaymentSchema)),
  externalCounterpartiesList: oc
    .input(externalCounterpartyListInputSchema)
    .output(createListSchema(externalCounterpartySchema)),
  externalCounterpartiesGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(externalCounterpartySchema)),
  externalCounterpartiesCreate: oc
    .input(externalCounterpartyCreateInputSchema)
    .output(createEntityResultSchema(externalCounterpartySchema)),
  debtAccountsList: oc
    .input(debtAccountListInputSchema)
    .output(createListSchema(debtAccountSchema)),
  debtAccountsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(debtAccountSchema)),
  debtAccountsCreate: oc
    .input(debtAccountCreateInputSchema)
    .output(createEntityResultSchema(debtAccountSchema)),
  debtEntriesList: oc
    .input(z.object({ debtAccountId: entityIdSchema }))
    .output(createListSchema(debtEntrySchema)),
  debtEntriesCreate: oc
    .input(debtEntryCreateInputSchema)
    .output(createEntityResultSchema(debtEntrySchema)),
  debtClosureLinksList: oc
    .input(debtClosureLinkListInputSchema)
    .output(createListSchema(debtClosureLinkSchema)),
  debtCloseAgainst: oc
    .input(debtCloseAgainstInputSchema)
    .output(createEntityResultSchema(debtClosureLinkSchema)),
  debtAccountsSettle: oc
    .input(debtSettlementInputSchema)
    .output(createEntityResultSchema(debtEntrySchema)),
  debtPartyDetail: oc
    .input(debtPartyDetailInputSchema)
    .output(createEntityResultSchema(debtPartyDetailSchema)),
  debtsSummary: oc.output(debtsSummarySchema),
  systemLogList: oc
    .input(systemLogListInputSchema)
    .output(createListSchema(systemLogEntrySchema)),
};

export type PhonePasswordSignInInput = z.infer<typeof phonePasswordSignInSchema>;
export type AuthBootstrapInput = z.infer<typeof authBootstrapInputSchema>;
export type AppErrorCode = z.infer<typeof appErrorCodeSchema>;
export type AppError = z.infer<typeof appErrorSchema>;
export type RoleCreateInput = z.infer<typeof roleCreateInputSchema>;
export type RoleUpdateInput = z.infer<typeof roleUpdateInputSchema>;
export type EmployeeCreateInput = z.infer<typeof employeeCreateInputSchema>;
export type EmployeeBatchCreateRowInput = z.infer<typeof employeeBatchCreateRowInputSchema>;
export type EmployeeBatchCreateInput = z.infer<typeof employeeBatchCreateInputSchema>;
export type EmployeeBatchCreateResult = z.infer<typeof employeeBatchCreateResultSchema>;
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateInputSchema>;
export type EmployeeAssignWorkplaceInput = z.infer<typeof employeeAssignWorkplaceInputSchema>;
export type EmployeeSyncManagedProjectsInput = z.infer<typeof employeeSyncManagedProjectsInputSchema>;
export type EmployeeSyncManagedWarehousesInput = z.infer<typeof employeeSyncManagedWarehousesInputSchema>;
export type EmployeeSalaryPaymentCreateInput = z.infer<typeof employeeSalaryPaymentCreateInputSchema>;
export type ExternalCounterpartyCreateInput = z.infer<typeof externalCounterpartyCreateInputSchema>;
export type DebtAccountCreateInput = z.infer<typeof debtAccountCreateInputSchema>;
export type DebtEntryCreateInput = z.infer<typeof debtEntryCreateInputSchema>;
export type DebtSettlementInput = z.infer<typeof debtSettlementInputSchema>;
export type DebtCloseAgainstInput = z.infer<typeof debtCloseAgainstInputSchema>;
export type DebtPartyDetailInput = z.infer<typeof debtPartyDetailInputSchema>;
export type SystemLogListInput = z.infer<typeof systemLogListInputSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateInputSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateInputSchema>;
export type WarehouseCreateInput = z.infer<typeof warehouseCreateInputSchema>;
export type WarehouseUpdateInput = z.infer<typeof warehouseUpdateInputSchema>;
export type ManagerAssignmentCreateInput = z.infer<typeof managerAssignmentCreateInputSchema>;
export type ManagerAssignmentEndInput = z.infer<typeof managerAssignmentEndInputSchema>;
export type ProjectAssignmentCreateInput = z.infer<typeof projectAssignmentCreateInputSchema>;
export type ProjectAssignmentEndInput = z.infer<typeof projectAssignmentEndInputSchema>;
export type WarehouseAssignmentCreateInput = z.infer<typeof warehouseAssignmentCreateInputSchema>;
export type WarehouseAssignmentEndInput = z.infer<typeof warehouseAssignmentEndInputSchema>;
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
export type EmployeeWarehouseAssignment = z.infer<
  typeof employeeWarehouseAssignmentSchema
>;
export type EmployeeStateHistory = z.infer<typeof employeeStateHistorySchema>;
export type ProjectManagerOwnershipHistory = z.infer<typeof projectManagerOwnershipHistorySchema>;
export type WarehouseManagerOwnershipHistory = z.infer<typeof warehouseManagerOwnershipHistorySchema>;
export type EmployeeSalaryPayment = z.infer<typeof employeeSalaryPaymentSchema>;
export type ExternalCounterparty = z.infer<typeof externalCounterpartySchema>;
export type DebtAccount = z.infer<typeof debtAccountSchema>;
export type DebtEntry = z.infer<typeof debtEntrySchema>;
export type DebtClosureLink = z.infer<typeof debtClosureLinkSchema>;
export type DebtPartySummaryItem = z.infer<typeof debtPartySummaryItemSchema>;
export type DebtPartyDetail = z.infer<typeof debtPartyDetailSchema>;
export type DebtSummaryItem = z.infer<typeof debtSummaryItemSchema>;
export type DebtsSummary = z.infer<typeof debtsSummarySchema>;
export type SystemLogEntry = z.infer<typeof systemLogEntrySchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type AppContract = typeof appContract;
export type AppClient = ContractRouterClient<AppContract>;
