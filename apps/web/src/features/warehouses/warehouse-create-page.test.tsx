// @vitest-environment jsdom

import "@/i18n"

import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WarehouseCreatePage } from "./warehouse-create-page"

const { AppMutationError, mocks } = vi.hoisted(() => {
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
      createWarehouseMutate: vi.fn(),
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
    warehouseDetails: (id: string) => `/warehouses/${id}`,
    warehouses: () => "/warehouses",
  },
}))

vi.mock("@/features/app-shell/mock-dashboard", () => ({
  AppMutationError,
  useCreateWarehouseMutation: () => ({ isPending: false, mutateAsync: mocks.createWarehouseMutate }),
  useCreateEmployeesBatchMutation: () => ({ isPending: false, mutateAsync: mocks.createEmployeesMutate }),
}))

// Load-sensitive: Base UI popup/dialog interactions exceed the jsdom defaults
// under full-suite parallel load (see `.agents/wisdom/testing.md`).
configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

function renderCreatePage(warehouseManagerRoleId = "role-warehouse-manager") {
  return render(
    <WarehouseCreatePage
      managerOptions={[{ id: "whm-1", label: "مسؤول حالي - 0550000000" }]}
      warehouseManagerRoleId={warehouseManagerRoleId}
    />,
  )
}

function getManagerSelect() {
  return screen.getByRole("combobox", { name: /المدير المسؤول/ })
}

async function openCreateManagerDialog() {
  fireEvent.mouseDown(getManagerSelect())
  const listbox = await screen.findByRole("listbox")
  const option = await within(listbox).findByRole("option", { name: /إضافة موظف/ })
  fireEvent.pointerDown(option, { button: 0, pointerId: 1, pointerType: "mouse" })
  fireEvent.click(option)
  return screen.findByRole("dialog")
}

function fillManagerFields(dialog: HTMLElement, { firstName = "نبيل", lastName = "مرابط", phone = "0661112233" } = {}) {
  fireEvent.change(within(dialog).getByPlaceholderText("اسم الموظف..."), { target: { value: firstName } })
  fireEvent.change(within(dialog).getByPlaceholderText("لقب الموظف..."), { target: { value: lastName } })
  fireEvent.change(within(dialog).getByPlaceholderText("0612345678"), { target: { value: phone } })
}

beforeEach(() => {
  mocks.createWarehouseMutate.mockReset()
  mocks.createEmployeesMutate.mockReset()
  mockNavigate.mockReset()
})

afterEach(() => {
  cleanup()
})

describe("WarehouseCreatePage — inline manager creation", () => {
  it("selects the real created employee with the warehouse_manager role and keeps the form", async () => {
    mocks.createEmployeesMutate.mockResolvedValue({
      createdCount: 1,
      employees: [{ id: "emp-whm-9", firstName: "نبيل", lastName: "مرابط" }],
    })
    mocks.createWarehouseMutate.mockResolvedValue({ item: { id: "wh-9" } })

    renderCreatePage()

    fireEvent.change(screen.getByLabelText("اسم المستودع"), { target: { value: "مستودع الجنوب" } })
    fireEvent.change(screen.getByLabelText("العنوان"), { target: { value: "الأغواط" } })
    fireEvent.change(screen.getByLabelText("ملاحظات"), { target: { value: "قيد التجهيز" } })

    const dialog = await openCreateManagerDialog()
    fillManagerFields(dialog)
    fireEvent.click(within(dialog).getByRole("button", { name: "إنشاء" }))

    await waitFor(() => expect(mocks.createEmployeesMutate).toHaveBeenCalledTimes(1))
    expect(mocks.createEmployeesMutate).toHaveBeenCalledWith({
      employees: [
        expect.objectContaining({
          firstName: "نبيل",
          lastName: "مرابط",
          phone: "0661112233",
          roleId: "role-warehouse-manager",
          status: "ACTIVE",
        }),
      ],
    })

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(getManagerSelect().textContent).toContain("نبيل مرابط")
    expect((screen.getByLabelText("اسم المستودع") as HTMLInputElement).value).toBe("مستودع الجنوب")
    expect((screen.getByLabelText("العنوان") as HTMLInputElement).value).toBe("الأغواط")
    expect((screen.getByLabelText("ملاحظات") as HTMLTextAreaElement).value).toBe("قيد التجهيز")

    // The submitted managerId is the REAL id the mutation returned, not a
    // placeholder like "new".
    fireEvent.click(screen.getByRole("button", { name: "حفظ المستودع" }))
    await waitFor(() => expect(mocks.createWarehouseMutate).toHaveBeenCalledTimes(1))
    expect(mocks.createWarehouseMutate).toHaveBeenCalledWith(
      expect.objectContaining({ managerId: "emp-whm-9", name: "مستودع الجنوب" }),
    )
  })

  it("shows a localized error and keeps the dialog open when the create is rejected", async () => {
    mocks.createEmployeesMutate.mockRejectedValue(new Error("Input validation failed"))

    renderCreatePage()

    const dialog = await openCreateManagerDialog()
    fillManagerFields(dialog, { phone: "0669998877" })
    fireEvent.click(within(dialog).getByRole("button", { name: "إنشاء" }))

    await waitFor(() => {
      expect(
        within(screen.getByRole("dialog")).getByText("تعذر إنشاء المدير الآن. تحقق من البيانات وحاول مرة أخرى."),
      ).toBeTruthy()
    })
  })

  it("hides the create option when the warehouse_manager role is unavailable", async () => {
    renderCreatePage("")

    fireEvent.mouseDown(getManagerSelect())
    const listbox = await screen.findByRole("listbox")

    expect(within(listbox).queryByRole("option", { name: /إضافة موظف/ })).toBeNull()
  })
})
