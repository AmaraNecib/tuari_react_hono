// @vitest-environment jsdom
import "@/i18n"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SalariesSection } from "./salaries-section"

const mocks = vi.hoisted(() => ({ history: vi.fn(), payroll: vi.fn() }))
vi.mock("@/features/employees/employee-earnings-history", () => ({
  EmployeeEarningsHistory: (props: unknown) => { mocks.history(props); return <div>approved-history</div> },
}))
vi.mock("@/features/employees/employee-payroll-panel", () => ({
  EmployeePayrollPanel: (props: unknown) => { mocks.payroll(props); return <div>exact-payroll</div> },
}))
const workers = [{
  employeeId: "worker-1", employeeName: "عامل الرواتب", employeePhone: "0555000001", employeeRole: "عامل",
  salaryReference: { period: "DAILY" as const, amount: "4500.1234" }, projectAssignments: [],
}]
const employees = [{ id: "worker-1", name: "عامل الرواتب" }, { id: "manager-1", name: "مدير المشروع" }]
const projects = [{ id: "project-1", name: "مشروع ألف" }]
afterEach(() => { cleanup(); vi.clearAllMocks() })

function setup(overrides: Partial<React.ComponentProps<typeof SalariesSection>> = {}) {
  return render(<SalariesSection workers={workers} employees={employees} projects={projects} onEditSalary={vi.fn()} {...overrides} />)
}

describe("metadata-backed salary section", () => {
  it("opens the actual earning history and payroll instead of retired numeric payments", () => {
    setup()
    expect(screen.getByText("approved-history")).toBeTruthy()
    expect(screen.getByText("exact-payroll")).toBeTruthy()
    expect(screen.queryByRole("tab", { name: "الدفعات الأخيرة" })).toBeNull()
    expect(mocks.history.mock.lastCall?.[0]).toMatchObject({
      employeeNames: { "worker-1": "عامل الرواتب", "manager-1": "مدير المشروع" },
      projectNames: { "project-1": "مشروع ألف" },
    })
    expect(mocks.payroll.mock.lastCall?.[0]).toEqual({ employeeId: "worker-1" })
  })

  it("maps saved recent URLs to history without inventing empty payment data", () => {
    setup({ routeSearch: { tab: "recent", page: 3, pageSize: 25 } })
    expect(screen.getByRole("tab", { name: "سجل الأجور المعتمدة" }).getAttribute("aria-selected")).toBe("true")
    expect(mocks.history.mock.lastCall?.[0].routePagination).toMatchObject({ page: 3, pageSize: 25 })
  })

  it("retains exact references and edit/approval actions on the workers tab", () => {
    const onEditSalary = vi.fn(), onAddPayment = vi.fn()
    setup({ onEditSalary, onAddPayment })
    fireEvent.click(screen.getByRole("tab", { name: "مراجع أجور العاملين" }))
    expect(screen.getByText("4,500.1234")).toBeTruthy()
    expect(screen.queryByRole("columnheader", { name: "آخر دفعة" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "اعتماد الأجر" }))
    fireEvent.click(screen.getByRole("button", { name: "تعديل الأجر" }))
    expect(onAddPayment).toHaveBeenCalledWith("worker-1", "عامل الرواتب")
    expect(onEditSalary).toHaveBeenCalledWith("worker-1")
  })

  it("changes the selected payroll employee using real metadata IDs", () => {
    setup({ workers: [...workers, { ...workers[0]!, employeeId: "worker-2", employeeName: "عامل ثان" }] })
    fireEvent.change(screen.getByLabelText("الموظف"), { target: { value: "worker-2" } })
    expect(mocks.payroll.mock.lastCall?.[0]).toEqual({ employeeId: "worker-2" })
  })

  it("still loads all employee earning history when no salary references exist", () => {
    setup({ workers: [] })
    expect(screen.getByText("approved-history")).toBeTruthy()
    expect(screen.queryByText("exact-payroll")).toBeNull()
  })

  it("preserves route-backed tab reset and pagination callbacks", () => {
    const onRouteSearchChange = vi.fn()
    setup({ routeSearch: { tab: "workers", page: 2, pageSize: 10 }, onRouteSearchChange })
    fireEvent.click(screen.getByRole("tab", { name: "سجل الأجور المعتمدة" }))
    expect(onRouteSearchChange).toHaveBeenCalledWith({ tab: "earnings", page: 1 })
  })
})
