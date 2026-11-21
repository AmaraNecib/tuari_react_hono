import { z } from "zod";
import { Money } from "./exact-money";
import { entityIdSchema, timestampSchema } from "./core";
import { employeeEarningSchema } from "./workforce";

const payrollId = entityIdSchema.max(128);
const payrollAmount = z.string().max(96).superRefine((value, context) => {
  try { Money.parse(value, "DZD"); }
  catch { context.addIssue({ code: "custom", message: "Invalid bounded DZD amount" }); }
});
const reportAmount = z.string().max(259).regex(/^(?:0|[1-9]\d{0,255})(?:\.\d{1,2})?$/);
const positiveAmount = payrollAmount.refine(value => {
  try { return Money.parse(value, "DZD").compare(Money.parse("0")) > 0; }
  catch { return false; }
}, "Amount must be positive");
const audit = { actorUserId: payrollId.nullable(), actorLabel: z.string().max(1000).nullable(), transactionId: payrollId.nullable(), createdAt: timestampSchema };
const leg = z.object({ debtAccountId: payrollId, debtEntryId: payrollId, settlementEntryId: payrollId }).strict();

export const payrollCashRecordSchema = z.object({
  ...audit, id: payrollId, employeeId: payrollId, currency: z.literal("DZD"), amount: positiveAmount, paymentDate: timestampSchema,
  wageAllocations: z.array(z.object({ id: payrollId, source: z.object({ kind: z.enum(["EARNING", "OPENING"]), id: payrollId }).strict(), amount: positiveAmount, debtAccountId: payrollId, debtEntryId: payrollId, paymentEntryId: payrollId }).strict()).max(9999),
  advance: z.object({ id: payrollId, amount: positiveAmount, debtAccountId: payrollId, debtEntryId: payrollId }).strict().nullable(),
}).strict();
export const payrollRepaymentRecordSchema = z.object({
  ...audit, id: payrollId, employeeId: payrollId, currency: z.literal("DZD"), amount: positiveAmount, paymentDate: timestampSchema,
  source: z.object({ kind: z.enum(["ADVANCE", "OPENING_ADVANCE"]), id: payrollId }).strict(), debtAccountId: payrollId, debtEntryId: payrollId, paymentEntryId: payrollId,
}).strict();
export const payrollOffsetRecordSchema = z.object({
  ...audit, id: payrollId, employeeId: payrollId, currency: z.literal("DZD"), amount: positiveAmount, settlementDate: timestampSchema,
  wageSource: z.object({ kind: z.enum(["EARNING", "OPENING"]), id: payrollId }).strict(),
  advanceSource: z.object({ kind: z.enum(["ADVANCE", "OPENING_ADVANCE"]), id: payrollId }).strict(),
  wage: leg, advance: leg,
}).strict();

export const employeePayrollGetInputSchema = z.object({ employeeId: payrollId }).strict();
export const employeePayrollCashRecordInputSchema = z.object({
  requestId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/), employeeId: payrollId, amount: positiveAmount, paymentDate: timestampSchema,
  wages: z.array(z.union([z.object({ earningId: payrollId, amount: positiveAmount }).strict(), z.object({ openingId: payrollId, amount: positiveAmount }).strict()])).max(9999), advanceAmount: positiveAmount.optional(),
}).strict();
export const employeePayrollAdvanceRepayInputSchema = z.object({
  requestId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/), employeeId: payrollId, advanceId: payrollId.optional(), openingAdvanceId: payrollId.optional(), amount: positiveAmount, paymentDate: timestampSchema,
}).strict().refine(value => Boolean(value.advanceId) !== Boolean(value.openingAdvanceId), "Choose exactly one advance source");
export const employeePayrollAdvanceOffsetInputSchema = z.object({
  requestId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/), employeeId: payrollId,
  wageSource: z.object({ kind: z.literal("EARNING"), id: payrollId }).strict(),
  advanceSource: z.object({ kind: z.literal("ADVANCE"), id: payrollId }).strict(),
  amount: positiveAmount, settlementDate: timestampSchema,
}).strict();

export const employeePayrollOutputSchema = z.object({
  employeeId: payrollId, currency: z.literal("DZD"),
  earnings: z.array(z.object({ earning: employeeEarningSchema, registration: z.enum(["POSTED", "PENDING_REGISTRATION"]), remaining: payrollAmount }).strict()).max(10_000),
  cash: z.array(payrollCashRecordSchema).max(10_000), repayments: z.array(payrollRepaymentRecordSchema).max(10_000), offsets: z.array(payrollOffsetRecordSchema).max(10_000),
  advances: z.array(z.object({ cashId: payrollId, advance: z.object({ id: payrollId, amount: positiveAmount, debtAccountId: payrollId, debtEntryId: payrollId }).strict(), remaining: payrollAmount }).strict()).max(10_000),
  opening: z.object({ review: z.enum(["UNREVIEWED", "REVIEWED"]), reminder: z.boolean(), wages: reportAmount.nullable(), advances: reportAmount.nullable() }).strict(),
  summary: z.object({ approvedEarnings: reportAmount, wageCashPaid: reportAmount, wagesOffset: reportAmount, wagesOwed: reportAmount, advancesGiven: reportAmount, advancesCashRecovered: reportAmount, advancesOffset: reportAmount, advancesOwed: reportAmount, unallocatedEarnings: reportAmount, currentAppTotalsExcludeUnknownOpening: z.boolean() }).strict(),
}).strict();

export type EmployeePayrollGetInput = z.infer<typeof employeePayrollGetInputSchema>;
export type EmployeePayrollCashRecordInput = z.infer<typeof employeePayrollCashRecordInputSchema>;
export type EmployeePayrollAdvanceRepayInput = z.infer<typeof employeePayrollAdvanceRepayInputSchema>;
export type EmployeePayrollAdvanceOffsetInput = z.infer<typeof employeePayrollAdvanceOffsetInputSchema>;
