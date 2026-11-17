import { describe, expect, it } from "vitest"
import { buildSalaryMonthlyApproval, salaryAllocationRemainder, type SalaryAllocationDraft } from "./exact-monthly-salary-allocation"

const months = [{ id: "oct", month: "2026-10", amount: "90071992547409.93" }]
const draft: SalaryAllocationDraft = { unallocatedAmount: "0.03", segments: [
  { id: "first", projectId: "A", amount: "90071992547409.60", days: "5" },
  { id: "second", projectId: "B", amount: "0.20", days: "" },
  { id: "third", projectId: "A", amount: "0.10", days: "7" },
] }
const ids = new Set(["A", "B"])
describe("explicit monthly allocation draft", () => {
  it("keeps exact large amounts, repeated A/B/A order and optional positive days", () => {
    const result = buildSalaryMonthlyApproval("request", "worker", months, { oct: draft }, ids)
    expect(result.months[0]).toEqual({ ...months[0], unallocatedAmount: "0.03", segments: [
      { id: "first", projectId: "A", amount: "90071992547409.60", days: 5 },
      { id: "second", projectId: "B", amount: "0.20" },
      { id: "third", projectId: "A", amount: "0.10", days: 7 },
    ] })
    expect(salaryAllocationRemainder(months[0]!.amount, draft)).toBe("0.03")
    expect(draft.unallocatedAmount).toBe("0.03")
  })
  it.each(["0", "-1", "0.5", "9007199254740992"])("rejects invalid optional days %s", days => {
    expect(() => buildSalaryMonthlyApproval("request", "worker", months, { oct: { ...draft, segments: [{ ...draft.segments[0]!, days }, ...draft.segments.slice(1)] } }, ids)).toThrow()
  })
  it("refuses missing projects, reconciliation drift, precision excess and duplicate segment identities", () => {
    expect(() => buildSalaryMonthlyApproval("request", "worker", months, { oct: draft }, new Set(["A"]))).toThrow()
    expect(() => buildSalaryMonthlyApproval("request", "worker", months, { oct: { ...draft, unallocatedAmount: "0.04" } }, ids)).toThrow()
    expect(() => buildSalaryMonthlyApproval("request", "worker", [{ ...months[0]!, amount: "1.001" }], { oct: draft }, ids)).toThrow()
    expect(() => buildSalaryMonthlyApproval("request", "worker", months, { oct: { ...draft, segments: draft.segments.map(row => ({ ...row, id: "duplicate" })) } }, ids)).toThrow()
  })
  it("does not guess missing unallocated input or allow a negative remainder", () => {
    expect(() => buildSalaryMonthlyApproval("request", "worker", [{ ...months[0]!, amount: "0" }], {}, ids)).toThrow()
    expect(salaryAllocationRemainder("0.01", { unallocatedAmount: "", segments: [{ id: "one", projectId: "A", amount: "0.02", days: "" }] })).toBeNull()
    expect(salaryAllocationRemainder("1", { unallocatedAmount: "", segments: [{ id: "one", projectId: "A", amount: "", days: "" }] })).toBeNull()
  })
  it("checks combined records before mapping invalid nested draft segments", () => {
    expect(() => buildSalaryMonthlyApproval("request", "worker", months, { oct: { unallocatedAmount: "0", segments: Array(10000).fill(null) } }, ids)).toThrow("Monthly approval resource limit exceeded")
  })
})
