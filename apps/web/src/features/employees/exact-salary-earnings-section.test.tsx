import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { i18n } from "@/i18n"
import { ar } from "@/i18n/resources/ar"
import { ExactSalaryEarningsSection } from "./exact-salary-earnings-section"

const employees = [{ id: "real-worker", firstName: "Current", lastName: "Worker", phone: "0555000001", roleId: "worker-role", status: "ACTIVE" as const, salaryReference: null, currency: "DZD" as const, notes: null, occupation: null, createdAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" }]
let currentEmployees = employees
const state = vi.hoisted(() => ({ blocker: vi.fn(), pending: vi.fn() }))
vi.mock("@tanstack/react-router", () => ({ useBlocker: (options: unknown) => state.blocker(options) }))
vi.mock("@/router/navigation", () => ({ WorkspaceLink: ({ children, target }: { children: React.ReactNode; target: { to: string } }) => <a href={target.to}>{children}</a> }))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "actual-workspace-user" } } }) }))
vi.mock("@/features/app-shell/workspace-queries", () => ({
  useWorkspaceScopedQuery: ({ key, queryFn, enabled }: { key: (user: string) => readonly unknown[]; queryFn: () => Promise<unknown>; enabled: boolean }) => useQuery({ queryKey: key("actual-workspace-user"), queryFn, enabled, retry: false }),
}))
afterEach(cleanup)
beforeEach(() => { currentEmployees = employees; window.localStorage.clear(); state.blocker.mockClear(); state.pending.mockClear() })
const label = (key: string) => i18n.t(`salaryEarnings.${key}`)
function mount() {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const client = { approveMonthlyEarnings: vi.fn(() => new Promise<never>(() => {})), listEmployeeEarnings: vi.fn(async () => []), getProjectSalaryCost: vi.fn(async ({ projectId }: { projectId: string }) => ({ projectId, currency: "DZD" as const, totalAmount: "0.00", segments: [{ earningId: "earning-a", employeeId: "real-worker", periodStart: "2026-10-01", periodEnd: "2026-10-31", segment: { id: "segment-a", projectId, amount: "0.00" } }] })) }
  render(<QueryClientProvider client={query}><ExactSalaryEarningsSection projects={[{ id: "actual-project", name: "Current project" }, { id: "project-a", name: "Project A" }, { id: "project-b", name: "Project B" }]} employees={currentEmployees} workspaceId="11111111-1111-4111-8111-111111111111" userId="actual-workspace-user" workforceClient={client} onPendingCommandChange={state.pending} /></QueryClientProvider>)
  return { query, client }
}
async function chooseWorker() {
  fireEvent.change(screen.getByLabelText(label("employee")), { target: { value: "real-worker" } })
  await waitFor(() => expect(screen.getByRole("form", { name: i18n.t("salaryMonthly.title") })).toBeTruthy())
}
describe("real workspace salary earnings page", () => {
  it("uses actual employee identity even with no salary reference, starts blank, and reads actual project cost", async () => {
    const { query, client } = mount()
    expect(client.listEmployeeEarnings).not.toHaveBeenCalled()
    expect(screen.getByRole("option", { name: "Current Worker" })).toBeTruthy()
    await chooseWorker()
    expect(client.listEmployeeEarnings).toHaveBeenCalledWith({ employeeId: "real-worker" })
    expect((screen.getByLabelText(i18n.t("salaryMonthly.amount", { index: 1 })) as HTMLInputElement).value).toBe("")
    fireEvent.change(screen.getByLabelText(label("project")), { target: { value: "actual-project" } })
    await waitFor(() => expect(client.getProjectSalaryCost).toHaveBeenCalledWith({ projectId: "actual-project" }))
    expect(query.getQueryCache().getAll().some(row => JSON.stringify(row.queryKey) === JSON.stringify(["workspace", "11111111-1111-4111-8111-111111111111", "actual-workspace-user", "exact-workforce", "employee", "real-worker"]))).toBe(true)
  })
  it("renders actual exact project labor totals instead of a numeric fallback", async () => {
    const { client } = mount()
    client.getProjectSalaryCost.mockResolvedValue({ projectId: "actual-project", currency: "DZD", totalAmount: "25000.00", segments: [{
      earningId: "earning-a", employeeId: "real-worker", periodStart: "2026-10-01", periodEnd: "2026-10-31",
      segment: { id: "segment-a", projectId: "actual-project", amount: "25000.00" },
    }] })
    fireEvent.change(screen.getByLabelText(label("project")), { target: { value: "actual-project" } })
    await waitFor(() => expect(client.getProjectSalaryCost).toHaveBeenCalledWith({ projectId: "actual-project" }))
    await waitFor(() => expect(screen.getByText("25,000")).toBeTruthy())
  })

  it("queries and renders both real A/B project labor totals", async () => {
    const { client } = mount()
    client.getProjectSalaryCost
      .mockResolvedValueOnce({ projectId: "project-a", currency: "DZD", totalAmount: "25000.00", segments: [{ earningId: "earning-a", employeeId: "real-worker", periodStart: "2026-10-01", periodEnd: "2026-10-31", segment: { id: "seg-a", projectId: "project-a", amount: "25000.00" } }] })
      .mockResolvedValueOnce({ projectId: "project-b", currency: "DZD", totalAmount: "37500.00", segments: [{ earningId: "earning-b", employeeId: "real-worker", periodStart: "2026-10-01", periodEnd: "2026-10-31", segment: { id: "seg-b", projectId: "project-b", amount: "37500.00" } }] })
    const project = screen.getByLabelText(label("project"))
    fireEvent.change(project, { target: { value: "project-a" } })
    await waitFor(() => expect(screen.getByText("25,000")).toBeTruthy())
    fireEvent.change(project, { target: { value: "project-b" } })
    await waitFor(() => expect(screen.getByText("37,500")).toBeTruthy())
    expect(client.getProjectSalaryCost.mock.calls.map(call => call[0])).toEqual([{ projectId: "project-a" }, { projectId: "project-b" }])
  })

  it("uses independently translated workspace labels, empty states and project result copy", async () => {
    const original = { ...ar.translation.salaryEarnings }
    const translated = Object.fromEntries(Object.keys(original).map(key => [key, `sentinel-${key}`]))
    i18n.addResourceBundle("ar", "translation", { salaryEarnings: translated }, true, true)
    try {
      mount()
      expect(screen.getByRole("region", { name: "sentinel-title" })).toBeTruthy()
      fireEvent.change(screen.getByLabelText("sentinel-employee"), { target: { value: "real-worker" } })
      await waitFor(() => expect(screen.getByText("sentinel-empty")).toBeTruthy())
      fireEvent.change(screen.getByLabelText("sentinel-project"), { target: { value: "actual-project" } })
      await waitFor(() => expect(screen.getByText("sentinel-projectCost")).toBeTruthy())
      cleanup()
      currentEmployees = []
      mount()
      expect(screen.getByText("sentinel-noEmployees")).toBeTruthy()
      expect(screen.getByRole("link", { name: "sentinel-createEmployee" })).toBeTruthy()
    } finally { cleanup(); i18n.addResourceBundle("ar", "translation", { salaryEarnings: original }, true, true) }
  })

  it("offers actual employee creation when the workspace is empty instead of inventing sample workers", () => {
    currentEmployees = []
    const { client } = mount()
    expect(screen.getByRole("link", { name: label("createEmployee") }).getAttribute("href")).toBe("/employees/create")
    expect(client.listEmployeeEarnings).not.toHaveBeenCalled()
    expect(screen.queryByRole("form")).toBeNull()
  })
  it("fails closed on an unavailable exact read without showing a writable approval form", async () => {
    const { client } = mount()
    client.listEmployeeEarnings.mockRejectedValue(new Error("private missing activation detail"))
    fireEvent.change(screen.getByLabelText(label("employee")), { target: { value: "real-worker" } })
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(screen.queryByRole("form")).toBeNull()
    expect(screen.queryByText("private missing activation detail")).toBeNull()
    expect(client.approveMonthlyEarnings).not.toHaveBeenCalled()
  })
  it("blocks employee/navigation changes and keeps an uncertain intent mounted when background reads fail", async () => {
    const { query, client } = mount()
    client.approveMonthlyEarnings.mockRejectedValueOnce(new Error("response lost"))
    await chooseWorker()
    fireEvent.change(screen.getByLabelText(i18n.t("salaryMonthly.amount", { index: 1 })), { target: { value: "100" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("salaryAllocations.useRemainder", { index: 1 }) }))
    fireEvent.submit(screen.getByRole("form", { name: i18n.t("salaryMonthly.title") }))
    await waitFor(() => expect(screen.getByRole("button", { name: i18n.t("salaryAllocations.retrySame") })).toBeTruthy())
    expect((screen.getByLabelText(label("employee")) as HTMLSelectElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(label("employee")), { target: { value: "" } })
    expect((screen.getByLabelText(label("employee")) as HTMLSelectElement).value).toBe("real-worker")
    const blocked = state.blocker.mock.lastCall![0] as { shouldBlockFn: () => boolean; enableBeforeUnload: boolean }
    expect(blocked.shouldBlockFn()).toBe(true)
    expect(blocked.enableBeforeUnload).toBe(true)
    expect(state.pending).toHaveBeenLastCalledWith(true)
    client.listEmployeeEarnings.mockRejectedValue(new Error("read unavailable"))
    await query.invalidateQueries({ queryKey: ["workspace", "11111111-1111-4111-8111-111111111111", "actual-workspace-user", "exact-workforce"] })
    await waitFor(() => expect(screen.getByText(label("error")).closest('[role="alert"]')).toBeTruthy())
    expect(screen.getByRole("button", { name: i18n.t("salaryAllocations.retrySame") })).toBeTruthy()
    expect(client.approveMonthlyEarnings).toHaveBeenCalledTimes(1)
  })
})
