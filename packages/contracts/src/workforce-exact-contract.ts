import { oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";
import { entityIdSchema, timestampSchema } from "./core";
import { Money, sumMoney } from "./exact-money";
import { exactSalaryApprovalInputSchema, exactSalaryAmountSchema, exactSalaryCashInputSchema, exactSalaryOpeningReviewInputSchema, exactSalaryAdvanceRepaymentInputSchema, exactSalaryCorrectionInputSchema } from "./workforce-exact";
import { exactSalaryMonthlyApprovalInputSchema, exactSalaryMonthSchema } from "./workforce-monthly-exact";

const { requestId: _requestId, ...approvalFields } = exactSalaryApprovalInputSchema.shape;
export const exactSalaryEarningRecordSchema = z.object({
  ...approvalFields,
  id: entityIdSchema, debtAccountId: entityIdSchema.nullable(), debtEntryId: entityIdSchema.nullable(),
  actorUserId: z.string().nullable(), actorLabel: z.string().nullable(), transactionId: z.string().nullable(), createdAt: timestampSchema,
}).strict().superRefine((value, ctx) => {
  const { id, debtAccountId, debtEntryId, actorUserId: _user, actorLabel: _label, transactionId: _transaction, createdAt: _created, ...approved } = value;
  const parsed = exactSalaryApprovalInputSchema.safeParse({ ...approved, requestId: id });
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ ...issue });
  if (value.approvedAmount === "0.00" ? debtAccountId !== null || debtEntryId !== null : debtAccountId === null || debtEntryId === null) {
    ctx.addIssue({ code: "custom", message: "Earning requires matching obligation links" });
  }
});
const aggregate = z.string().max(256).regex(/^(?:0|[1-9]\d*)\.\d{2}$/);
export const exactSalaryMonthlyApprovalResultSchema = z.object({
  currency: z.literal("DZD"), totalAmount: aggregate,
  months: z.array(z.object({ id: entityIdSchema, month: exactSalaryMonthSchema, earning: exactSalaryEarningRecordSchema }).strict()).min(1).max(10000),
}).strict().refine(value => sumMoney(value.months.map(row => Money.parse(row.earning.approvedAmount))) === value.totalAmount, "Monthly result must reconcile");
export const exactSalaryEarningStatusSchema = z.object({ earning: exactSalaryEarningRecordSchema, remainingAmount: exactSalaryAmountSchema }).strict();
export const exactProjectSalaryCostSchema = z.object({
  projectId: entityIdSchema, currency: z.literal("DZD"), totalAmount: aggregate,
  segments: z.array(z.object({
    earningId: entityIdSchema, employeeId: entityIdSchema,
    periodStart: approvalFields.periodStart, periodEnd: approvalFields.periodEnd,
    segment: approvalFields.segments.element,
  }).strict()).max(10000),
}).strict().refine(value => value.segments.every(row => row.segment.projectId === value.projectId)
  && sumMoney(value.segments.map(row => Money.parse(row.segment.amount))) === value.totalAmount, "Project salary cost must reconcile");

