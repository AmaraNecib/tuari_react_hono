// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ComponentProps, ReactNode } from "react"

const { createSalaryPaymentMutate, mutationState, resetSalaryPaymentMutation } = vi.hoisted(() => {
  const state = { isSuccess: false }
  return {
    createSalaryPaymentMutate: vi.fn(),
    mutationState: state,
    resetSalaryPaymentMutation: vi.fn(() => {
      state.isSuccess = false
    }),
  }
})

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router")

  return {
    ...actual,
    Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
  }
})

vi.mock("@/features/app-shell/mock-dashboard", () => ({
  useCreateSalaryPaymentMutation: () => ({
    isPending: false,
    isSuccess: mutationState.isSuccess,
    mutate: createSalaryPaymentMutate,
    reset: resetSalaryPaymentMutation,
  }),
}))

vi.mock("@/features/app-shell/workspace-mutations", () => ({
  useCreateSalaryPaymentMutation: () => ({
    isPending: false,
    isSuccess: mutationState.isSuccess,
    mutate: createSalaryPaymentMutate,
    mutateAsync: vi.fn(),
    reset: resetSalaryPaymentMutation,
  }),
}))

// The picker speaks canonical `yyyy-MM-dd` in and out (#428); expose that contract so the
// quick form's canonical-date conversion is exercised without the popover.
vi.mock("@/components/ui/date-picker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/date-picker")>()
  return {
    ...actual,
    DatePicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
      <button
        type="button"
        data-testid="salary-date-picker"
        data-value={value}
        onClick={() => onChange("2026-03-15")}
      >
        pick
      </button>
    ),
  }
})

import { toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { ALGERIA_DAY, MIDNIGHT_CROSSING, UTC_DAY, pinUtcTimeZone } from "@/test-utils/algeria-day"

import { EmployeeDetailsPage } from "./employee-details-page"
import type { EmployeeTableRow } from "./employee-table"

type SalaryPaymentsProp = ComponentProps<typeof EmployeeDetailsPage>["salaryPayments"]

const PROJECT = { id: "project-1", name: "مشروع الرواتب" }
// An open-ended window far wider than any payment month: the derived default
// is always full coverage, whichever month the dialog defaults to.
const ASSIGNMENT = { projectId: PROJECT.id, startDate: "2000-01-01T00:00:00+01:00", endDate: null }

function monthlyWorker(overrides: Partial<EmployeeTableRow> = {}): EmployeeTableRow {
  return {
    canDelete: false,
    canLeave: false,
    createdAt: "2026-03-01T10:00:00.000Z",
    currentManagerId: null,
    currentProjectAssignmentId: null,
    currentProjectId: null,
    currentWarehouseAssignmentId: null,
    currentWarehouseId: null,
    currentWorkplace: "بدون مشروع نشط",
    deleteDisabledReason: null,
    firstName: "عامل",
    id: "worker-1",
    isWorker: true,
    lastName: "الرواتب",
    leaveDisabledReason: null,
    managerAssignmentId: null,
    managerName: "",
    name: "عامل الرواتب",
    notes: null,
    occupation: null,
    phone: "0555000001",
    role: "عامل",
    roleId: "role-worker",
    roleKey: "worker",
    salaryAmountDzd: 30000,
    salaryPeriod: "MONTHLY",
    status: "ACTIVE",
    updatedAt: "2026-03-01T10:00:00.000Z",
    ...overrides,
  }
}

function renderDetails(
  employee: EmployeeTableRow = monthlyWorker(),
  salaryPayments: SalaryPaymentsProp = [],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const renderPage = (nextEmployee: EmployeeTableRow) => (
    <QueryClientProvider client={queryClient}>
      <EmployeeDetailsPage
        activeTab="finance"
        debtAccounts={[]}
        debtEntriesByAccountId={{}}
        employee={nextEmployee}
        managedProjects={[]}
        managedWarehouses={[]}
        projects={[PROJECT]}
        projectAssignments={[ASSIGNMENT]}
        salaryPayments={salaryPayments}
        workHistory={[]}
        onTabChange={vi.fn()}
      />
    </QueryClientProvider>
  )
  const view = render(renderPage(employee))
  return {
    view,
    // Simulate a workspace refresh that changes the worker's wage while the
    // quick form stays open.
    rerenderEmployee: (nextEmployee: EmployeeTableRow) => view.rerender(renderPage(nextEmployee)),
  }
}

describe("EmployeeDetailsPage salary payments (#412)", () => {
  beforeEach(() => {
    createSalaryPaymentMutate.mockReset()
    resetSalaryPaymentMutation.mockClear()
    mutationState.isSuccess = false
  })

  afterEach(() => {
    cleanup()
  })

  it("gives the payment dialog the project list and assignment windows", () => {
    renderDetails()

    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة" }))

    // The dialog opened from the employee view can allocate: the project list
    // is present and the assignment window prefilled a full-period line.
    const projectSelect = screen.getByLabelText("المشروع") as HTMLSelectElement
    expect(projectSelect.value).toBe(PROJECT.id)
    expect(screen.getByText("أيام غير موزعة: 0")).toBeTruthy()
    const addProjectLine = screen.getByRole("button", { name: "إضافة مشروع" })
    expect(addProjectLine.hasAttribute("disabled")).toBe(false)
  })

  it("records the day count captured in the quick payment form", () => {
    renderDetails()

    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة راتب" }))
    const [daysInput] = screen.getAllByRole("spinbutton") as HTMLInputElement[]
    fireEvent.change(daysInput!, { target: { value: "15" } })

    // The expected amount follows the paid days rather than the full month.
    expect(screen.getAllByDisplayValue("15000").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: "حفظ دفعة الراتب" }))

    expect(createSalaryPaymentMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: "worker-1",
        days: 15,
        actualAmountDzd: 15000,
      }),
    )
  })

  it("disables the quick payment submit for a zero amount", () => {
    renderDetails()

    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة راتب" }))
    fireEvent.change(screen.getByLabelText(/المبلغ الفعلي/), { target: { value: "0" } })

    // The service rejects a non-positive amount; the form must not offer a
    // submit that can only fail server-side.
    const submit = screen.getByRole("button", { name: "حفظ دفعة الراتب" }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it("defaults a daily worker's quick form to one day, not a month", () => {
    renderDetails(monthlyWorker({ salaryPeriod: "DAILY", salaryAmountDzd: 1500 }))

    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة راتب" }))
    const [daysInput] = screen.getAllByRole("spinbutton") as HTMLInputElement[]

    expect(daysInput?.value).toBe("1")
    // One day's wage, not thirty.
    expect(screen.getAllByDisplayValue("1500").length).toBeGreaterThan(0)
  })

  it("re-applies the daily default when the wage period refreshes while the quick form is open", () => {
    const { rerenderEmployee } = renderDetails()

    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة راتب" }))
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("30")

    rerenderEmployee(monthlyWorker({ salaryPeriod: "DAILY", salaryAmountDzd: 1500 }))

    // The form must stay open, with the refreshed one-day default rather than
    // the stale 30-day month.
    expect(screen.getByRole("button", { name: "حفظ دفعة الراتب" })).toBeTruthy()
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("1")
    expect(screen.getAllByDisplayValue("1500").length).toBeGreaterThan(0)
  })

  it("keeps an edited day count when the wage period refreshes while the quick form is open", () => {
    const { rerenderEmployee } = renderDetails()

    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة راتب" }))
    fireEvent.change(screen.getAllByRole("spinbutton")[0]!, { target: { value: "12" } })

    rerenderEmployee(monthlyWorker({ salaryPeriod: "DAILY", salaryAmountDzd: 1500 }))

    // A refresh must not discard the edit (nor collapse the form under it).
    expect(screen.getByRole("button", { name: "حفظ دفعة الراتب" })).toBeTruthy()
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("12")
  })

  it("keeps a new draft when the form is reopened after a previous payment succeeded", () => {
    const { rerenderEmployee } = renderDetails()

    // A quick-form payment just succeeded; the mutation's success flag is still
    // set when the operator returns for the next one.
    mutationState.isSuccess = true

    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة راتب" }))
    // Reopening must clear the stale success flag.
    expect(resetSalaryPaymentMutation).toHaveBeenCalled()

    fireEvent.change(screen.getAllByRole("spinbutton")[0]!, { target: { value: "12" } })

    // A workspace refresh changes the wage while the new draft is open: the
    // old success effect must not run again, wipe the draft, or close the form.
    rerenderEmployee(monthlyWorker({ salaryPeriod: "DAILY", salaryAmountDzd: 1500 }))

    expect(screen.getByRole("button", { name: "حفظ دفعة الراتب" })).toBeTruthy()
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("12")
  })

  it("states that a quick payment is unallocated and offers the split dialog", async () => {
    renderDetails()

    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة راتب" }))

    // The quick form says the outcome explicitly instead of silently saving an
    // unallocated payment.
    expect(
      screen.getByText("تُحفظ هذه الدفعة دون نسبتها إلى أي مشروع، لذا لن تظهر في تكلفة المشاريع."),
    ).toBeTruthy()

    // And the operator who wants attribution is one click from the
    // split-capable dialog for the same employee.
    fireEvent.click(screen.getByRole("button", { name: "توزيع الأيام على المشاريع" }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("عامل الرواتب")).toBeTruthy()
    expect(within(dialog).getByText("توزيع الأيام على المشاريع")).toBeTruthy()
  })

  it("carries the quick draft into the split dialog and clears the quick form", async () => {
    const { view } = renderDetails()

    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة راتب" }))
    fireEvent.change(screen.getAllByRole("spinbutton")[0]!, { target: { value: "12" } })
    fireEvent.change(screen.getByLabelText(/المبلغ الفعلي/), { target: { value: "12345" } })
    expect(screen.getByDisplayValue("12")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "توزيع الأيام على المشاريع" }))
    const dialog = await screen.findByRole("dialog")

    // The dialog adopts the draft: the same days and amount the operator typed
    // are carried over instead of resetting to the monthly 30-day default.
    const dialogDays = within(dialog).getAllByRole("spinbutton")[0] as HTMLInputElement
    expect(dialogDays.value).toBe("12")
    expect(within(dialog).getByDisplayValue("12345")).toBeTruthy()

    // The quick form cleared its copy, so only one surface holds a live draft
    // for this payment.
    const quickFormDays = view.container.querySelector('input[type="number"]') as HTMLInputElement
    expect(quickFormDays.value).toBe("30")
    expect(
      screen.getByText("تم فتح نافذة توزيع الأيام على المشاريع؛ أكمل تسجيل هذه الدفعة من هناك."),
    ).toBeTruthy()
  })

  it("shows the recorded day count in the quick-payment history", () => {
    renderDetails(monthlyWorker(), [
      {
        id: "payment-1",
        paymentDate: "2026-03-31T00:00:00.000Z",
        days: 15,
        expectedAmountDzd: 15000,
        actualAmountDzd: 15000,
        periodType: "MONTHLY",
        note: null,
      },
    ])

    // The operator no longer has to leave the page to check how many days a
    // recorded payment covered.
    expect(screen.getByRole("columnheader", { name: "الأيام" })).toBeTruthy()
    expect(screen.getByText("15")).toBeTruthy()
  })

  it("submits the date picked in the quick payment form as the canonical day boundary", () => {
    renderDetails()

    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة راتب" }))

    // The picker returns `dd/MM/yyyy`; the form must convert it back so the
    // stored paymentDate is the picked day rather than a dropped/now value.
    fireEvent.click(screen.getByTestId("salary-date-picker"))
    fireEvent.click(screen.getByRole("button", { name: "حفظ دفعة الراتب" }))

    expect(createSalaryPaymentMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentDate: toAlgeriaDayBoundaryIso("2026-03-15", "start"),
      }),
    )
  })
})

describe("stored business day timezone (#473)", () => {
  let restoreTimeZone: () => void

  beforeEach(() => {
    restoreTimeZone = pinUtcTimeZone()
  })

  afterEach(() => {
    cleanup()
    restoreTimeZone()
  })

  it("runs under UTC so the assertions are not vacuous", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC")
    expect(ALGERIA_DAY).not.toBe(UTC_DAY)
  })

  it("renders the salary payment history date on its Algeria day, not the ambient UTC day", () => {
    renderDetails(monthlyWorker(), [
      {
        id: "payment-1",
        paymentDate: MIDNIGHT_CROSSING,
        days: 15,
        expectedAmountDzd: 15000,
        actualAmountDzd: 15000,
        periodType: "MONTHLY",
        note: null,
      },
    ])

    expect(screen.getByText(ALGERIA_DAY)).toBeTruthy()
    expect(screen.queryByText(UTC_DAY)).toBeNull()
  })
})