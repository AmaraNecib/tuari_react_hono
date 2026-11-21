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
export const payrollOpeningOutputSchema = z.object({
  employeeId: id, review: z.enum(["UNREVIEWED", "REVIEWED"]),
  wages: amount.nullable(), advances: amount.nullable(),
  sources: z.array(z.object({ kind, sourceId: id, amount, currentAmount: amount, remaining: amount, debtAccountId: id, debtEntryId: id }).strict()).max(2),
  history: z.array(z.object({ id, kind, sourceId: id, oldAmount: amount, newAmount: amount, ...actor, reason: z.string().max(1000), status: z.enum(["LIVE", "VOIDED"]), voidedAt: timestampSchema.nullable(), voidedBy: id.nullable(), voidReason: z.string().nullable() }).strict()).max(10000),
}).strict();
export const payrollOpeningContract = {
  employeePayrollOpeningGet: oc.input(z.object({ employeeId: id }).strict()).output(payrollOpeningOutputSchema),
  employeePayrollOpeningReview: oc.input(payrollOpeningReviewInputSchema).output(payrollOpeningOutputSchema),
  employeePayrollOpeningCorrect: oc.input(payrollOpeningCorrectInputSchema).output(payrollOpeningOutputSchema),
} as const;
