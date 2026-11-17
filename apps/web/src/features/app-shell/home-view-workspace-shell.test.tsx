// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { demoUser, mockAllMutations, renderWorkspace, setApplicationClientMock } from "./__test-utils__/workspace-fixtures"
import { i18n } from "@/i18n"
import * as workspaceQueries from "./workspace-queries"

const mocks = vi.hoisted(() => ({
  capabilities: vi.fn(async () => ({
    workspaceId: "11111111-1111-4111-8111-111111111111", employees: "exact", approvedEarnings: "available", projectLaborCost: "exact-ledger",
    cashPayments: "unavailable", advances: "unavailable", openings: "unavailable", corrections: "unavailable", invoices: "unavailable",
    inventoryMoney: "unavailable", expenses: "unavailable", monetaryReports: "unavailable", fullProjectCost: "unavailable",
  })),
  employeesList: vi.fn(async () => ({ items: [{ id: "exact-worker", firstName: "Exact", lastName: "Worker", phone: "0555000001", roleId: "worker-role", status: "ACTIVE", salaryReference: null, currency: "DZD", notes: null, occupation: null, createdAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" }] })),
  rolesList: vi.fn(async () => ({ items: [] })),
  projectsList: vi.fn(async () => ({ items: [{ id: "project-a", name: "Project A", location: null, managerId: null, status: "ACTIVE", notes: null, createdAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" }] })),
  warehousesList: vi.fn(async () => ({ items: [{ id: "warehouse-a", name: "Warehouse A", address: "Algiers", managerId: null, status: "ACTIVE", notes: "north site", createdAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" }] })),
  projectAssignmentsList: vi.fn(async () => ({ items: [{ id: "assignment-a", employeeId: "exact-worker", projectId: "project-a", status: "ACTIVE", startDate: "2026-11-01T00:00:00.000Z", endDate: null, notes: "crew", actorUserId: "user-1", transactionId: "transaction-1", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" }, { id: "assignment-b", employeeId: "exact-worker", projectId: "project-a", status: "ACTIVE", startDate: "2026-11-02T00:00:00.000Z", endDate: null, notes: "repeat assignment", actorUserId: "user-1", transactionId: "transaction-2", createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z" }] })),
  warehouseAssignmentsList: vi.fn(async () => ({ items: [{ id: "warehouse-assignment", employeeId: "exact-worker", warehouseId: "warehouse-a", status: "ACTIVE", startDate: "2026-11-01T00:00:00.000Z", endDate: null, notes: "team member", actorUserId: "user-1", transactionId: "transaction-3", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" }] })),
  warehouseManagerOwnershipHistoryList: vi.fn(async () => ({ items: [{ id: "warehouse-history", warehouseId: "warehouse-a", managerId: "manager-b", status: "ENDED", startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-10-31T00:00:00.000Z", notes: "manager change", actorUserId: "user-1", transactionId: "transaction-4", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-31T00:00:00.000Z" }] })),
  managerAssignmentsList: vi.fn(async () => ({ items: [] })),
  projectManagerOwnershipHistoryList: vi.fn(async () => ({ items: [{ id: "history-a", projectId: "project-a", managerId: "manager-a", status: "ENDED", startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-10-31T00:00:00.000Z", notes: "handoff", actorUserId: "user-1", transactionId: "transaction-2", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-31T00:00:00.000Z" }] })),
  projectsUpdate: vi.fn(async () => ({ success: true, item: {} })),
  warehousesUpdate: vi.fn(async () => ({ success: true, item: {} })),
  projectsCreate: vi.fn(async () => ({ success: true, item: { id: "project-new" } })),
  warehousesCreate: vi.fn(async () => ({ success: true, item: { id: "warehouse-new" } })),
  employeesCreate: vi.fn(async () => ({ success: true, item: {} })),
  projectsGet: vi.fn(),
  warehousesGet: vi.fn(),
  approveMonthlyEarnings: vi.fn(),
  listEmployeeEarnings: vi.fn(async () => []),
  getProjectSalaryCost: vi.fn(async () => ({ projectId: "unused", currency: "DZD", totalAmount: "0.00", segments: [] })),
}))

vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "demo-session-user" } } }) }))

beforeEach(() => {
  window.localStorage.setItem("journey-home-tour-status", "skipped")
  setApplicationClientMock({
  applicationCapabilities: mocks.capabilities,
  employeesList: mocks.employeesList,
  rolesList: mocks.rolesList,
  projectsList: mocks.projectsList,
  warehousesList: mocks.warehousesList,
  projectAssignmentsList: mocks.projectAssignmentsList,
  warehouseAssignmentsList: mocks.warehouseAssignmentsList,
  managerAssignmentsList: mocks.managerAssignmentsList,
  projectManagerOwnershipHistoryList: mocks.projectManagerOwnershipHistoryList,
  warehouseManagerOwnershipHistoryList: mocks.warehouseManagerOwnershipHistoryList,
  projectsUpdate: mocks.projectsUpdate,
  warehousesUpdate: mocks.warehousesUpdate,
  projectsCreate: mocks.projectsCreate,
  warehousesCreate: mocks.warehousesCreate,
  workforceExact: {
    approveMonthlyEarnings: mocks.approveMonthlyEarnings,
    listEmployeeEarnings: mocks.listEmployeeEarnings,
    getProjectSalaryCost: mocks.getProjectSalaryCost,
  },
  })
})
afterEach(() => { cleanup(); window.localStorage.clear(); setApplicationClientMock(null); vi.unstubAllGlobals() })

describe("normal HomeView normal application selector", () => {
  it("selects exact signed-in pages after authenticated capabilities without loading numeric workspace data", async () => {
    const workspaceQuery = vi.spyOn(workspaceQueries, "useCompositeWorkspaceQuery")
    renderWorkspace("salaries", { sessionUser: demoUser })
    await waitFor(() => expect(screen.getByRole("region", { name: "اعتماد الأجور الشهرية" })).toBeTruthy())
    expect(mocks.capabilities).toHaveBeenCalledTimes(1)
    expect(workspaceQuery).toHaveBeenCalledWith({ enabled: false })
    expect(mocks.employeesList).toHaveBeenCalledTimes(1)
    expect(mocks.projectsList).toHaveBeenCalledTimes(1)
    expect(mocks.listEmployeeEarnings).not.toHaveBeenCalled()
    expect(mocks.approveMonthlyEarnings).not.toHaveBeenCalled()
    expect(screen.getByText(i18n.t("salaryEarnings.cashUnavailable"))).toBeTruthy()
    expect(screen.getByRole("option", { name: "Exact Worker" })).toBeTruthy()
  })

  it("routes normal project details through the production worker page and supported history clients", async () => {
    renderWorkspace("project-details", { sessionUser: demoUser, projectId: "project-a", detailTab: "workers" })
    await screen.findByRole("heading", { name: "Project A" })
    expect(screen.getAllByText("Exact Worker")).toHaveLength(2)
    expect(screen.getByText("crew")).toBeTruthy()
    expect(mocks.projectAssignmentsList).toHaveBeenCalledWith({ projectId: "project-a" })
    expect(mocks.projectManagerOwnershipHistoryList).toHaveBeenCalledWith({ projectId: "project-a" })
    expect(mocks.getProjectSalaryCost).not.toHaveBeenCalled()
  })

  it("shows the actual active worker count on project overview", async () => {
    renderWorkspace("project-details", { sessionUser: demoUser, projectId: "project-a" })
    await screen.findByRole("heading", { name: "Project A" })
    expect(screen.getByText("1")).toBeTruthy()
  })

  it("routes normal warehouse detail to actual team and manager-history records", async () => {
    renderWorkspace("warehouse-details", { sessionUser: demoUser, warehouseId: "warehouse-a", detailTab: "team" })
    await screen.findByRole("heading", { name: "Warehouse A" })
    expect(screen.getByText("Exact Worker")).toBeTruthy()
    expect(screen.getByText("team member")).toBeTruthy()
    expect(mocks.warehouseAssignmentsList).toHaveBeenCalledWith({ warehouseId: "warehouse-a" })
    expect(mocks.warehouseManagerOwnershipHistoryList).toHaveBeenCalledWith({ warehouseId: "warehouse-a" })
  })

  it("shows the production project table from real list and deduplicated assignment IDs", async () => {
    renderWorkspace("projects", { sessionUser: demoUser })
    await screen.findByText("Project A")
    expect(screen.getByRole("button", { name: i18n.t("common.view") })).toBeTruthy()
    expect(mocks.projectAssignmentsList).toHaveBeenCalledWith({})
  })

  it("synchronously fences the real root sign-out action while approval is unresolved", async () => {
    vi.stubGlobal("navigator", { locks: { request: async (_name: string, _options: unknown, operation: () => Promise<unknown>) => operation() } })
    const mutations = mockAllMutations()
    let finish: ((value: never) => void) | undefined
    mocks.approveMonthlyEarnings.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    renderWorkspace("salaries", { sessionUser: demoUser })
    await screen.findByRole("option", { name: "Exact Worker" })
    fireEvent.change(screen.getByLabelText(i18n.t("salaryEarnings.employee")), { target: { value: "exact-worker" } })
    await screen.findByRole("form", { name: i18n.t("salaryMonthly.title") })
    fireEvent.change(screen.getByLabelText(i18n.t("salaryMonthly.amount", { index: 1 })), { target: { value: "100" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("salaryAllocations.useRemainder", { index: 1 }) }))
    fireEvent.submit(screen.getByRole("form", { name: i18n.t("salaryMonthly.title") }))
    await waitFor(() => expect(mocks.approveMonthlyEarnings).toHaveBeenCalledTimes(1))
    expect(window.localStorage.getItem("tuari:slice543:monthly-approval:v1:11111111-1111-4111-8111-111111111111:demo-session-user")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: i18n.t("shell.signOut") }))
    expect(screen.getByRole("button", { name: i18n.t("common.confirm") }).hasAttribute("disabled")).toBe(true)
    expect(mutations.signOutMutate).not.toHaveBeenCalled()
    void finish
  })
})
