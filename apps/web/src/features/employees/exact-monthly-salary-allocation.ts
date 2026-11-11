import { Money, sumMoney, exactSalaryDaysSchema, exactSalaryMonthlyApprovalInputSchema, type ExactSalaryMonthAmount, type ExactSalaryMonthlyApprovalInput } from "@tuari/contracts"
import { parseLocalizedMoneyInput } from "@/features/shared/exact-money-input"

export type SalaryAllocationDraft = {
  unallocatedAmount: string
  segments: { id: string; projectId: string; amount: string; days: string }[]
}
export const emptySalaryAllocation = (): SalaryAllocationDraft => ({ unallocatedAmount: "", segments: [] })

/** Explicit remainder suggestion only. Never mutate allocations when a month amount changes. */
export function salaryAllocationRemainder(amount: string, draft: SalaryAllocationDraft): string | null {
  try {
    const allocated = Money.parse(sumMoney(draft.segments.map(row => parseLocalizedMoneyInput(row.amount))))
    const remainder = parseLocalizedMoneyInput(amount).subtract(allocated)
    return remainder.compare(Money.parse("0")) < 0 ? null : remainder.toWire()
  } catch { return null }
}

/** Return raw operator fields, not the schema's derived period/total output. */
export function buildSalaryMonthlyApproval(requestId: string, employeeId: string, months: readonly ExactSalaryMonthAmount[], allocations: Readonly<Record<string, SalaryAllocationDraft>>, projectIds: ReadonlySet<string>): ExactSalaryMonthlyApprovalInput {
  let records = months.length
  if (records > 10000) throw new RangeError("Monthly approval resource limit exceeded")
  for (const row of months) {
    records += allocations[row.id]?.segments.length ?? 0
    if (records > 10000) throw new RangeError("Monthly approval resource limit exceeded")
  }
  const raw = { requestId, employeeId, currency: "DZD" as const, months: months.map(row => {
    const draft = allocations[row.id] ?? emptySalaryAllocation()
    return { id: row.id, month: row.month, amount: parseLocalizedMoneyInput(row.amount).toWire(), unallocatedAmount: parseLocalizedMoneyInput(draft.unallocatedAmount).toWire(), segments: draft.segments.map(segment => {
      if (!projectIds.has(segment.projectId)) throw new TypeError("Select an available project")
      return { id: segment.id, projectId: segment.projectId, amount: parseLocalizedMoneyInput(segment.amount).toWire(), ...(segment.days.trim() ? { days: exactSalaryDaysSchema.parse(Number(segment.days)) } : {}) }
    }) }
  }) }
  exactSalaryMonthlyApprovalInputSchema.parse(raw)
  return raw
}
