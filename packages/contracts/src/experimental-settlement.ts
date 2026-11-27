import { oc } from "@orpc/contract";
import { z } from "zod";
import { entityIdSchema } from "./core";
import { exactDebtAmountSchema } from "./debts-exact";
import { Money } from "./exact-money";
import {
  confirmManualSettlementSchema,
  manualSettlementHistoryInputSchema,
  manualSettlementRecordSchema,
  manualSettlementReversalSchema,
  manualSettlementConfirmOutputSchema,
  manualSettlementPreviewSchema,
  manualSettlementReverseOutputSchema,
  previewManualSettlementSchema,
  reverseManualSettlementSchema,
} from "./manual-settlement";

export const experimentalSettlementSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["MANUAL", "PURCHASE", "SALE", "INVOICE_PURCHASE", "INVOICE_SALE"]), id: entityIdSchema, label: z.string().min(1).max(200) }).strict(),
  z.object({ kind: z.literal("RESTRICTED") }).strict(),
]);

const positive = exactDebtAmountSchema.refine(value => Money.parse(value).compare(Money.parse("0")) > 0, "Amount must be positive");

const candidateBase = {
  id: entityIdSchema,
  debtAccountId: entityIdSchema,
  direction: z.enum(["PAYABLE", "RECEIVABLE"]),
  postingSequence: z.number().int(),
  remainingDzd: positive,
};

export const experimentalSettlementCandidateSchema = z.discriminatedUnion("sourceKind", [
  z.object({ ...candidateBase, sourceKind: z.enum(["MANUAL", "PURCHASE", "SALE", "INVOICE_PURCHASE", "INVOICE_SALE"]), sourceId: entityIdSchema, sourceLabel: z.string().min(1).max(200) }).strict(),
  z.object({ ...candidateBase, sourceKind: z.literal("RESTRICTED") }).strict(),
]);

export const experimentalSettlementHistoryOutputSchema = z.object({
  items: z.array(manualSettlementRecordSchema.extend({
    payableSource: experimentalSettlementSourceSchema,
    receivableSource: experimentalSettlementSourceSchema,
    reversal: manualSettlementReversalSchema.nullable(),
  })),
  nextOffset: z.number().int().nullable(),
});

export const experimentalSettlementContract = {
  candidates: oc.input(z.object({ externalCounterpartyId: entityIdSchema }).strict()).output(z.array(experimentalSettlementCandidateSchema)),
  accountHistory: oc.input(z.object({ debtAccountId: entityIdSchema }).strict()).output(experimentalSettlementHistoryOutputSchema),
  preview: oc.input(previewManualSettlementSchema).output(manualSettlementPreviewSchema),
  confirm: oc.input(confirmManualSettlementSchema).output(manualSettlementConfirmOutputSchema),
  history: oc.input(manualSettlementHistoryInputSchema).output(experimentalSettlementHistoryOutputSchema),
  reverse: oc.input(reverseManualSettlementSchema).output(manualSettlementReverseOutputSchema),
};
