import { z } from "zod";
import { oc } from "@orpc/contract";
import { exactDebtAmountSchema } from "./debts-exact";
import { entityIdSchema, timestampSchema } from "./core";

const id = entityIdSchema.max(128);
const amount = exactDebtAmountSchema.refine(value => !value.startsWith("-"), "Opening amount must be nonnegative");
const kind = z.enum(["WAGE", "ADVANCE"]);
const requestId = z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/);
const actor = { actorUserId: id.nullable(), actorLabel: z.string().max(1000).nullable(), createdAt: timestampSchema };
export const payrollOpeningReviewInputSchema = z.object({ requestId, employeeId: id, wages: amount, advances: amount }).strict();
export const payrollOpeningCorrectInputSchema = z.object({ requestId, employeeId: id, kind, expectedAmount: amount, amount, reason: z.string().trim().min(1).max(1000) }).strict();
export const payrollOpeningReconcileInputSchema = z.object({ requestId, employeeId: id, proposalId: id, expectedAmount: amount, refundAmount: amount.refine(value => value !== "0.00", "Refund must be positive"), refundDate: timestampSchema, confirmCashRefund: z.literal(true) }).strict();
export const payrollOpeningCancelInputSchema = z.object({ requestId, employeeId: id, proposalId: id, reason: z.string().trim().min(1).max(1000) }).strict();
const audit = { ...actor, transactionId: id.nullable() };
const resolution = z.object({ id, status: z.enum(["APPLIED", "CANCELLED"]), refundEntryId: id.nullable(), correctionEntryId: id.nullable(), reason: z.string().max(1000), ...audit }).strict();
const proposal = z.object({ id, sourceId: id, employeeId: id, kind, oldAmount: amount, newAmount: amount, requiredRefund: amount, reason: z.string().max(1000), ...audit, status: z.enum(["PENDING", "APPLIED", "CANCELLED"]), resolution: resolution.nullable() }).strict();
const refund = z.object({ id, proposalId: id, sourceId: id, employeeId: id, kind, amount, direction: z.enum(["IN", "OUT"]), refundDate: timestampSchema, ...audit, debtAccountId: id, debtEntryId: id }).strict();
export const payrollOpeningOutputSchema = z.object({
  employeeId: id, review: z.enum(["UNREVIEWED", "REVIEWED"]),
  reviewAudit: z.object({ ...actor, transactionId: id.nullable(), wages: amount, advances: amount }).strict().nullable(),
  wages: amount.nullable(), advances: amount.nullable(),
  proposals: z.array(proposal).max(1000), refunds: z.array(refund).max(1000),
  sources: z.array(z.object({ kind, sourceId: id, amount, currentAmount: amount, remaining: amount, debtAccountId: id, debtEntryId: id }).strict()).max(2),
  history: z.array(z.object({ id, kind, sourceId: id, oldAmount: amount, newAmount: amount, ...actor, reason: z.string().max(1000), status: z.enum(["LIVE", "VOIDED"]), voidedAt: timestampSchema.nullable(), voidedBy: id.nullable(), voidReason: z.string().nullable() }).strict()).max(10000),
}).strict();
export type PayrollOpeningReviewInput = z.input<typeof payrollOpeningReviewInputSchema>;
export type PayrollOpeningCorrectInput = z.input<typeof payrollOpeningCorrectInputSchema>;
export type PayrollOpeningOutput = z.infer<typeof payrollOpeningOutputSchema>;
export type PayrollOpeningReconcileInput = z.input<typeof payrollOpeningReconcileInputSchema>;
export type PayrollOpeningCancelInput = z.input<typeof payrollOpeningCancelInputSchema>;

const openingWrite = oc.errors({
  BAD_REQUEST: { data: z.object({ payrollOutcome: z.literal("NOT_COMMITTED") }).optional() },
  NOT_FOUND: { data: z.object({ payrollOutcome: z.literal("NOT_COMMITTED") }).optional() },
  CONFLICT: { data: z.object({ payrollOutcome: z.literal("NOT_COMMITTED") }).optional() },
});
export const payrollOpeningContract = {
  employeePayrollOpeningGet: oc.input(z.object({ employeeId: id }).strict()).output(payrollOpeningOutputSchema),
  employeePayrollOpeningReview: openingWrite.input(payrollOpeningReviewInputSchema).output(payrollOpeningOutputSchema),
  employeePayrollOpeningCorrect: openingWrite.input(payrollOpeningCorrectInputSchema).output(payrollOpeningOutputSchema),
  employeePayrollOpeningReconcile: openingWrite.input(payrollOpeningReconcileInputSchema).output(payrollOpeningOutputSchema),
  employeePayrollOpeningCancelProposal: openingWrite.input(payrollOpeningCancelInputSchema).output(payrollOpeningOutputSchema),
} as const;
