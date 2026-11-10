import { z } from "zod";
import { entityIdSchema, timestampSchema } from "./core";
import {
  employeeSchema, employeeStateHistorySchema, employeeSalaryPaymentSchema,
  employeeCreateInputSchema, employeeUpdateInputSchema,
} from "./workforce";
import {
  Money, SalaryReference, UnitPrice, Quantity, derivedPrice, priceLine,
  finalizeLines, allocateMoney, sumMoneyHistory,
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
export const exactEmployeeSalaryPaymentSchema = employeeSalaryPaymentSchema.extend({
  expectedAmountDzd: exactSalaryAmountSchema, actualAmountDzd: exactSalaryAmountSchema, currency: z.literal("DZD"),
}).strict();
export const exactEmployeeCreateInputSchema = employeeCreateInputSchema.omit({ salaryAmountDzd: true, salaryPeriod: true }).extend({
  salaryReference: exactSalaryReferenceSchema.nullable().optional(),
}).strict();
export const exactEmployeeUpdateInputSchema = employeeUpdateInputSchema.omit({ salaryAmountDzd: true, salaryPeriod: true }).extend({
  salaryReference: exactSalaryReferenceSchema.nullable().optional(),
}).strict();
export type ExactEmployee = z.infer<typeof exactEmployeeSchema>;
export type ExactEmployeeStateHistory = z.infer<typeof exactEmployeeStateHistorySchema>;
export type ExactEmployeeSalaryPayment = z.infer<typeof exactEmployeeSalaryPaymentSchema>;
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

const payrollCommand = { requestId: entityIdSchema, employeeId: entityIdSchema, currency: z.literal("DZD") };
export const exactSalaryOpeningReviewInputSchema = z.object({
  ...payrollCommand,
  review: z.discriminatedUnion("status", [
    z.object({ status: z.literal("UNREVIEWED") }).strict(),
    z.object({ status: z.literal("REVIEWED"), wagesOwed: exactSalaryAmountSchema, advancesOwed: exactSalaryAmountSchema }).strict(),
  ]),
}).strict();

/** Every cash unit has an explicit wage target or an explicitly declared advance. */
export const exactSalaryCashInputSchema = z.object({
  ...payrollCommand,
  amount: exactSalaryAmountSchema.refine(value => value !== "0.00", "A cash payment must be positive"),
  paymentDate: timestampSchema,
  wageAllocations: z.array(z.object({
    id: entityIdSchema,
    source: z.object({ kind: z.enum(["EARNING", "OPENING"]), id: entityIdSchema }).strict(),
    amount: exactSalaryAmountSchema.refine(value => value !== "0.00", "A wage settlement must be positive"),
  }).strict()).max(10000),
  advance: z.object({ id: entityIdSchema, amount: exactSalaryAmountSchema.refine(value => value !== "0.00", "An advance must be positive") }).strict().nullable(),
}).strict().superRefine((value, ctx) => {
  const total = sumMoneyHistory([
    ...value.wageAllocations.map(allocation => Money.parse(allocation.amount)),
    ...(value.advance ? [Money.parse(value.advance.amount)] : []),
  ]);
  if (total !== value.amount) ctx.addIssue({ code: "custom", path: ["amount"], message: "Cash must equal explicit wage allocations plus an explicit advance" });
  const ids = new Set<string>();
  value.wageAllocations.forEach((allocation, index) => {
    if (ids.has(allocation.id)) ctx.addIssue({ code: "custom", path: ["wageAllocations", index, "id"], message: "Cash allocation identity must be unique" });
    ids.add(allocation.id);
  });
});
export type ExactSalaryCashInput = z.input<typeof exactSalaryCashInputSchema>;
export type ExactSalaryOpeningReviewInput = z.input<typeof exactSalaryOpeningReviewInputSchema>;

/** Suggestions do not approve earnings or create an obligation. */
export function suggestExactSalaryAmount(reference: ExactSalaryReference | null, days: number): string | null {
  const validDays = exactSalaryDaysSchema.parse(days);
  if (reference === null) return null;
  const parsed = exactSalaryReferenceSchema.parse(reference);
  if (parsed.period === "WEEKLY") return Money.parse(parsed.amount).toWire();
  const quantity = Quantity.parse(String(validDays));
  const line = parsed.period === "DAILY"
    ? priceLine(UnitPrice.parse(parsed.amount), quantity)
    : derivedPrice(Money.parse(parsed.amount), Quantity.parse("30")).line(quantity);
  return finalizeLines([line]).toWire();
}

/** Explicitly requested suggestion, never an edit-side effect or payment attribution. */
export function suggestExactSalaryAllocations(
  approvedAmount: string,
  unallocatedAmount: string,
  shares: readonly { id: string; projectId: string; days: number }[],
): { segments: ExactSalarySegment[]; unallocatedAmount: string } {
  const approved = Money.parse(exactSalaryAmountSchema.parse(approvedAmount));
  const unallocated = Money.parse(exactSalaryAmountSchema.parse(unallocatedAmount));
  const target = approved.subtract(unallocated);
  if (target.compare(Money.parse("0")) < 0) throw new RangeError("Unallocated amount exceeds approved earnings");
  const validated = z.array(z.object({ id: entityIdSchema, projectId: entityIdSchema, days: exactSalaryDaysSchema }).strict()).max(10000).parse(shares);
  if (!validated.length) {
    if (target.compare(Money.parse("0")) !== 0) throw new RangeError("Allocated amount requires segments");
    return { segments: [], unallocatedAmount: unallocated.toWire() };
  }
  const allocated = allocateMoney(target, validated.map(share => ({ id: share.id, weight: String(share.days) })));
  return { segments: validated.map((share, index) => ({ ...share, amount: allocated[index]!.amount.toWire() })), unallocatedAmount: unallocated.toWire() };
}
