import { z } from "zod";
import { paymentMethodSchema } from "./core";

export const counterpartyTypeSchema = z.enum(["EXTERNAL_COUNTERPARTY", "WORKER"]);

export const paymentAllocationSchema = z.object({
  id: z.string().uuid(),
  paymentId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  createdAt: z.string().datetime(),
});

export const paymentSchema = z.object({
  id: z.string().uuid(),
  counterpartyType: counterpartyTypeSchema,
  counterpartyId: z.string().uuid(),
  paymentDate: z.string().datetime(),
  paymentMethod: paymentMethodSchema,
  totalAmount: z.number().positive(),
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
  amount: z.number().positive(),
});

export const createPaymentInputSchema = z.object({
  id: z.string().uuid().optional(),
  counterpartyType: counterpartyTypeSchema,
  counterpartyId: z.string().uuid(),
  paymentDate: z.string().datetime(),
  paymentMethod: paymentMethodSchema,
  totalAmount: z.number().positive(),
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
  limit: z.number().min(1).max(100).default(50),
});

export const paymentListOutputSchema = z.object({
  items: z.array(paymentSchema.omit({ allocations: true })),
  nextCursor: z.string().nullable(),
  totalCount: z.number(),
  hasMore: z.boolean(),
});
