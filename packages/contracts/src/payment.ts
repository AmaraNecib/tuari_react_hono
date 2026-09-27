import { z } from "zod";
import { paymentMethodSchema } from "./core";

export const counterpartyTypeSchema = z.enum(["EXTERNAL_COUNTERPARTY", "WORKER"]);

/**
 * Single money magnitude bound shared by every DZD amount schema. `.max(...)`
 * keeps amounts inside the integer precision range the strict sum checks and
 * sqlite REAL columns can represent exactly.
 */
export const MAX_MONEY_DZD = Number.MAX_SAFE_INTEGER;

/**
 * Shared monetary validity for payment amounts — the wire gate and the API
 * payment module seam enforce the SAME definition so the two cannot drift
 * (issue #289 service-boundary defense-in-depth). `.max(MAX_SAFE_INTEGER)`
 * keeps amounts inside the integer precision range the strict sum check and
 * sqlite REAL columns can represent exactly.
 */
export const paymentAmountSchema = z.number().positive().max(MAX_MONEY_DZD);

/**
 * Money that explicitly permits zero. Used where "no money moved" is a legal
 * state — e.g. a stock charge of 0 (a free placement, #413). Same magnitude
 * bound as {@link paymentAmountSchema} so there is still ONE money rule; only
 * the sign bound differs.
 */
export const nonNegativePaymentAmountSchema = z.number().nonnegative().max(MAX_MONEY_DZD);

/**
 * Shared page-limit validity for payment listing (wire gate + module seam).
 * `.int()` because sqlite `LIMIT ?` throws a datatype mismatch on fractional
 * bounds (issue #289 + test-audit finding).
 */
export const paymentListLimitSchema = z.number().int().min(1).max(100);

export const paymentAllocationSchema = z.object({
  id: z.string().uuid(),
  paymentId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amount: paymentAmountSchema,
  createdAt: z.string().datetime(),
});

export const paymentSchema = z.object({
  id: z.string().uuid(),
  counterpartyType: counterpartyTypeSchema,
  counterpartyId: z.string().uuid(),
  paymentDate: z.string().datetime(),
  paymentMethod: paymentMethodSchema,
  totalAmount: paymentAmountSchema,
  notes: z.string().nullable(),
  actorUserId: z.string().nullable(),
  actorLabel: z.string().nullable(),
  transactionId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  allocations: z.array(paymentAllocationSchema),
});

export const createPaymentAllocationInputSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: paymentAmountSchema,
});

export const createPaymentInputSchema = z.object({
  id: z.string().uuid().optional(),
  counterpartyType: counterpartyTypeSchema,
  counterpartyId: z.string().uuid(),
  paymentDate: z.string().datetime(),
  paymentMethod: paymentMethodSchema,
  totalAmount: paymentAmountSchema,
  notes: z.string().nullable().optional(),
  allocations: z.array(createPaymentAllocationInputSchema).min(1),
});

export const paymentListInputSchema = z.object({
  filters: z
    .object({
      counterpartyType: counterpartyTypeSchema.optional(),
      counterpartyId: z.string().uuid().optional(),
      paymentMethod: paymentMethodSchema.optional(),
    })
    .optional(),
  sort: z
    .object({
      field: z.enum(["paymentDate", "totalAmount", "createdAt"]),
      direction: z.enum(["asc", "desc"]),
    })
    .optional(),
  cursor: z.string().optional(),
  limit: paymentListLimitSchema.default(50),
});

export const paymentListOutputSchema = z.object({
  items: z.array(paymentSchema.omit({ allocations: true })),
  nextCursor: z.string().nullable(),
  totalCount: z.number(),
  hasMore: z.boolean(),
});
