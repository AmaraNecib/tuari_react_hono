import { z } from "zod";
import { entityIdSchema, timestampSchema } from "./core";

const money = z.string().max(96).regex(/^-?(?:0|[1-9]\d*)\.\d{2}$/).refine(value => value !== "-0.00");
const count = z.number().int().nonnegative();

/** Exact-output counterpart to debtReportSchema; intentionally not barrel-exported. */
export const exactDebtReportSchema = z.object({
  type: z.literal("DEBT"),
  generatedAt: timestampSchema,
  summary: z.object({
    totalOutstandingDzd: money,
    totalSettledDzd: money,
    overdueDzd: money,
    partyCount: count,
  }).strict(),
  agingBreakdown: z.array(z.object({
    ageCategory: z.enum(["0-30_DAYS", "31-60_DAYS", "60+_DAYS"]),
    countOpen: count,
    amountDzd: money,
  }).strict()),
  byParty: z.array(z.object({
    partyId: entityIdSchema,
    partyName: z.string().min(1),
    partyType: z.enum(["INTERNAL_WORKER", "EXTERNAL_COUNTERPARTY"]),
    outstandingDzd: money,
    settledDzd: money,
    lastTransaction: timestampSchema.nullable(),
  }).strict()),
  topDebtors: z.array(z.object({
    partyName: z.string().min(1),
    amountDzd: money,
    daysSinceLastPayment: z.number().nonnegative(),
  }).strict()),
}).strict();

export type ExactDebtReport = z.infer<typeof exactDebtReportSchema>;
