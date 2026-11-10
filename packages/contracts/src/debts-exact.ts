import { z } from "zod";
import { Money } from "./exact-money";
import { debtAccountSchema, debtEntrySchema } from "./debts";
import { debtAccountDirectionSchema, debtPartyTypeSchema, debtReasonCategorySchema, entityIdSchema, paymentMethodSchema, timestampSchema } from "./core";

/** Opt-in codecs only; the production debt contract remains numeric. */
export const exactDebtAmountSchema = z.string().max(96).transform((value, ctx) => {
  try { return Money.parse(value).toWire(); }
  catch { ctx.addIssue({ code: "custom", message: "Enter a DZD amount with at most two decimal places within the supported range." }); return z.NEVER; }
});
const positive = exactDebtAmountSchema.refine(value => Money.parse(value).compare(Money.parse("0")) > 0, "Amount must be positive");
const nonnegative = exactDebtAmountSchema.refine(value => Money.parse(value).compare(Money.parse("0")) >= 0, "Amount must be nonnegative");
const note = z.string().trim().max(1000).nullable().optional();
const command = { requestId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/), currency: z.literal("DZD").default("DZD") };
export const exactDebtAccountSchema = debtAccountSchema.extend({ currency: z.literal("DZD"), currentBalance: exactDebtAmountSchema });
export const exactDebtEntrySchema = debtEntrySchema.extend({
  currency: z.literal("DZD"), signedAmountDzd: exactDebtAmountSchema, balanceAfterDzd: exactDebtAmountSchema,
  invoiceId: entityIdSchema.nullable(), targetEntryId: entityIdSchema.nullable(), correctionOfEntryId: entityIdSchema.nullable(),
  postingSequence: z.number().int().positive().max(100000),
});
export const createExactDebtAccountSchema = z.object({
  ...command, partyType: debtPartyTypeSchema, workerId: entityIdSchema.nullable().optional(), externalCounterpartyId: entityIdSchema.nullable().optional(),
  direction: debtAccountDirectionSchema, openingBalanceDzd: nonnegative.optional(), note,
  reasonCategory: debtReasonCategorySchema.optional(), reasonDetail: note,
}).superRefine((input, ctx) => {
  if (Boolean(input.workerId) === Boolean(input.externalCounterpartyId)
    || (input.partyType === "INTERNAL_WORKER" ? !input.workerId : !input.externalCounterpartyId)) {
    ctx.addIssue({ code: "custom", message: "Account requires exactly one matching party", path: ["workerId"] });
  }
});
export const postExactDebtEntrySchema = z.object({
  ...command, debtAccountId: entityIdSchema, entryType: z.enum(["OPENING", "ADVANCE", "ADJUSTMENT"]),
  signedAmountDzd: exactDebtAmountSchema, entryDate: timestampSchema.transform(value => new Date(value).toISOString()).optional(), note,
  reasonCategory: debtReasonCategorySchema.optional(), reasonDetail: note,
});
export const payExactDebtEntrySchema = z.object({
  ...command, debtEntryId: entityIdSchema, amountDzd: positive, paymentMethod: paymentMethodSchema.default("CASH"), note,
});
export const correctExactDebtEntrySchema = z.object({
  ...command, entryId: entityIdSchema, amountDzd: exactDebtAmountSchema.refine(value => value !== "0.00", "Correction must be nonzero"), reason: z.string().trim().min(1).max(1000),
});
export const voidExactDebtEntrySchema = z.object({ ...command, entryId: entityIdSchema, voidReason: z.string().trim().min(1).max(1000) });
export const settleExactDebtAccountSchema = z.object({ ...command, debtAccountId: entityIdSchema, note });
export const exactDebtDetailSchema = z.object({
  account: exactDebtAccountSchema,
  entries: z.array(exactDebtEntrySchema.extend({ remainingDzd: exactDebtAmountSchema.nullable() })).max(100000),
});
const aggregate = z.string().max(256).regex(/^(?:0|[1-9]\d*)\.\d{2}$/);
export const exactDebtSummarySchema = z.object({
  accounts: z.array(exactDebtAccountSchema).max(100000), grossPayableDzd: aggregate, grossReceivableDzd: aggregate,
});
export type ExactDebtAccount = z.infer<typeof exactDebtAccountSchema>;
export type ExactDebtEntry = z.infer<typeof exactDebtEntrySchema>;
export type ExactDebtDetail = z.infer<typeof exactDebtDetailSchema>;
export type CreateExactDebtAccount = z.input<typeof createExactDebtAccountSchema>;
export type PostExactDebtEntry = z.input<typeof postExactDebtEntrySchema>;
export type PayExactDebtEntry = z.input<typeof payExactDebtEntrySchema>;
export type CorrectExactDebtEntry = z.input<typeof correctExactDebtEntrySchema>;
export type VoidExactDebtEntry = z.input<typeof voidExactDebtEntrySchema>;
export type SettleExactDebtAccount = z.input<typeof settleExactDebtAccountSchema>;
