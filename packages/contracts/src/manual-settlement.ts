import { z } from "zod";
import { oc } from "@orpc/contract";
import { Money } from "./exact-money";
import { entityIdSchema } from "./core";
import { exactDebtAmountSchema } from "./debts-exact";

const positive = exactDebtAmountSchema.refine(value => Money.parse(value).compare(Money.parse("0")) > 0, "Amount must be positive");
const requestId = z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/);
const pair = {
  externalCounterpartyId: entityIdSchema,
  payableOriginalEntryId: entityIdSchema,
  receivableOriginalEntryId: entityIdSchema,
  currency: z.literal("DZD"),
  amountDzd: positive,
};
const distinct = (input: { payableOriginalEntryId: string; receivableOriginalEntryId: string }) => input.payableOriginalEntryId !== input.receivableOriginalEntryId;
const distinctError = { message: "Select two distinct original obligations", path: ["receivableOriginalEntryId"] };
export const previewManualSettlementSchema = z.object(pair).strict().refine(distinct, distinctError);
export const confirmManualSettlementSchema = z.object({
  ...pair,
  requestId,
  expectedPayableRemainingDzd: positive,
  expectedReceivableRemainingDzd: positive,
  note: z.string().trim().max(1000).nullable().optional(),
}).strict().refine(distinct, distinctError);
export const reverseManualSettlementSchema = z.object({
  requestId,
  settlementId: entityIdSchema,
  reason: z.string().trim().min(1).max(1000),
}).strict();
export const manualSettlementHistoryInputSchema = z.object({
  externalCounterpartyId: entityIdSchema,
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(100000).default(0),
}).strict();
const reportAmount = z.string().regex(/^-?(?:0|[1-9]\d*)\.\d{2}$/);
export const manualSettlementPreviewSchema = z.object({
  payableAccountId: entityIdSchema, receivableAccountId: entityIdSchema,
  payableRemainingDzd: exactDebtAmountSchema, receivableRemainingDzd: exactDebtAmountSchema,
  projectedPayableRemainingDzd: exactDebtAmountSchema, projectedReceivableRemainingDzd: exactDebtAmountSchema,
  netPositionDzd: reportAmount, projectedNetPositionDzd: reportAmount,
});
export const manualSettlementRecordSchema = z.object({
  id: entityIdSchema, externalCounterpartyId: entityIdSchema, currency: z.literal("DZD"),
  payableOriginalEntryId: entityIdSchema, receivableOriginalEntryId: entityIdSchema,
  payableSettlementEntryId: entityIdSchema, receivableSettlementEntryId: entityIdSchema,
  amountDzd: positive, recordedAt: z.string(), actorUserId: z.string(), actorLabel: z.string(), note: z.string().nullable(),
});
export const manualSettlementReversalSchema = z.object({
  id: entityIdSchema, settlementId: entityIdSchema,
  payableReversalEntryId: entityIdSchema, receivableReversalEntryId: entityIdSchema,
  recordedAt: z.string(), actorUserId: z.string(), actorLabel: z.string(), reason: z.string(),
});
export const manualSettlementConfirmOutputSchema = z.object({ settlement: manualSettlementRecordSchema, preview: manualSettlementPreviewSchema });
export const manualSettlementReverseOutputSchema = z.object({ settlement: manualSettlementRecordSchema, reversal: manualSettlementReversalSchema });
export const manualSettlementHistoryOutputSchema = z.object({ items: z.array(manualSettlementRecordSchema.extend({ reversal: manualSettlementReversalSchema.nullable() })), nextOffset: z.number().int().nullable() });
export const manualSettlementContract = {
  preview: oc.input(previewManualSettlementSchema).output(manualSettlementPreviewSchema),
  confirm: oc.input(confirmManualSettlementSchema).output(manualSettlementConfirmOutputSchema),
  history: oc.input(manualSettlementHistoryInputSchema).output(manualSettlementHistoryOutputSchema),
  reverse: oc.input(reverseManualSettlementSchema).output(manualSettlementReverseOutputSchema),
};
export type PreviewManualSettlement = z.input<typeof previewManualSettlementSchema>;
export type ConfirmManualSettlement = z.input<typeof confirmManualSettlementSchema>;
export type ReverseManualSettlement = z.input<typeof reverseManualSettlementSchema>;
