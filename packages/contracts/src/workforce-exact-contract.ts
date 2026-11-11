import { oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";
import { entityIdSchema, timestampSchema } from "./core";
import { Money, sumMoney } from "./exact-money";
import { exactSalaryApprovalInputSchema, exactSalaryAmountSchema } from "./workforce-exact";
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

/** Separate injectable exact payroll contract, never part of the active numeric appContract. */
export const exactWorkforceContract = {
  approveMonthlyEarnings: oc.input(exactSalaryMonthlyApprovalInputSchema).output(exactSalaryMonthlyApprovalResultSchema),
  listEmployeeEarnings: oc.input(z.object({ employeeId: entityIdSchema }).strict()).output(z.array(exactSalaryEarningStatusSchema).max(10000)),
  getProjectSalaryCost: oc.input(z.object({ projectId: entityIdSchema }).strict()).output(exactProjectSalaryCostSchema),
} as const;
export type ExactWorkforceClient = ContractRouterClient<typeof exactWorkforceContract>;
