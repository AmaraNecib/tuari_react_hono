// @vitest-environment jsdom

import "@/i18n"

import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ProjectCreatePage } from "./project-create-page"

// Load-sensitive suite: Base UI's popup/dialog interactions plus the i18n
// transform exceed the 1s async default and the 5s test default under
// full-suite parallel load (see `.agents/wisdom/testing.md`).
configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

const { AppMutationError, mocks } = vi.hoisted(() => {
  // The mocked AppMutationError must be the exact class the page and the
  // manager-inline hook see, so their `instanceof` checks stay meaningful.
  class AppMutationError extends Error {
    code = "BUSINESS_RULE"
    fieldErrors: Array<{ field: string; message: string }> = []

    constructor(error: { message: string }) {
      super(error.message)
      this.name = "AppMutationError"
    }
  }

  return {
    AppMutationError,
    mocks: {
      createProjectMutate: vi.fn(),
      createEmployeesMutate: vi.fn(),
    },
  }
})

const mockNavigate = vi.fn()

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock("@/router/navigation", () => ({
  navigateToWorkspaceRoute: vi.fn(),
  workspaceRoutes: {
    projectDetails: (id: string) => `/projects/${id}`,
    projects: () => "/projects",
  },
}))

// The page and the manager-inline hook both import from this barrel, so the
// mocked AppMutationError is the exact class the hook's `instanceof` check
// sees. Tests build rejections with `new AppMutationError(...)` below.
vi.mock("@/features/app-shell/mock-dashboard", () => ({
  AppMutationError,
  useCreateProjectMutation: () => ({ isPending: false, mutateAsync: mocks.createProjectMutate }),
  useCreateEmployeesBatchMutation: () => ({ isPending: false, mutateAsync: mocks.createEmployeesMutate }),
}))

const managerOptions = [{ id: "mgr-1", label: "مدير حالي - 0550000000" }]

function renderCreatePage(projectManagerRoleId = "role-project-manager") {
  return render(
    <ProjectCreatePage managerOptions={managerOptions} projectManagerRoleId={projectManagerRoleId} />,
  )
}

function getManagerSelect() {
  // The status field is also a native <select> (role combobox); scope to the
  // manager field by its wrapping label.
  return screen.getByRole("combobox", { name: /المدير المسؤول/ })
}

/** Opens the select popup and picks the "create manager" item. */
async function openCreateManagerDialog() {
  fireEvent.mouseDown(getManagerSelect())
  const listbox = await screen.findByRole("listbox")
  const option = await within(listbox).findByRole("option", { name: /إضافة مدير مشروع/ })
  // Base UI only commits an item when the press started on the item itself;
  // Playwright fires the real sequence, jsdom needs it simulated.
  fireEvent.pointerDown(option, { button: 0, pointerId: 1, pointerType: "mouse" })
  fireEvent.click(option)
  return screen.findByRole("dialog")
}

function fillManagerFields(dialog: HTMLElement, { firstName = "سعيد", lastName = "بلقاسم", phone = "0661112233" } = {}) {
  fireEvent.change(within(dialog).getByPlaceholderText("اسم الموظف..."), { target: { value: firstName } })
  fireEvent.change(within(dialog).getByPlaceholderText("لقب الموظف..."), { target: { value: lastName } })
  fireEvent.change(within(dialog).getByPlaceholderText("0612345678"), { target: { value: phone } })
}

function submitManagerCreate(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole("button", { name: "إنشاء" }))
}

function setProjectField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

beforeEach(() => {
  mocks.createProjectMutate.mockReset()
  mocks.createEmployeesMutate.mockReset()
  mockNavigate.mockReset()
})

afterEach(() => {
  cleanup()
})

