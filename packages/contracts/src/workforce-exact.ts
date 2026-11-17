import { z } from "zod";
import { entityIdSchema, employeeBatchLimit } from "./core";
import {
  employeeSchema, employeeStateHistorySchema,
  employeeCreateInputSchema, employeeUpdateInputSchema, employeeBatchCreateInputSchema, employeeBatchCreateRowInputSchema,
  employeeBatchCreateResultSchema, employeeSaveInputSchema,
} from "./workforce";
import {
  Money, SalaryReference, sumMoneyHistory,
} from "./exact-money";

export const exactSalaryReferenceSchema = z.object({
  period: z.enum(["DAILY", "MONTHLY", "WEEKLY"]),
  amount: z.string(),
}).strict().transform((value, ctx) => {
  try { return SalaryReference.parse(value.period, value.amount).toWire(); }
  catch (error) {
    ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid salary reference" });
    return z.NEVER;
  }
});
export type ExactSalaryReference = z.infer<typeof exactSalaryReferenceSchema>;

export const exactSalaryAmountSchema = z.string().transform((value, ctx) => {
  try {
    const amount = Money.parse(value);
    if (amount.compare(Money.parse("0")) < 0) throw new RangeError("Salary amount must be nonnegative");
    return amount.toWire();
  } catch (error) {
    ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid salary amount" });
    return z.NEVER;
  }
});
export const exactEmployeeSchema = employeeSchema.omit({ salaryAmountDzd: true, salaryPeriod: true }).extend({
  salaryReference: exactSalaryReferenceSchema.nullable(), currency: z.literal("DZD"),
}).strict();
export const exactEmployeeStateHistorySchema = employeeStateHistorySchema.omit({ salaryAmountDzd: true, salaryPeriod: true }).extend({
  salaryReference: exactSalaryReferenceSchema.nullable(), currency: z.literal("DZD"),
}).strict();
export const exactEmployeeCreateInputSchema = employeeCreateInputSchema.omit({ salaryAmountDzd: true, salaryPeriod: true }).extend({
  salaryReference: exactSalaryReferenceSchema.nullable().optional(),
}).strict();
export const exactEmployeeUpdateInputSchema = employeeUpdateInputSchema.omit({ salaryAmountDzd: true, salaryPeriod: true }).extend({
  salaryReference: exactSalaryReferenceSchema.nullable().optional(),
}).strict();
export type ExactEmployee = z.infer<typeof exactEmployeeSchema>;
export type ExactEmployeeStateHistory = z.infer<typeof exactEmployeeStateHistorySchema>;
export const exactEmployeeBatchCreateRowInputSchema = employeeBatchCreateRowInputSchema.omit({ salaryAmountDzd: true, salaryPeriod: true }).extend({
  salaryReference: exactSalaryReferenceSchema.nullable().optional(),
}).strict();
export const exactEmployeeBatchCreateInputSchema = employeeBatchCreateInputSchema.safeExtend({
  employees: z.array(exactEmployeeBatchCreateRowInputSchema).min(1).max(employeeBatchLimit),
}).strict();
export const exactEmployeeBatchCreateResultSchema = employeeBatchCreateResultSchema.extend({ employees: z.array(exactEmployeeSchema) }).strict();
export const exactEmployeeSaveInputSchema = employeeSaveInputSchema.omit({ salaryAmountDzd: true, salaryPeriod: true }).extend({
  salaryReference: exactSalaryReferenceSchema.nullable().optional(),
}).strict();
export type ExactEmployeeBatchCreateInput = z.input<typeof exactEmployeeBatchCreateInputSchema>;
export type ExactEmployeeSaveInput = z.input<typeof exactEmployeeSaveInputSchema>;
export type ExactEmployeeCreateInput = z.input<typeof exactEmployeeCreateInputSchema>;
export type ExactEmployeeUpdateInput = z.input<typeof exactEmployeeUpdateInputSchema>;
export const exactSalaryDaysSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Expected a valid covered date");

export const exactSalarySegmentSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  amount: exactSalaryAmountSchema,
  days: exactSalaryDaysSchema.optional(),
}).strict();
export type ExactSalarySegment = z.infer<typeof exactSalarySegmentSchema>;

export const exactSalaryApprovalInputSchema = z.object({
  requestId: entityIdSchema,
  employeeId: entityIdSchema,
  currency: z.literal("DZD"),
  periodStart: date,
  periodEnd: date,
  approvedAmount: exactSalaryAmountSchema,
  unallocatedAmount: exactSalaryAmountSchema,
  segments: z.array(exactSalarySegmentSchema).max(10000),
}).strict().superRefine((value, ctx) => {
  if (value.periodEnd < value.periodStart) ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "Covered period ends before it starts" });
  const identities = new Set<string>();
  value.segments.forEach((segment, index) => {
    if (identities.has(segment.id)) ctx.addIssue({ code: "custom", path: ["segments", index, "id"], message: "Segment identity must be unique" });
    identities.add(segment.id);
  });
  const total = sumMoneyHistory([Money.parse(value.unallocatedAmount), ...value.segments.map(segment => Money.parse(segment.amount))]);
  if (total !== value.approvedAmount) ctx.addIssue({ code: "custom", path: ["segments"], message: "Explicit allocations and unallocated amount must equal approved earnings" });
});
export type ExactSalaryApprovalInput = z.input<typeof exactSalaryApprovalInputSchema>;
