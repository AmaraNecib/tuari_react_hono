// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }))

vi.mock("@/features/app-shell/workspace-mutations", () => ({
  useCreateSalaryPaymentMutation: () => ({ mutateAsync, isPending: false, isSuccess: false, reset: vi.fn() }),
}))

import { SalariesSection } from "./salaries-section"

const PROJECT = { id: "project-1", name: "مشروع ألف" }

function worker(salaryAmountDzd: number) {
  return {
    employeeId: "worker-1",
    employeeName: "عامل الرواتب",
    employeePhone: "0555000001",
    employeeRole: "عامل",
    salaryAmountDzd,
    salaryPeriod: "MONTHLY" as const,
    lastPaymentDate: null,
    // An open-ended window far wider than any payment month: the derived
    // default always covers the dialog's period.
    projectAssignments: [{ projectId: PROJECT.id, startDate: "2000-01-01T00:00:00+01:00", endDate: null }],
  }
}

const PAYMENT = {
  id: "payment-1",
  employeeId: "worker-1",
  employeeName: "عامل الرواتب",
  employeePhone: "0555000001",
  employeeRole: "عامل",
  paymentDate: "2026-03-31T00:00:00.000Z",
  days: 30,
  expectedAmountDzd: 30000,
  actualAmountDzd: 30000,
  projectSplits: [
    { projectId: PROJECT.id, days: 15 },
    { projectId: "project-2", days: 15 },
  ],
  note: null,
}

function renderSection() {
  const view = render(
    <SalariesSection
      onEditSalary={vi.fn()}
      projects={[PROJECT, { id: "project-2", name: "مشروع باء" }]}
      recentPayments={[PAYMENT]}
      workers={[worker(30000)]}
    />,
  )

  return {
    view,
    // Simulate a workspace refresh that changes the worker's wage while the
    // payment dialog stays open.
    refreshWage: (salaryAmountDzd: number) =>
      view.rerender(
        <SalariesSection
          onEditSalary={vi.fn()}
          projects={[PROJECT, { id: "project-2", name: "مشروع باء" }]}
          recentPayments={[PAYMENT]}
          workers={[worker(salaryAmountDzd)]}
        />,
      ),
  }
}

describe("SalariesSection (#412)", () => {
  beforeEach(() => {
    mutateAsync.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("re-derives the open dialog's proposal from live query data after a wage refresh", () => {
    const { refreshWage } = renderSection()

    fireEvent.click(screen.getAllByRole("button", { name: "إضافة دفعة" })[0]!)

    // The dialog proposed salary / 30 x 30 days.
    expect(screen.getAllByDisplayValue("30000").length).toBeGreaterThan(0)

    // A workspace refresh changes the wage underneath the open dialog: the
    // proposal must follow rather than staying on the snapshotted value.
    refreshWage(60000)
    expect(screen.getAllByDisplayValue("60000").length).toBeGreaterThan(0)
    expect(screen.queryByDisplayValue("30000")).toBeNull()
  })

  it("shows each project's days and prorated amount in the payment history row", () => {
    renderSection()

    // The row is not enough on its own: the operator must see which projects
    // received the days and how the paid amount was shared.
    expect(screen.getByText("مشروع ألف")).toBeTruthy()
    expect(screen.getByText("مشروع باء")).toBeTruthy()
    expect(screen.getAllByText("15 يوم").length).toBe(2)
    expect(screen.getAllByText(/15,000/).length).toBe(2)
  })
})
