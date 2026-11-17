import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ExactEmployee, ApplicationCapabilities, ApplicationClient } from "@tuari/contracts"
import { i18n } from "@/i18n"
import { buildHomeViewCopy } from "./home-view-copy"
import { WorkspaceShell } from "./workspace-shell"

vi.mock("@tanstack/react-router", () => ({ useBlocker: vi.fn(() => ({ status: "idle", proceed: undefined, reset: undefined })), Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a> }))
vi.mock("@/router/navigation", () => ({ WorkspaceLink: ({ children, target }: { children: React.ReactNode; target: { to: string } }) => <a href={target.to}>{children}</a> }))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "signed-in-user" } } }) }))

afterEach(cleanup)
beforeEach(() => window.localStorage.clear())

const person: ExactEmployee = {
  id: "employee-exact-1", firstName: "Exact", lastName: "Worker", phone: "0555000001", roleId: "worker-role", status: "ACTIVE",
  salaryReference: null, currency: "DZD", notes: null, occupation: null, createdAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z",
}
const capabilities: ApplicationCapabilities = {
  workspaceId: "11111111-1111-4111-8111-111111111111", employees: "exact", approvedEarnings: "available", projectLaborCost: "exact-ledger",
  cashPayments: "unavailable", advances: "unavailable", openings: "unavailable", corrections: "unavailable", invoices: "unavailable",
  inventoryMoney: "unavailable", expenses: "unavailable", monetaryReports: "unavailable", fullProjectCost: "unavailable",
}

function mount(page: "salaries" | "employees" = "salaries", clientOverrides: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const client = {
    employeesList: vi.fn(async () => ({ items: [person] })),
    rolesList: vi.fn(async () => ({ items: [{ id: "worker-role", key: "worker", name: "Worker", description: null, isSystem: true, createdAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" }] })),
    projectsList: vi.fn(async () => ({ items: [{ id: "project-a", name: "Project A", location: null, managerId: null, status: "ACTIVE" as const, notes: null, createdAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" }] })),
    warehousesList: vi.fn(async () => ({ items: [] })),
    managerAssignmentsList: vi.fn(async () => ({ items: [] })),
    projectAssignmentsList: vi.fn(async () => ({ items: [] })),
    warehouseAssignmentsList: vi.fn(async () => ({ items: [] })),

    workforceExact: {
      approveMonthlyEarnings: vi.fn(async () => { throw new Error("not submitted") }),
      listEmployeeEarnings: vi.fn(async () => []),
      getProjectSalaryCost: vi.fn(async () => ({ projectId: "project-a", currency: "DZD" as const, totalAmount: "25000.00", segments: [] })),
    },
    ...clientOverrides,
  } as unknown as ApplicationClient
  render(<QueryClientProvider client={queryClient}><WorkspaceShell client={client} capabilities={capabilities} copy={buildHomeViewCopy(i18n.t)} page={page} session={{ id: "signed-in-user", name: "Operator", phone: "0555000002" } as never} theme="light" resetWorkspacePending={false} updateAccountPending={false} onResetWorkspace={vi.fn()} onSaveAccount={async () => undefined} onThemeToggle={vi.fn()} onUpdateApplied={vi.fn()} onPendingCommandChange={vi.fn()} /></QueryClientProvider>)
  return { client, queryClient }
}

describe("normal normal application application integration", () => {
  it("supplies authenticated active assignments and names to the original employee table", async () => {
    const managerRole = { id: "manager-role", key: "project_manager", name: "Project manager", description: null, isSystem: true, createdAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" }
    const manager: ExactEmployee = { ...person, id: "manager-a", firstName: "Samir", lastName: "Belaid", roleId: managerRole.id }
    const clientOverrides = {
      employeesList: vi.fn(async () => ({ items: [person, manager] })),
      employeesListPaged: vi.fn(async () => ({ items: [person], total: 1, nextCursor: null, hasMore: false })),
      rolesList: vi.fn(async () => ({ items: [
        { id: "worker-role", key: "worker", name: "Worker", description: null, isSystem: true, createdAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" },
        managerRole,
      ] })),
      projectsList: vi.fn(async () => ({ items: [{ id: "project-a", name: "North site", location: null, managerId: manager.id, status: "ACTIVE" as const, notes: null, createdAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" }] })),
      managerAssignmentsList: vi.fn(async () => ({ items: [{ id: "manager-assignment-a", workerId: person.id, managerId: manager.id, status: "ACTIVE" as const, startDate: "2026-11-01T00:00:00.000Z", endDate: null, notes: null, actorUserId: null, transactionId: null, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" }] })),
      projectAssignmentsList: vi.fn(async () => ({ items: [{ id: "project-assignment-a", employeeId: person.id, projectId: "project-a", status: "ACTIVE" as const, startDate: "2026-11-02T00:00:00.000Z", endDate: null, notes: null, actorUserId: null, transactionId: null, createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z" }] })),
    }
    const { client } = mount("employees", clientOverrides)
    const row = await screen.findByRole("row", { name: /Exact Worker/ })
    expect(within(row).getByText("Samir Belaid")).toBeTruthy()
    expect(within(row).getByText("North site")).toBeTruthy()
    expect(client.managerAssignmentsList).toHaveBeenCalledWith({ status: "ACTIVE" })
    expect(client.projectAssignmentsList).toHaveBeenCalledWith({ status: "ACTIVE" })
    expect(client.warehouseAssignmentsList).toHaveBeenCalledWith({ status: "ACTIVE" })
  })

  it("does not render placeholder assignments when an authenticated assignment read fails", async () => {
    const { client } = mount("employees", { managerAssignmentsList: vi.fn(async () => { throw new Error("Assignments unavailable") }) })
    expect((await screen.findByRole("alert")).textContent).toContain(i18n.t("shell.loadWorkspaceError"))
    expect(screen.queryByText("Exact Worker")).toBeNull()
    expect(client.projectAssignmentsList).toHaveBeenCalledWith({ status: "ACTIVE" })
  })

  it("loads exact employee and project IDs through the typed client, then reads approved earning and labor cost", async () => {
    const { client } = mount()
    await waitFor(() => expect(client.employeesList).toHaveBeenCalledTimes(1))
    expect(client.projectsList).toHaveBeenCalledTimes(1)
    expect(client.workforceExact.listEmployeeEarnings).not.toHaveBeenCalled()
    fireEvent.change(await screen.findByLabelText(i18n.t("salaryEarnings.employee")), { target: { value: person.id } })
    await waitFor(() => expect(client.workforceExact.listEmployeeEarnings).toHaveBeenCalledWith({ employeeId: person.id }))
    fireEvent.change(await screen.findByLabelText(i18n.t("salaryEarnings.project")), { target: { value: "project-a" } })
    await waitFor(() => expect(client.workforceExact.getProjectSalaryCost).toHaveBeenCalledWith({ projectId: "project-a" }))
    expect(client).not.toHaveProperty("workspaceSnapshot")
    expect(client).not.toHaveProperty("salaryPaymentsList")
  })
})
