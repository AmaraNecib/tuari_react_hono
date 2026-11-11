import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ORPCError } from "@orpc/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { exactSalaryMonthlyApprovalInputSchema, type ExactSalaryMonthlyApprovalInput, type ExactWorkforceClient } from "@tuari/contracts"
import { i18n } from "@/i18n"
import { ar } from "@/i18n/resources/ar"
import { ExactMonthlySalaryApprovalForm } from "./exact-monthly-salary-approval-form"

const projects = [{ id: "A", name: "Project A" }, { id: "B", name: "Project B" }]
const months = [{ id: "oct", month: "2026-10", amount: "12000.00" }, { id: "nov", month: "2026-11", amount: "18000.00" }]
afterEach(cleanup)
const label = (key: string, index = 1, segment = 1) => i18n.t(`salaryAllocations.${key}`, { index, segment })
function response(raw: ExactSalaryMonthlyApprovalInput) {
  const parsed = exactSalaryMonthlyApprovalInputSchema.parse(raw)
  return { currency: parsed.currency, totalAmount: parsed.totalAmount, months: parsed.months.map(row => ({ id: row.id, month: row.month, earning: { id: `earning-${row.id}`, employeeId: raw.employeeId, currency: raw.currency, periodStart: row.periodStart, periodEnd: row.periodEnd, approvedAmount: row.amount, unallocatedAmount: row.unallocatedAmount, segments: row.segments, debtAccountId: row.amount === "0.00" ? null : "account", debtEntryId: row.amount === "0.00" ? null : `original-${row.id}`, actorUserId: "operator", actorLabel: "Operator", transactionId: "audit", createdAt: "2026-11-11T00:00:00.000Z" } })) }
}
function mount(approve: ExactWorkforceClient["approveMonthlyEarnings"]) {
  render(<ExactMonthlySalaryApprovalForm employeeId="worker" defaultMonth="2026-10" initialMonths={months} projects={projects} client={{ approveMonthlyEarnings: approve }} />)
}
function unallocated(index = 1) { fireEvent.click(screen.getByRole("button", { name: label("useRemainder", index) })) }
function submit() { fireEvent.submit(screen.getByRole("form", { name: i18n.t("salaryMonthly.title") })) }

