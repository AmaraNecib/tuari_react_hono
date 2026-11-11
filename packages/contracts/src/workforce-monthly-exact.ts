import { z } from "zod";
import { entityIdSchema } from "./core";
import { Money, allocateMoney, sumMoney } from "./exact-money";
import { exactSalaryAmountSchema, exactSalaryDaysSchema, exactSalaryApprovalInputSchema, exactSalarySegmentSchema } from "./workforce-exact";

export const exactSalaryMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected an ISO earning month");
export const exactSalaryMonthAmountSchema = z.object({
  id: entityIdSchema,
  month: exactSalaryMonthSchema,
  amount: exactSalaryAmountSchema,
}).strict();

/** Entered months own the total; a helper's proposed total is not an input constraint. */
export const exactSalaryMonthlyAmountsSchema = z.object({
  currency: z.literal("DZD"),
  months: z.array(exactSalaryMonthAmountSchema).min(1).max(10000),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>();
  const months = new Set<string>();
  value.months.forEach((row, index) => {
    if (ids.has(row.id)) ctx.addIssue({ code: "custom", path: ["months", index, "id"], message: "Month row identity must be unique" });
    if (months.has(row.month)) ctx.addIssue({ code: "custom", path: ["months", index, "month"], message: "An earning month may appear once per entry" });
    ids.add(row.id);
    months.add(row.month);
  });
}).transform(value => ({
  ...value,
  totalAmount: sumMoney(value.months.map(row => Money.parse(row.amount))),
}));
export type ExactSalaryMonthAmount = z.infer<typeof exactSalaryMonthAmountSchema>;
export type ExactSalaryMonthlyAmounts = z.infer<typeof exactSalaryMonthlyAmountsSchema>;

function coveredMonth(month: string) {
  const last = new Date(`${month}-01T00:00:00.000Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return { periodStart: `${month}-01`, periodEnd: last.toISOString().slice(0, 10) };
}

/** Explicit per-month allocations become independent originals in one atomic command. */
export const exactSalaryMonthlyApprovalInputSchema = z.object({
  requestId: entityIdSchema,
  employeeId: entityIdSchema,
  currency: z.literal("DZD"),
  months: z.array(exactSalaryMonthAmountSchema.extend({
    unallocatedAmount: exactSalaryAmountSchema,
    segments: z.array(exactSalarySegmentSchema).max(10000),
  })).min(1).max(10000),
}).strict().superRefine((value, ctx) => {
  const amounts = exactSalaryMonthlyAmountsSchema.safeParse({ currency: value.currency, months: value.months.map(({ id, month, amount }) => ({ id, month, amount })) });
  if (!amounts.success) for (const issue of amounts.error.issues) ctx.addIssue({ ...issue });
  value.months.forEach((row, index) => {
    // Invalid month syntax may still reach a refinement; the field error is sufficient.
    if (!exactSalaryMonthSchema.safeParse(row.month).success) return;
    const approval = exactSalaryApprovalInputSchema.safeParse({
      requestId: value.requestId, employeeId: value.employeeId, currency: value.currency,
      ...coveredMonth(row.month), approvedAmount: row.amount, unallocatedAmount: row.unallocatedAmount, segments: row.segments,
    });
    if (!approval.success) for (const issue of approval.error.issues) ctx.addIssue({ ...issue, path: ["months", index, ...issue.path.map(key => key === "approvedAmount" ? "amount" : key)] });
  });
}).transform(value => ({
  ...value,
  totalAmount: sumMoney(value.months.map(row => Money.parse(row.amount))),
  months: value.months.map(row => ({ ...row, ...coveredMonth(row.month) })),
}));
export type ExactSalaryMonthlyApprovalInput = z.input<typeof exactSalaryMonthlyApprovalInputSchema>;

const monthSuggestionSchema = z.object({
  currency: z.literal("DZD"),
  totalAmount: exactSalaryAmountSchema,
  months: z.array(exactSalaryMonthAmountSchema.omit({ amount: true }).extend({ days: exactSalaryDaysSchema.optional() })).min(1).max(10000),
  calculation: z.discriminatedUnion("basis", [
    z.object({ basis: z.literal("EQUAL") }).strict(),
    z.object({ basis: z.literal("WORK_DAYS") }).strict(),
    z.object({ basis: z.literal("CALENDAR_DAYS"), periodStart: exactSalaryApprovalInputSchema.shape.periodStart, periodEnd: exactSalaryApprovalInputSchema.shape.periodEnd }).strict(),
  ]),
}).strict();

/** A detached suggestion. Applying or editing the result is an explicit caller action. */
export function suggestExactSalaryMonthAmounts(input: z.input<typeof monthSuggestionSchema>) {
  const value = monthSuggestionSchema.parse(input);
  const identities = exactSalaryMonthlyAmountsSchema.parse({ currency: value.currency, months: value.months.map(row => ({ id: row.id, month: row.month, amount: "0" })) });
  const calculation = value.calculation;
  let calendarDays: number[] | undefined;
  if (calculation.basis === "CALENDAR_DAYS") {
    const start = Date.parse(`${calculation.periodStart}T00:00:00.000Z`);
    const end = Date.parse(`${calculation.periodEnd}T00:00:00.000Z`);
    if (end < start) throw new RangeError("Calendar period ends before it starts");
    calendarDays = identities.months.map(row => {
      const first = new Date(`${row.month}-01T00:00:00.000Z`);
      const next = new Date(first);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return Math.max(0, (Math.min(next.getTime() - 86400000, end) - Math.max(first.getTime(), start)) / 86400000 + 1);
    });
    if (calendarDays.some(days => days === 0) || calendarDays.reduce((a, b) => a + b, 0) !== (end - start) / 86400000 + 1) {
      throw new RangeError("Selected months must exactly cover the calendar period");
    }
  }
  const weights = identities.months.map((row, index) => {
    const days = value.months[index]!.days;
    if (calculation.basis === "WORK_DAYS" && days === undefined) throw new RangeError("Work-day suggestions require explicit days for every month");
    return { id: row.id, weight: calculation.basis === "WORK_DAYS" ? String(days) : calendarDays ? String(calendarDays[index]) : "1" };
  });
  const allocated = allocateMoney(Money.parse(value.totalAmount), weights);
  return {
    ...exactSalaryMonthlyAmountsSchema.parse({ currency: value.currency, months: identities.months.map((row, index) => ({ ...row, amount: allocated[index]!.amount.toWire() })) }),
    weights,
    calculation: value.calculation,
  };
}
export type ExactSalaryMonthProposal = ReturnType<typeof suggestExactSalaryMonthAmounts>;
