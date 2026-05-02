import { z } from "zod";

import {
  auditActorUserIdSchema,
  auditTransactionIdSchema,
  entityIdSchema,
  nullableTextSchema,
  timestampSchema,
} from "./core";

export const systemLogActionTypeSchema = z.enum([
  "ACCOUNT_UPDATED",
  "DEBT_ACCOUNT_CREATED",
  "DEBT_ENTRY_RECORDED",
  "DEBT_SETTLED",
  "EMPLOYEE_CREATED",
  "EMPLOYEE_UPDATED",
  "INVENTORY_ITEM_CREATED",
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
  "INVENTORY_ITEM",
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

export type SystemLogEntry = z.infer<typeof systemLogEntrySchema>;
export type SystemLogListInput = z.infer<typeof systemLogListInputSchema>;