describe("ProjectCreatePage — inline manager creation", () => {
  it("ends with the new manager selected and keeps the rest of the form state", async () => {
    mocks.createEmployeesMutate.mockResolvedValue({
      createdCount: 1,
      employees: [{ id: "emp-new-1", firstName: "سعيد", lastName: "بلقاسم" }],
    })
    mocks.createProjectMutate.mockResolvedValue({ item: { id: "project-9" } })

    renderCreatePage()

    // Fill the rest of the form first — the create flow must not discard it.
    setProjectField("اسم المشروع", "مشروع تجريبي")
    setProjectField("الموقع", "الجزائر العاصمة")
    setProjectField("ملاحظات", "ملاحظة تبقى بعد الإنشاء")

    const dialog = await openCreateManagerDialog()
    fillManagerFields(dialog)
    submitManagerCreate(dialog)

    await waitFor(() => {
      expect(mocks.createEmployeesMutate).toHaveBeenCalledTimes(1)
    })

    // The inline create must send the real role id; the API rejects an empty
    // or non-system role, and a fabricated id cannot be selected.
    expect(mocks.createEmployeesMutate).toHaveBeenCalledWith({
      employees: [
        expect.objectContaining({
          firstName: "سعيد",
          lastName: "بلقاسم",
          phone: "0661112233",
          roleId: "role-project-manager",
          status: "ACTIVE",
        }),
      ],
    })

    // The dialog closed and the new manager is the selected value.
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
    expect(getManagerSelect().textContent).toContain("سعيد بلقاسم")

    // The rest of the form survived the inline create (no reload, same page).
    expect((screen.getByLabelText("اسم المشروع") as HTMLInputElement).value).toBe("مشروع تجريبي")
    expect((screen.getByLabelText("الموقع") as HTMLInputElement).value).toBe("الجزائر العاصمة")
    expect((screen.getByLabelText("ملاحظات") as HTMLTextAreaElement).value).toBe("ملاحظة تبقى بعد الإنشاء")

    // The submitted managerId is the REAL id the mutation returned, not a
    // placeholder like "new".
    fireEvent.click(screen.getByRole("button", { name: "حفظ المشروع" }))
    await waitFor(() => expect(mocks.createProjectMutate).toHaveBeenCalledTimes(1))
    expect(mocks.createProjectMutate).toHaveBeenCalledWith(
      expect.objectContaining({ managerId: "emp-new-1", name: "مشروع تجريبي" }),
    )
  })

  it("shows a localized error and keeps the dialog open when the create is rejected", async () => {
    // A wire-level rejection (English ORPC message) must not leak through.
    mocks.createEmployeesMutate.mockRejectedValue(new Error("Input validation failed"))

    renderCreatePage()

    const dialog = await openCreateManagerDialog()
    fillManagerFields(dialog, { phone: "0669998877" })
    submitManagerCreate(dialog)

    await waitFor(() => {
      expect(
        within(screen.getByRole("dialog")).getByText("تعذر إنشاء المدير الآن. تحقق من البيانات وحاول مرة أخرى."),
      ).toBeTruthy()
    })
    expect(mocks.createProjectMutate).not.toHaveBeenCalled()
  })

  it("passes a server AppMutationError message straight through", async () => {
    mocks.createEmployeesMutate.mockRejectedValue(new AppMutationError({ message: "رقم الهاتف مستخدم بالفعل." }))

    renderCreatePage()

    const dialog = await openCreateManagerDialog()
    fillManagerFields(dialog, { phone: "0669998877" })
    submitManagerCreate(dialog)

    await waitFor(() => {
      expect(within(screen.getByRole("dialog")).getByText("رقم الهاتف مستخدم بالفعل.")).toBeTruthy()
    })
  })

  it("fails localized when the create resolves without a row", async () => {
    mocks.createEmployeesMutate.mockResolvedValue({ createdCount: 0, employees: [] })

    renderCreatePage()

    const dialog = await openCreateManagerDialog()
    fillManagerFields(dialog, { phone: "0669998877" })
    submitManagerCreate(dialog)

    await waitFor(() => {
      expect(
        within(screen.getByRole("dialog")).getByText("تعذر إنشاء المدير الآن. تحقق من البيانات وحاول مرة أخرى."),
      ).toBeTruthy()
    })
  })

  it("hides the create option when the project_manager role is unavailable", async () => {
    renderCreatePage("")

    fireEvent.mouseDown(getManagerSelect())
    const listbox = await screen.findByRole("listbox")

    expect(within(listbox).queryByRole("option", { name: /إضافة مدير مشروع/ })).toBeNull()
  })
})
