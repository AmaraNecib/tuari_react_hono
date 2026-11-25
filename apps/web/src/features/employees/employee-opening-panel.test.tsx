// @vitest-environment jsdom
import "@/i18n"
import { act, fireEvent, render as baseRender, screen, waitFor, cleanup } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PayrollOpeningOutput } from "@tuari/contracts"
import { ORPCError } from "@orpc/client"
const mocks = vi.hoisted(() => ({
  review: vi.fn(), correct: vi.fn(), reconcile: vi.fn(), cancel: vi.fn(), refetch: vi.fn(),
  opening: { employeeId: "employee-1", review: "REVIEWED", wages: "2000.00", advances: "0.00", sources: [{ kind: "WAGE", sourceId: "source-1", amount: "2000.00", currentAmount: "2000.00", remaining: "2000.00", debtAccountId: "account-1", debtEntryId: "entry-1" }], reviewAudit: { wages: "2000.00", advances: "0.00", actorUserId: "original-user", actorLabel: "Original owner", transactionId: "original-txn", createdAt: "2026-11-01T00:00:00.000Z" }, history: [], proposals: [], refunds: [] } as PayrollOpeningOutput,
}))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "user-1" } } }) }))
vi.mock("./employee-earnings-queries", () => ({
  useEmployeeOpeningQuery: () => ({ data: mocks.opening, isPending: false, isError: false, refetch: mocks.refetch }),
  useReviewEmployeeOpeningMutation: () => ({ mutateAsync: mocks.review, isPending: false }),
  useCorrectEmployeeOpeningMutation: () => ({ mutateAsync: mocks.correct, isPending: false }),
  useReconcileEmployeeOpeningMutation: () => ({ mutateAsync: mocks.reconcile, isPending: false }),
  useCancelEmployeeOpeningProposalMutation: () => ({ mutateAsync: mocks.cancel, isPending: false }),
}))
import { EmployeeOpeningPanel } from "./employee-opening-panel"
afterEach(() => { cleanup(); localStorage.clear() })
beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: (_name: string, callback: () => Promise<unknown>) => callback() } })
})
function render(element: Parameters<typeof baseRender>[0]) {
  const view = baseRender(element)
  const disclosure = view.container.querySelector(".employee-opening-editor")
  if (disclosure && !disclosure.hasAttribute("open")) fireEvent.click(disclosure.querySelector("summary")!)
  return view
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
function prepareCorrection() {
  fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المصحح" }), { target: { value: "1900" } })
  fireEvent.change(screen.getByRole("textbox", { name: "سبب التصحيح" }), { target: { value: "Verified document" } })
  fireEvent.click(screen.getByRole("button", { name: "مراجعة التصحيح" }))
  fireEvent.click(screen.getByRole("button", { name: "تأكيد حفظ التصحيح" }))
}

describe("opening correction confirmation", () => {
  it("names the repeatable correction action separately from its confirmation", () => {
    const view = baseRender(<EmployeeOpeningPanel employeeId="employee-1" />)
    const editor = view.container.querySelector<HTMLDetailsElement>(".employee-opening-editor")!
    const action = screen.getByText("تصحيح الرصيد السابق", { exact: true })
    expect(editor.open).toBe(false)
    fireEvent.click(action)
    expect(editor.open).toBe(true)
    expect(screen.getByRole("button", { name: "مراجعة التصحيح" })).toBeTruthy()
    fireEvent.click(action)
    fireEvent.click(action)
    expect(editor.open).toBe(true)
  })
  it.each(["missing", "replacement", "corrupt"])("reconciles %s durable state after successful dispatch loses ownership", async state => {
    const response = deferred()
    mocks.correct.mockImplementationOnce(() => response.promise)
    render(<EmployeeOpeningPanel employeeId="employee-1" />)
    prepareCorrection()
    await waitFor(() => expect(mocks.correct).toHaveBeenCalledTimes(1))
    const key = localStorage.key(0)!
    const replacement = JSON.parse(localStorage.getItem(key)!)
    replacement.payload.requestId = crypto.randomUUID()
    if (state === "missing") localStorage.removeItem(key)
    else localStorage.setItem(key, state === "corrupt" ? "broken" : JSON.stringify(replacement))
    await act(async () => { response.resolve(); await response.promise })
    if (state === "missing") {
      await waitFor(() => expect((screen.getByRole("button", { name: "مراجعة التصحيح" }) as HTMLButtonElement).disabled).toBe(false))
      expect(screen.queryByRole("alert")).toBeNull()
    } else if (state === "replacement") {
      fireEvent.click(await screen.findByRole("button", { name: "إعادة إرسال الطلب نفسه" }))
      await waitFor(() => expect(mocks.correct).toHaveBeenCalledTimes(2))
      expect(mocks.correct.mock.calls[1]![0].requestId).toBe(replacement.payload.requestId)
    } else {
      expect(screen.getByRole("alert")).toBeTruthy()
      expect((screen.getByRole("button", { name: "إعادة إرسال الطلب نفسه" }) as HTMLButtonElement).disabled).toBe(true)
      expect(localStorage.getItem(key)).toBe("broken")
    }
    expect(mocks.refetch).toHaveBeenCalled()
  })

  it.each(["missing", "replacement", "corrupt"])("reloads %s intent when a queued retry acquires its lock", async state => {
    mocks.correct.mockRejectedValueOnce(new Error("Response lost"))
    render(<EmployeeOpeningPanel employeeId="employee-1" />)
    prepareCorrection()
    await waitFor(() => expect(screen.getByRole("button", { name: "إعادة إرسال الطلب نفسه" })).toHaveProperty("disabled", false))
    const entered = deferred()
    const release = deferred()
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_name: string, callback: () => Promise<unknown>) => {
      entered.resolve(); await release.promise; return callback()
    } } })
    fireEvent.click(screen.getByRole("button", { name: "إعادة إرسال الطلب نفسه" }))
    await entered.promise
    const key = localStorage.key(0)!
    const replacement = JSON.parse(localStorage.getItem(key)!)
    replacement.payload.requestId = crypto.randomUUID()
    if (state === "missing") localStorage.removeItem(key)
    else localStorage.setItem(key, state === "corrupt" ? "broken" : JSON.stringify(replacement))
    await act(async () => { release.resolve(); await release.promise })
    expect(mocks.correct).toHaveBeenCalledTimes(1)
    if (state === "missing") {
      await waitFor(() => expect((screen.getByRole("button", { name: "مراجعة التصحيح" }) as HTMLButtonElement).disabled).toBe(false))
      expect(screen.queryByRole("alert")).toBeNull()
      expect(mocks.refetch).toHaveBeenCalledTimes(1)
    } else if (state === "replacement") {
      expect(JSON.parse(localStorage.getItem(key)!).payload.requestId).toBe(replacement.payload.requestId)
      mocks.correct.mockResolvedValueOnce(mocks.opening)
      await waitFor(() => expect(screen.getByRole("button", { name: "إعادة إرسال الطلب نفسه" })).toHaveProperty("disabled", false))
      fireEvent.click(screen.getByRole("button", { name: "إعادة إرسال الطلب نفسه" }))
      await waitFor(() => expect(mocks.correct).toHaveBeenCalledTimes(2))
      expect(mocks.correct.mock.calls[1]![0].requestId).toBe(replacement.payload.requestId)
    } else {
      expect((screen.getByRole("button", { name: "إعادة إرسال الطلب نفسه" }) as HTMLButtonElement).disabled).toBe(true)
      expect(localStorage.getItem(key)).toBe("broken")
    }
  })
  it("requires actual cash refund confirmation before applying a saved pending correction", async () => {
    const original = structuredClone(mocks.opening)
    try {
      mocks.opening.proposals = [{ id: "proposal-1", sourceId: "source-1", employeeId: "employee-1", kind: "WAGE", oldAmount: "2000.00", newAmount: "200.00", requiredRefund: "1300.00", reason: "Verified opening", actorUserId: "user-1", actorLabel: "Owner", transactionId: "txn-1", createdAt: "2026-11-01T00:00:00.000Z", status: "PENDING", resolution: null }]
      mocks.reconcile.mockResolvedValue(mocks.opening)
      render(<EmployeeOpeningPanel employeeId="employee-1" />)
      const prepare = screen.getByRole("button", { name: "مراجعة رد النقد وتطبيق التصحيح" }) as HTMLButtonElement
      expect(prepare.disabled).toBe(true)
      expect(mocks.reconcile).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole("checkbox", { name: "أؤكد أن النقد الموضح قد رُد فعلياً" }))
      await waitFor(() => expect(prepare.disabled).toBe(false))
      fireEvent.click(prepare)
      expect(mocks.reconcile).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole("button", { name: "تأكيد رد النقد وتطبيق التصحيح" }))
      await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledTimes(1))
      expect(mocks.reconcile.mock.calls[0]![0]).toMatchObject({ proposalId: "proposal-1", expectedAmount: "2000.00", refundAmount: "1300.00", confirmCashRefund: true })
    } finally { Object.assign(mocks.opening, original) }
  })
  it("keeps actual-cash confirmation scoped to each pending proposal", async () => {
    const original = structuredClone(mocks.opening)
    try {
      mocks.opening.proposals = ["WAGE", "ADVANCE"].map((kind, index) => ({ id: `proposal-${index}`, sourceId: `source-${index}`, employeeId: "employee-1", kind: kind as "WAGE" | "ADVANCE", oldAmount: "2000.00", newAmount: "200.00", requiredRefund: "1300.00", reason: "Verified opening", actorUserId: "user-1", actorLabel: "Owner", transactionId: `txn-${index}`, createdAt: "2026-11-01T00:00:00.000Z", status: "PENDING" as const, resolution: null }))
      render(<EmployeeOpeningPanel employeeId="employee-1" />)
      const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[]
      const prepareButtons = screen.getAllByRole("button", { name: "مراجعة رد النقد وتطبيق التصحيح" }) as HTMLButtonElement[]
      fireEvent.click(checkboxes[0]!)
      expect(checkboxes[0]!.checked).toBe(true)
      expect(checkboxes[1]!.checked).toBe(false)
      expect(prepareButtons[0]!.disabled).toBe(false)
      expect(prepareButtons[1]!.disabled).toBe(true)
      fireEvent.click(prepareButtons[1]!)
      expect(screen.queryByRole("button", { name: "تأكيد رد النقد وتطبيق التصحيح" })).toBeNull()
      expect(mocks.reconcile).not.toHaveBeenCalled()
      mocks.reconcile.mockResolvedValue(mocks.opening)
      fireEvent.click(prepareButtons[0]!)
      fireEvent.click(screen.getByRole("button", { name: "تأكيد رد النقد وتطبيق التصحيح" }))
      await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledTimes(1))
      const wagePayload = mocks.reconcile.mock.calls[0]![0]
      expect(wagePayload).toMatchObject({ proposalId: "proposal-0", confirmCashRefund: true, refundAmount: "1300.00" })
      await waitFor(() => expect(localStorage.length).toBe(0))
      await waitFor(() => expect((screen.getAllByRole("checkbox")[1] as HTMLInputElement).disabled).toBe(false))
      const freshCheckboxes = screen.getAllByRole("checkbox") as HTMLInputElement[]
      expect(freshCheckboxes.every(checkbox => !checkbox.checked)).toBe(true)
      expect((screen.getAllByRole("button", { name: "مراجعة رد النقد وتطبيق التصحيح" })[1] as HTMLButtonElement).disabled).toBe(true)
      fireEvent.click(freshCheckboxes[1]!)
      await waitFor(() => {
        expect(freshCheckboxes[0]!.checked).toBe(false)
        expect(freshCheckboxes[1]!.checked).toBe(true)
      })
      const wagePrepare = screen.getAllByRole("button", { name: "مراجعة رد النقد وتطبيق التصحيح" })[0] as HTMLButtonElement
      expect(wagePrepare.disabled).toBe(true)
      fireEvent.click(wagePrepare)
      expect(screen.queryByRole("button", { name: "تأكيد رد النقد وتطبيق التصحيح" })).toBeNull()
      expect(mocks.reconcile).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getAllByRole("button", { name: "مراجعة رد النقد وتطبيق التصحيح" })[1]!)
      fireEvent.click(screen.getByRole("button", { name: "تأكيد رد النقد وتطبيق التصحيح" }))
      await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledTimes(2))
      const advancePayload = mocks.reconcile.mock.calls[1]![0]
      expect(advancePayload).toMatchObject({ proposalId: "proposal-1", confirmCashRefund: true, refundAmount: "1300.00" })
      expect(wagePayload.requestId).not.toBe(advancePayload.requestId)
      await waitFor(() => expect(localStorage.length).toBe(0))
    } finally { Object.assign(mocks.opening, original) }
  })
  it("does not treat unknown as zero until an explicit review is confirmed", async () => {
    const original = structuredClone(mocks.opening)
    try {
      Object.assign(mocks.opening, { review: "UNREVIEWED", wages: null, advances: null, sources: [], reviewAudit: null })
      mocks.review.mockResolvedValue(mocks.opening)
      render(<EmployeeOpeningPanel employeeId="employee-1" />)
      expect(mocks.review).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole("button", { name: "مراجعة الرصيد السابق" }))
      expect(mocks.review).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole("button", { name: "تأكيد حفظ الرصيد السابق" }))
      await waitFor(() => expect(mocks.review).toHaveBeenCalledTimes(1))
      expect(mocks.review.mock.calls[0]![0]).toMatchObject({ wages: "0.00", advances: "0.00" })
    } finally { Object.assign(mocks.opening, original) }
  })
  it("allows changing a request only after the server confirms that attempt did not commit", async () => {
    mocks.correct.mockRejectedValueOnce(new ORPCError("CONFLICT", { data: { payrollOutcome: "NOT_COMMITTED" } }))
    render(<EmployeeOpeningPanel employeeId="employee-1" />)
    fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المصحح" }), { target: { value: "1900" } })
    fireEvent.change(screen.getByRole("textbox", { name: "سبب التصحيح" }), { target: { value: "راجعت المستند" } })
    fireEvent.click(screen.getByRole("button", { name: "مراجعة التصحيح" }))
    fireEvent.click(screen.getByRole("button", { name: "تأكيد حفظ التصحيح" }))
    fireEvent.click(await screen.findByRole("button", { name: "العودة للتعديل" }))
    await waitFor(() => expect(localStorage.length).toBe(0))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("textbox", { name: "المبلغ المصحح" }).hasAttribute("disabled")).toBe(false)
  })
  it("shows previous/new values and requires confirmation before saving the attributed decrease", async () => {
    mocks.correct.mockResolvedValue(mocks.opening)
    render(<EmployeeOpeningPanel employeeId="employee-1" />)
    fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المصحح" }), { target: { value: "1900" } })
    fireEvent.change(screen.getByRole("textbox", { name: "سبب التصحيح" }), { target: { value: "راجعت المستند الأصلي" } })
    fireEvent.click(screen.getByRole("button", { name: "مراجعة التصحيح" }))
    expect(mocks.correct).not.toHaveBeenCalled()
    expect(screen.getByText("2000.00")).toBeTruthy()
    expect(screen.getByText("1900.00")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "تأكيد حفظ التصحيح" }))
    await waitFor(() => expect(mocks.correct).toHaveBeenCalledTimes(1))
    expect(mocks.correct.mock.calls[0]![0]).toMatchObject({ employeeId: "employee-1", kind: "WAGE", expectedAmount: "2000.00", amount: "1900.00", reason: "راجعت المستند الأصلي" })
    await waitFor(() => expect(localStorage.length).toBe(0))
  })
  it("keeps uncertain saves frozen and retries the exact confirmed request after remount", async () => {
    mocks.correct.mockRejectedValueOnce(new Error("Response lost"))
    const view = render(<EmployeeOpeningPanel employeeId="employee-1" />)
    fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المصحح" }), { target: { value: "200" } })
    fireEvent.change(screen.getByRole("textbox", { name: "سبب التصحيح" }), { target: { value: "تحققت من الرصيد" } })
    fireEvent.click(screen.getByRole("button", { name: "مراجعة التصحيح" }))
    fireEvent.click(screen.getByRole("button", { name: "تأكيد حفظ التصحيح" }))
    await screen.findByRole("button", { name: "إعادة إرسال الطلب نفسه" })
    const original = mocks.correct.mock.calls[0]![0]
    view.unmount()
    mocks.correct.mockResolvedValue(mocks.opening)
    render(<EmployeeOpeningPanel employeeId="employee-1" />)
    fireEvent.click(await screen.findByRole("button", { name: "إعادة إرسال الطلب نفسه" }))
    await waitFor(() => expect(mocks.correct).toHaveBeenCalledTimes(2))
    expect(mocks.correct.mock.calls[1]![0]).toEqual(original)
    await waitFor(() => expect(localStorage.length).toBe(0))
  })
})
