import { z } from "zod";

export const entityIdSchema = z.string().min(1);
export const timestampSchema = z.string().datetime({ offset: true });
export const nullableTextSchema = z.string().trim().min(1).nullable();
export const auditActorUserIdSchema = entityIdSchema.nullable();
export const auditTransactionIdSchema = z.string().uuid().nullable();

export const algerianPhoneSchema = z.string().trim().regex(/^(05|06|07)\d{8}$/);

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

export const createListSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
  });

/**
 * Input for cursor-paginated list endpoints.
 *
 * - `cursor`: opaque token returned in a previous response's `nextCursor`.
 *   Omit (or pass undefined) for the first page.
 * - `limit`: page size. Server-side clamps to a safe range.
 */
export const cursorPaginationInputSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().positive().optional(),
});

/**
 * Result shape for cursor-paginated list endpoints.
 *
 * - `items`: records on this page (already mapped to public DTO shape)
 * - `total`: total count matching the filter (NOT the page size)
 * - `nextCursor`: opaque token for the next page, or null on the last page
 * - `hasMore`: convenience flag equivalent to `nextCursor !== null`
 */
export const paginatedResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });

export const createEntityResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.union([
    mutationFailureSchema,
    mutationSuccessSchema.extend({
      item: itemSchema,
    }),
  ]);

export const createDeleteResultSchema = z.union([
  mutationFailureSchema,
  mutationSuccessSchema,
]);

export const idInputSchema = z.object({
  id: entityIdSchema,
});

export const healthCheckSchema = z.object({
  status: z.literal("ok"),
  timestamp: timestampSchema,
});

export const employeeStatusSchema = z.enum(["ACTIVE", "INACTIVE", "LEFT"]);
export const salaryPeriodSchema = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);
export const debtPartyTypeSchema = z.enum(["INTERNAL_WORKER", "EXTERNAL_COUNTERPARTY"]);
export const debtAccountStatusSchema = z.enum(["OPEN", "SETTLED"]);
export const debtAccountDirectionSchema = z.enum(["PAYABLE", "RECEIVABLE"]);
export const debtEntryTypeSchema = z.enum(["OPENING", "PAYMENT", "ADJUSTMENT", "SETTLEMENT", "ADVANCE"]);
export const projectStatusSchema = z.enum([
  "ACTIVE",
  "STOPPED",
  "COMPLETED",
  "ARCHIVED",
]);
export const warehouseStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
export const assignmentStatusSchema = z.enum(["ACTIVE", "ENDED", "ARCHIVED"]);
export const inventoryItemTypeSchema = z.enum(["CONSUMABLE", "ASSET"]);
export const inventoryAssetConditionSchema = z.enum(["NEW", "USED", "MAINTENANCE", "DAMAGED"]);
export const inventoryMovementTypeSchema = z.enum(["PURCHASE", "TRANSFER", "OUTBOUND_SALE"]);
export const inventoryLocationTypeSchema = z.enum(["WAREHOUSE", "PROJECT"]);
export const inventoryPaymentInputTypeSchema = z.enum(["AMOUNT", "PERCENT"]);
export const employeeBatchLimit = 24;

export const roleKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/);

export type AppErrorCode = z.infer<typeof appErrorCodeSchema>;
export type AppError = z.infer<typeof appErrorSchema>;
