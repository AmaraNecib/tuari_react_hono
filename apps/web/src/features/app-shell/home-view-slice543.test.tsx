// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { demoUser, mockAllMutations, renderWorkspace, setSlice543ClientMock } from "./__test-utils__/workspace-fixtures"
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
  warehousesList: vi.fn(async () => ({ items: [] })),
  projectAssignmentsList: vi.fn(async () => ({ items: [] })),
  warehouseAssignmentsList: vi.fn(async () => ({ items: [] })),
  approveMonthlyEarnings: vi.fn(),
  listEmployeeEarnings: vi.fn(async () => []),
  getProjectSalaryCost: vi.fn(async () => ({ projectId: "unused", currency: "DZD", totalAmount: "0.00", segments: [] })),
}))

vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "demo-session-user" } } }) }))

beforeEach(() => {
  window.localStorage.setItem("journey-home-tour-status", "skipped")
  setSlice543ClientMock({
  slice543Capabilities: mocks.capabilities,
  employeesList: mocks.employeesList,
  rolesList: mocks.rolesList,
  projectsList: mocks.projectsList,
  warehousesList: mocks.warehousesList,
  projectAssignmentsList: mocks.projectAssignmentsList,
  warehouseAssignmentsList: mocks.warehouseAssignmentsList,
  workforceExact: {
    approveMonthlyEarnings: mocks.approveMonthlyEarnings,
    listEmployeeEarnings: mocks.listEmployeeEarnings,
    getProjectSalaryCost: mocks.getProjectSalaryCost,
  },
  })
})
afterEach(() => { cleanup(); window.localStorage.clear(); setSlice543ClientMock(null) })

describe("normal HomeView Slice 543 selector", () => {
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
    expect(screen.getByRole("note").textContent).toContain("تسجيل الدفعات النقدية")
    expect(screen.getByRole("option", { name: "Exact Worker" })).toBeTruthy()
  })

  it("synchronously fences the real root sign-out action while approval is unresolved", async () => {
    const mutations = mockAllMutations()
    let finish: ((value: never) => void) | undefined
    mocks.approveMonthlyEarnings.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    renderWorkspace("salaries", { sessionUser: demoUser })
    await screen.findByLabelText(i18n.t("salaryEarnings.employee"))
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