describe("opt-in allocation-capable monthly payroll form", () => {
  it("requires explicit allocations and preserves independent months with localized money, repeated projects and optional whole days", async () => {
    const approve = vi.fn(async (raw: ExactSalaryMonthlyApprovalInput) => response(raw))
    mount(approve)
    submit()
    expect(approve).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: label("add", 1) }))
    fireEvent.change(screen.getByLabelText(label("project", 1, 1)), { target: { value: "A" } })
    fireEvent.change(screen.getByLabelText(label("amount", 1, 1)), { target: { value: "١٠٠٠٠٫٠٠" } })
    fireEvent.change(screen.getByLabelText(label("days", 1, 1)), { target: { value: "5" } })
    fireEvent.click(screen.getByRole("button", { name: label("add", 1) }))
    fireEvent.change(screen.getByLabelText(label("project", 1, 2)), { target: { value: "A" } })
    fireEvent.change(screen.getByLabelText(label("amount", 1, 2)), { target: { value: "1000" } })
    unallocated(1)
    unallocated(2)
    submit()
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1))
    const raw = approve.mock.calls[0]![0]
    expect(raw).toMatchObject({ employeeId: "worker", currency: "DZD", months: [
      { id: "oct", month: "2026-10", amount: "12000.00", unallocatedAmount: "1000.00", segments: [{ projectId: "A", amount: "10000.00", days: 5 }, { projectId: "A", amount: "1000.00" }] },
      { id: "nov", month: "2026-11", amount: "18000.00", unallocatedAmount: "18000.00", segments: [] },
    ] })
    expect(raw.months[0]!.segments[1]).not.toHaveProperty("days")
    expect(raw).not.toHaveProperty("totalAmount")
    expect(raw.months[0]).not.toHaveProperty("periodStart")
    await waitFor(() => expect(screen.getByText(label("approved"))).toBeTruthy())
    expect(screen.getByRole("button", { name: label("add", 1) }).closest("fieldset")!.disabled).toBe(true)
    submit()
    expect(approve).toHaveBeenCalledTimes(1)
  })

  it("localizes allocation labels, statuses, recovery and success independently of prototype Arabic literals", async () => {
    const original = { ...ar.translation.salaryAllocations }
    const translated: Record<keyof typeof original, string> = {
      title: "alloc-title {{index}}", help: "alloc-help", add: "alloc-add {{index}}", project: "alloc-project {{index}} {{segment}}",
      selectProject: "alloc-select", amount: "alloc-amount {{index}} {{segment}}", days: "alloc-days {{index}} {{segment}}", remove: "alloc-remove {{index}} {{segment}}",
      unallocated: "alloc-unallocated {{index}}", useRemainder: "alloc-remainder {{index}}", invalid: "alloc-invalid", valid: "alloc-valid",
      retrySame: "alloc-retry", uncertain: "alloc-uncertain", approved: "alloc-approved", approvedHelp: "alloc-approved-help", noProjects: "alloc-no-projects",
    }
    i18n.addResourceBundle("ar", "translation", { salaryAllocations: translated }, true, true)
    const approve = vi.fn<(raw: ExactSalaryMonthlyApprovalInput) => Promise<ReturnType<typeof response>>>()
      .mockRejectedValueOnce(new Error("lost response"))
      .mockImplementationOnce(async raw => response(raw))
    try {
      const view = render(<ExactMonthlySalaryApprovalForm employeeId="worker" defaultMonth="2026-10" initialMonths={months} projects={[]} client={{ approveMonthlyEarnings: approve }} />)
      expect(screen.getAllByText("alloc-no-projects")).toHaveLength(2)
      view.rerender(<ExactMonthlySalaryApprovalForm employeeId="worker" defaultMonth="2026-10" initialMonths={months} projects={projects} client={{ approveMonthlyEarnings: approve }} />)
      expect(screen.getByText("alloc-title 1")).toBeTruthy()
      expect(screen.getAllByText("alloc-help")).toHaveLength(2)
      expect(screen.getAllByText("alloc-invalid")).toHaveLength(2)
      fireEvent.click(screen.getByRole("button", { name: "alloc-add 1" }))
      expect(screen.getByRole("option", { name: "alloc-select" })).toBeTruthy()
      expect(screen.getByLabelText("alloc-project 1 1")).toBeTruthy()
      expect(screen.getByLabelText("alloc-amount 1 1")).toBeTruthy()
      expect(screen.getByLabelText("alloc-days 1 1")).toBeTruthy()
      fireEvent.click(screen.getByRole("button", { name: "alloc-remove 1 1" }))
      expect(screen.getByLabelText("alloc-unallocated 1")).toBeTruthy()
      fireEvent.click(screen.getByRole("button", { name: "alloc-remainder 1" }))
      fireEvent.click(screen.getByRole("button", { name: "alloc-remainder 2" }))
      expect(screen.getAllByText("alloc-valid")).toHaveLength(2)
      submit()
      await waitFor(() => expect(screen.getByText("alloc-uncertain")).toBeTruthy())
      fireEvent.click(screen.getByRole("button", { name: "alloc-retry" }))
      await waitFor(() => expect(screen.getByRole("region", { name: "alloc-approved" })).toBeTruthy())
      expect(screen.getByText("alloc-approved-help")).toBeTruthy()
    } finally {
      cleanup()
      i18n.addResourceBundle("ar", "translation", { salaryAllocations: original }, true, true)
    }
  })

  it("keeps zero approval explicit and usable without projects", async () => {
    const approve = vi.fn(async (raw: ExactSalaryMonthlyApprovalInput) => response(raw))
    render(<ExactMonthlySalaryApprovalForm employeeId="worker" defaultMonth="2026-10" initialMonths={[{ id: "zero", month: "2026-10", amount: "0" }]} projects={[]} client={{ approveMonthlyEarnings: approve }} />)
    submit()
    expect(approve).not.toHaveBeenCalled()
    unallocated()
    submit()
    await waitFor(() => expect(screen.getByText(label("approved"))).toBeTruthy())
    expect(approve.mock.calls[0]![0].months).toEqual([{ id: "zero", month: "2026-10", amount: "0.00", unallocatedAmount: "0.00", segments: [] }])
  })

  it("does not automatically redistribute allocations when a monthly amount changes", async () => {
    const approve = vi.fn(async (raw: ExactSalaryMonthlyApprovalInput) => response(raw))
    mount(approve)
    unallocated(1); unallocated(2)
    fireEvent.change(screen.getByLabelText(i18n.t("salaryMonthly.amount", { index: 1 })), { target: { value: "10000" } })
    submit()
    expect(approve).not.toHaveBeenCalled()
    expect((screen.getByLabelText(label("unallocated", 1)) as HTMLInputElement).value).toBe("12000.00")
    unallocated(1)
    submit()
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1))
    expect(approve.mock.calls[0]![0].months.map(row => row.amount)).toEqual(["10000.00", "18000.00"])
  })

  it("keeps a malformed post-approval response uncertain and retries the same request instead of inventing a new intent", async () => {
    let committed: ReturnType<typeof response> | undefined
    let writes = 0
    let deliveries = 0
    const approve = vi.fn(async (raw: ExactSalaryMonthlyApprovalInput) => {
      // Simulated wire response damage after acceptance; native persistence is covered separately.
      if (!committed) { committed = response(raw); writes++ }
      return ++deliveries === 1 ? { ...committed, totalAmount: "invalid-wire-money" } : committed
    })
    mount(approve)
    unallocated(1); unallocated(2); submit()
    await waitFor(() => expect(screen.getByText(label("uncertain"))).toBeTruthy())
    expect(screen.queryByRole("region", { name: label("approved") })).toBeNull()
    await waitFor(() => expect(screen.getByRole("button", { name: label("retrySame") }).hasAttribute("disabled")).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: label("retrySame") }))
    await waitFor(() => expect(screen.getByRole("region", { name: label("approved") })).toBeTruthy())
    expect(approve).toHaveBeenCalledTimes(2)
    expect(approve.mock.calls[1]![0]).toEqual(approve.mock.calls[0]![0])
    expect(writes).toBe(1)
  })

  it("freezes an uncertain request and replays the identical intent/key instead of creating another approval", async () => {
    let finish: ((value: ReturnType<typeof response>) => void) | undefined
    const approve = vi.fn<(raw: ExactSalaryMonthlyApprovalInput) => Promise<ReturnType<typeof response>>>()
      .mockRejectedValueOnce(new Error("private connection diagnostic"))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    mount(approve)
    unallocated(1); unallocated(2); submit()
    await waitFor(() => expect(screen.getByText(label("uncertain"))).toBeTruthy())
    expect(screen.queryByText("private connection diagnostic")).toBeNull()
    expect(screen.getByRole("button", { name: label("add", 1) }).closest("fieldset")!.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(label("unallocated", 1)), { target: { value: "1" } })
    fireEvent.change(screen.getByLabelText(i18n.t("salaryMonthly.amount", { index: 1 })), { target: { value: "1" } })
    expect((screen.getByLabelText(label("unallocated", 1)) as HTMLInputElement).value).toBe("12000.00")
    expect((screen.getByLabelText(i18n.t("salaryMonthly.amount", { index: 1 })) as HTMLInputElement).value).toBe("12000.00")
    fireEvent.click(screen.getByRole("button", { name: label("retrySame") }))
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(2))
    submit()
    expect(approve).toHaveBeenCalledTimes(2)
    expect(approve.mock.calls[1]![0]).toEqual(approve.mock.calls[0]![0])
    finish!(response(approve.mock.calls[0]![0]))
    await waitFor(() => expect(screen.getByText(label("approved"))).toBeTruthy())
  })

  it("unlocks a definitively rejected first attempt but never unlocks an already uncertain request", async () => {
    const approve = vi.fn<(raw: ExactSalaryMonthlyApprovalInput) => Promise<ReturnType<typeof response>>>()
      .mockRejectedValueOnce(new ORPCError("BAD_REQUEST"))
      .mockRejectedValueOnce(new Error("response lost"))
      .mockRejectedValueOnce(new ORPCError("UNAUTHORIZED"))
    mount(approve)
    unallocated(1); unallocated(2); submit()
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(screen.getByRole("button", { name: label("add", 1) }).closest("fieldset")!.disabled).toBe(false)
    submit()
    await waitFor(() => expect(screen.getByText(label("uncertain"))).toBeTruthy())
    expect(approve.mock.calls[1]![0].requestId).not.toBe(approve.mock.calls[0]![0].requestId)
    fireEvent.click(screen.getByRole("button", { name: label("retrySame") }))
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.getByRole("button", { name: label("retrySame") }).hasAttribute("disabled")).toBe(false))
    expect(approve.mock.calls[2]![0]).toEqual(approve.mock.calls[1]![0])
    expect(screen.getByRole("button", { name: label("add", 1) }).closest("fieldset")!.disabled).toBe(true)
  })
})
