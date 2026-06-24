import { z } from "zod";

import {
  algerianPhoneSchema,
  auditActorUserIdSchema,
  auditTransactionIdSchema,
  debtAccountDirectionSchema,
  debtAccountStatusSchema,
  debtEntryStatusSchema,
  debtEntryTypeSchema,
  debtPartyTypeSchema,
  debtReasonCategorySchema,
  entityIdSchema,
  nullableTextSchema,
  paymentMethodSchema,
  timestampSchema,
} from "./core";

export { debtAccountDirectionSchema };
export type DebtAccountDirection = z.infer<typeof debtAccountDirectionSchema>;

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
  direction: debtAccountDirectionSchema,
  currentBalance: z.number(),
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
  // Issue #25: reason category, payment method, void metadata
  reasonCategory: debtReasonCategorySchema,
  reasonDetail: nullableTextSchema,
  paymentMethod: paymentMethodSchema.nullable(),
  status: debtEntryStatusSchema,
  voidedAt: timestampSchema.nullable(),
  voidedBy: nullableTextSchema,
  voidReason: nullableTextSchema,
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
  direction: debtAccountDirectionSchema,
  currentBalance: z.number(),
  balanceLabel: z.enum(["لنا عنده", "علينا له", "مغلق"]),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const debtsSummarySchema = z.object({
  parties: z.array(debtPartySummaryItemSchema),
  debtAccounts: z.array(debtSummaryItemSchema),
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
    direction: debtAccountDirectionSchema.optional(),
    note: z.string().trim().max(1000).nullable().optional(),
    openingBalanceDzd: z.number().finite().optional(),
    openingEntryDate: timestampSchema.optional(),
    openingEntryNote: z.string().trim().max(1000).nullable().optional(),
    reasonCategory: debtReasonCategorySchema.optional(),
    reasonDetail: z.string().trim().max(1000).nullable().optional(),
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
  entryType: z.enum(["OPENING", "PAYMENT", "ADJUSTMENT", "ADVANCE"]),
  signedAmountDzd: z.number().finite(),
  entryDate: timestampSchema.optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  reasonCategory: debtReasonCategorySchema.optional(),
  reasonDetail: z.string().trim().max(1000).nullable().optional(),
});

export const debtEntryRecordPaymentInputSchema = z.object({
  debtEntryId: entityIdSchema,
  amountDzd: z.number().positive(),
  paymentMethod: paymentMethodSchema.default("CASH"),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const debtEntryVoidInputSchema = z.object({
  entryId: entityIdSchema,
  voidReason: z.string().trim().min(1).max(1000),
});

export const debtConsolidationInputSchema = z.object({
  payableEntryId: entityIdSchema,
  receivableEntryId: entityIdSchema,
});

/**
 * Input for creating a direct debt entry (not tied to an invoice).
 * Requires a reason category; direction is derived from the category.
 */
export const directDebtEntryCreateInputSchema = z
  .object({
    partyType: debtPartyTypeSchema,
    workerId: entityIdSchema.nullable().optional(),
    externalCounterpartyId: entityIdSchema.nullable().optional(),
    reasonCategory: debtReasonCategorySchema,
    reasonDetail: z.string().trim().min(1).max(1000).nullable().optional(),
    amountDzd: z.number().positive(),
    entryDate: timestampSchema.optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((input, ctx) => {
    // Must link to exactly one party
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

    // OTHER category requires reasonDetail
    if (input.reasonCategory === "OTHER" && !input.reasonDetail?.trim()) {
      ctx.addIssue({
        code: "custom",
        message:
          "يرجى تقديم تفصيل للسبب عند اختيار فئة 'أخرى'.",
        path: ["reasonDetail"],
      });
    }
  });

export const debtSettlementInputSchema = z.object({
  id: entityIdSchema,
  entryDate: timestampSchema.optional(),
  note: z.string().trim().max(1000).nullable().optional(),
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

export const employeeDebtEntryCreateInputSchema = z.object({
  employeeId: entityIdSchema,
  entryType: z.enum(["OPENING", "PAYMENT", "ADJUSTMENT", "ADVANCE"]),
  amountDzd: z.number().positive(),
  entryDate: timestampSchema.optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  reasonCategory: debtReasonCategorySchema.optional(),
});

export const employeeDebtAccountGetInputSchema = z.object({
  employeeId: entityIdSchema,
});

export type ExternalCounterparty = z.infer<typeof externalCounterpartySchema>;
export type DebtAccount = z.infer<typeof debtAccountSchema>;
export type DebtEntry = z.infer<typeof debtEntrySchema>;
export type DebtPartySummaryItem = z.infer<typeof debtPartySummaryItemSchema>;
export type DebtPartyDetail = z.infer<typeof debtPartyDetailSchema>;
export type DebtSummaryItem = z.infer<typeof debtSummaryItemSchema>;
export type DebtsSummary = z.infer<typeof debtsSummarySchema>;
export type ExternalCounterpartyCreateInput = z.infer<typeof externalCounterpartyCreateInputSchema>;
export type DebtAccountCreateInput = z.infer<typeof debtAccountCreateInputSchema>;
export type DebtEntryCreateInput = z.infer<typeof debtEntryCreateInputSchema>;
export type DebtEntryRecordPaymentInput = z.infer<typeof debtEntryRecordPaymentInputSchema>;
export type DebtEntryVoidInput = z.infer<typeof debtEntryVoidInputSchema>;
export type DirectDebtEntryCreateInput = z.infer<typeof directDebtEntryCreateInputSchema>;
export type DebtSettlementInput = z.infer<typeof debtSettlementInputSchema>;
export type DebtPartyDetailInput = z.infer<typeof debtPartyDetailInputSchema>;
export type EmployeeDebtEntryCreateInput = z.infer<typeof employeeDebtEntryCreateInputSchema>;
export type EmployeeDebtAccountGetInput = z.infer<typeof employeeDebtAccountGetInputSchema>;
export type DebtConsolidationInput = z.infer<typeof debtConsolidationInputSchema>;
