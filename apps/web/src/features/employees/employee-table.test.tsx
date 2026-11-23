// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ i18n: { dir: () => "rtl" }, t: (key: string) => key }),
}))

import { EmployeeTable, type EmployeeTableRow } from "./employee-table"

const copy = {
  name: "name", role: "role", manager: "manager", project: "project", phone: "phone",
  status: "status", actions: "actions", empty: "empty", addWorker: "addWorker",
  view: "view", edit: "edit", leave: "leave", delete: "delete",
}

const row: EmployeeTableRow = {
  canDelete: false, canLeave: false, createdAt: "2026-03-01T10:00:00.000Z",
  currentManagerId: null, currentProjectAssignmentId: null, currentProjectId: null,
  currentWarehouseAssignmentId: null, currentWarehouseId: null, currentWorkplace: "بدون مشروع نشط",
  deleteDisabledReason: null, firstName: "عامل", id: "worker-1", isWorker: true,
  lastName: "الرواتب", leaveDisabledReason: null, managerAssignmentId: null, managerName: "",
  name: "عامل الرواتب", notes: null, occupation: null, phone: "0555000001", role: "عامل",
  roleId: "role-worker", roleKey: "worker", salaryReference: { period: "MONTHLY", amount: "30000.00" },
  status: "ACTIVE", updatedAt: "2026-03-01T10:00:00.000Z",
}

function renderTable(employee: EmployeeTableRow, onApproveEarning = vi.fn()) {
  return render(
    <EmployeeTable
      copy={copy}
      rows={[employee]}
      onApproveEarning={onApproveEarning}
      onDelete={vi.fn()}
      onEdit={vi.fn()}
      onLeave={vi.fn()}
      onView={vi.fn()}
    />,
  )
}

describe("EmployeeTable earned-wage approval entry point", () => {
  afterEach(cleanup)

  it("routes an active worker to the approval page without opening a modal", () => {
    const onApproveEarning = vi.fn()
    renderTable(row, onApproveEarning)

    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))

    expect(onApproveEarning).toHaveBeenCalledWith(row)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("offers approval to an active manager consistently with the salary list and approval page", () => {
    const onApproveEarning = vi.fn()
    const manager = { ...row, isWorker: false, roleKey: "project_manager", role: "مدير مشروع" }
    renderTable(manager, onApproveEarning)

    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    expect(onApproveEarning).toHaveBeenCalledWith(manager)
  })

  it("does not offer approval to inactive employees", () => {
    renderTable({ ...row, status: "INACTIVE" })

    expect(screen.queryByRole("button", { name: "earnings.approve" })).toBeNull()
  })
})