const auditFields = { actorUserId: z.string().nullable(), actorLabel: z.string().nullable(), transactionId: z.string().nullable(), createdAt: timestampSchema };
export const exactPayrollCorrectionRecordSchema = z.object({ id: entityIdSchema, employeeId: entityIdSchema, earningId: entityIdSchema, currency: z.literal("DZD"), previousAmount: exactSalaryAmountSchema, newAmount: exactSalaryAmountSchema, reason: z.string().min(1).max(1000), correctionEntryId: entityIdSchema, ...auditFields }).strict();
export const exactPayrollOpeningRecordSchema = z.object({ id: entityIdSchema, employeeId: entityIdSchema, currency: z.literal("DZD"), status: z.enum(["UNREVIEWED","REVIEWED"]), wagesOwed: exactSalaryAmountSchema.nullable(), advancesOwed: exactSalaryAmountSchema.nullable(), wageDebtAccountId: entityIdSchema.nullable(), wageDebtEntryId: entityIdSchema.nullable(), advanceDebtAccountId: entityIdSchema.nullable(), advanceDebtEntryId: entityIdSchema.nullable(), actorUserId: z.string().nullable(), actorLabel: z.string().nullable(), transactionId: z.string().nullable(), createdAt: timestampSchema }).strict();
const exactPayrollCashFields = z.object({ employeeId: entityIdSchema, currency: z.literal("DZD"), amount: exactSalaryAmountSchema, paymentDate: timestampSchema, wageAllocations: z.array(exactSalaryCashInputSchema.shape.wageAllocations.element).max(10000), advance: exactSalaryCashInputSchema.shape.advance });
export const exactPayrollCashRecordSchema = exactPayrollCashFields.extend({ id: entityIdSchema, wageAllocations: z.array(exactSalaryCashInputSchema.shape.wageAllocations.element.extend({ debtAccountId: entityIdSchema, debtEntryId: entityIdSchema, paymentEntryId: entityIdSchema })).max(10000), advance: z.object({ id: entityIdSchema, amount: exactSalaryAmountSchema, debtAccountId: entityIdSchema, debtEntryId: entityIdSchema }).strict().nullable(), ...auditFields }).strict().superRefine((value, ctx) => {
  const total = sumMoney([...value.wageAllocations.map(row => Money.parse(row.amount)), ...(value.advance ? [Money.parse(value.advance.amount)] : [])]);
  if (value.amount === "0.00" || total !== value.amount) ctx.addIssue({ code: "custom", path: ["amount"], message: "Cash record must reconcile explicit targets" });
});
export const exactPayrollSettlementRecordSchema = z.object({ employeeId: entityIdSchema, currency: z.literal("DZD"), source: exactSalaryAdvanceRepaymentInputSchema.shape.source, amount: exactSalaryAmountSchema, paymentDate: timestampSchema, id: entityIdSchema, debtAccountId: entityIdSchema, debtEntryId: entityIdSchema, paymentEntryId: entityIdSchema, ...auditFields }).strict();
export const exactPayrollAdvanceRecordSchema = z.object({ id: entityIdSchema, cashId: entityIdSchema, employeeId: entityIdSchema, currency: z.literal("DZD"), amount: exactSalaryAmountSchema, paymentDate: timestampSchema, debtAccountId: entityIdSchema, debtEntryId: entityIdSchema }).strict();
export const exactPayrollLifecycleSchema = z.object({ opening: exactPayrollOpeningRecordSchema.nullable(), earnings: z.array(exactSalaryEarningStatusSchema).max(10000), cash: z.array(exactPayrollCashRecordSchema).max(10000), advances: z.array(exactPayrollAdvanceRecordSchema).max(10000), settlements: z.array(exactPayrollSettlementRecordSchema).max(10000), corrections: z.array(exactPayrollCorrectionRecordSchema).max(10000) }).strict();

/** Separate injectable exact payroll contract, never part of the active numeric appContract. */
export const exactWorkforceContract = {
  approveMonthlyEarnings: oc.input(exactSalaryMonthlyApprovalInputSchema).output(exactSalaryMonthlyApprovalResultSchema),
  listEmployeeEarnings: oc.input(z.object({ employeeId: entityIdSchema }).strict()).output(z.array(exactSalaryEarningStatusSchema).max(10000)),
  getProjectSalaryCost: oc.input(z.object({ projectId: entityIdSchema }).strict()).output(exactProjectSalaryCostSchema),
  recordPayrollCash: oc.input(exactSalaryCashInputSchema).output(exactPayrollCashRecordSchema),
  reviewPayrollOpening: oc.input(exactSalaryOpeningReviewInputSchema).output(exactPayrollOpeningRecordSchema),
  repayPayrollAdvance: oc.input(exactSalaryAdvanceRepaymentInputSchema).output(exactPayrollSettlementRecordSchema),
  correctPayrollEarning: oc.input(exactSalaryCorrectionInputSchema).output(exactPayrollCorrectionRecordSchema),
  getEmployeePayrollLifecycle: oc.input(z.object({ employeeId: entityIdSchema }).strict()).output(exactPayrollLifecycleSchema),
} as const;
export type ExactWorkforceClient = ContractRouterClient<typeof exactWorkforceContract>;
