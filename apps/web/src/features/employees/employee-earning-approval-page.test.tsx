// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()
  return { ...actual, useTranslation: () => ({ t: (key: string) => key }) }
})
vi.mock("./employee-earning-approval-form", () => ({
  EmployeeEarningApprovalForm: ({ employeeId, salaryReference }: {
    employeeId: string | null
    salaryReference?: { period: string; amount: string } | null
  }) => <div data-testid="approval-form" data-employee-id={employeeId} data-salary-reference={JSON.stringify(salaryReference)} />,
}))

import { EmployeeEarningApprovalPage } from "./employee-earning-approval-page"
import type { EmployeeTableRow } from "./employee-table"

const employee = {
  id: "worker-1",
  name: "عامل الرواتب",
  isWorker: true,
  status: "ACTIVE",
  salaryReference: { period: "DAILY", amount: "2500.1250" },
} as unknown as EmployeeTableRow

const projects = [{ id: "project-1", name: "مشروع" }]
afterEach(cleanup)

describe("employee earned-wage approval page", () => {
  it("renders the approval form as a full page and preserves the employee's reference", () => {
    render(
      <EmployeeEarningApprovalPage
        employee={employee}
        projects={projects}
        returnTo="employee-finance"
        onCancel={vi.fn()}
        onComplete={vi.fn()}
      />,
    )

    expect(screen.getByRole("heading", { name: "earnings.title" })).toBeTruthy()
    expect(screen.getByTestId("approval-form").getAttribute("data-employee-id")).toBe("worker-1")
    expect(screen.getByTestId("approval-form").getAttribute("data-salary-reference")).toBe(
      JSON.stringify({ period: "DAILY", amount: "2500.1250" }),
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it.each([
    ["missing employee", null],
    ["non-worker", { ...employee, isWorker: false }],
    ["inactive worker", { ...employee, status: "INACTIVE" }],
  ])("shows an unavailable state for a %s", (_label, candidate) => {
    const onCancel = vi.fn()
    render(
      <EmployeeEarningApprovalPage
        employee={candidate as EmployeeTableRow | null}
        projects={projects}
        returnTo="salaries"
        onCancel={onCancel}
        onComplete={vi.fn()}
      />,
    )

    expect(screen.getByRole("status").textContent).toContain("earnings.employeeUnavailable")
    expect(screen.queryByTestId("approval-form")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "earnings.backToSalaries" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
