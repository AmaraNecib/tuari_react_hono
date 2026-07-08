// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  mockAllMutations,
  mockState,
  renderWorkspace,
  resetAllMutations,
  setSignedInSession,
} from "./__test-utils__/workspace-fixtures"
import type { WorkspaceMocks } from "./__test-utils__/workspace-fixtures"

let mocks: WorkspaceMocks

beforeEach(() => {
  mocks = mockAllMutations()
  resetAllMutations(mocks)
  window.localStorage.clear()
  document.documentElement.className = ""
  document.documentElement.lang = "ar"
  document.documentElement.dir = "rtl"
})

afterEach(() => {
  cleanup()
})

describe("HomeView workspace shell", () => {
  it("boots on the Arabic RTL sign-in screen", () => {
    renderWorkspace()

    expect(document.documentElement.lang).toBe("ar")
    expect(document.documentElement.dir).toBe("rtl")
    expect(screen.getByLabelText("رقم الهاتف")).toBeTruthy()
    expect(screen.getByRole("button", { name: "دخول إلى مساحة العمل" })).toBeTruthy()
  })

  it("shows first-user bootstrap when there are no auth users yet", async () => {
    mockState.setupStatus = { hasUsers: false }
    mocks.bootstrapMutate.mockResolvedValue({ success: true })
    mocks.signInMutate.mockResolvedValue(undefined)

    renderWorkspace()

    fireEvent.change(screen.getByLabelText("الاسم الكامل"), {
      target: { value: "أحمد بن صالح" },
    })
    fireEvent.change(screen.getByLabelText("رقم الهاتف"), {
      target: { value: "0612345678" },
    })
    fireEvent.change(screen.getByLabelText("كلمة المرور"), {
      target: { value: "password123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب الأول" }))

    await waitFor(() => {
      expect(mocks.bootstrapMutate).toHaveBeenCalledWith({
        name: "أحمد بن صالح",
        phone: "0612345678",
        password: "password123",
      })
    })
  })

  it("keeps the auth shell loading until setup status is known", () => {
    mockState.setupStatus = undefined
    mockState.setupPending = true

    renderWorkspace()

    expect(screen.getByRole("status", { name: "loading auth" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "دخول إلى مساحة العمل" })).toBeNull()
  })

  it("shows a retry state when auth startup fails", () => {
    mockState.setupStatus = undefined
    mockState.setupError = new Error("Timed out while starting the local API.")

    renderWorkspace()

    expect(screen.getByRole("heading", { name: "تعذر تحميل شاشة الدخول" })).toBeTruthy()
    expect(
      screen.getByText(
        "تعذر الوصول إلى الخدمة المحلية. تحقق من اكتمال ملفات التطبيق ثم أعد المحاولة.",
      ),
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeTruthy()
  })

  it("shows the sign-in error message inside the form", async () => {
    mocks.signInMutate.mockRejectedValue(new Error("رقم الهاتف أو كلمة المرور غير صحيحة."))

    renderWorkspace()

    fireEvent.change(screen.getByLabelText("رقم الهاتف"), {
      target: { value: "0612345678" },
    })
    fireEvent.change(screen.getByLabelText("كلمة المرور"), {
      target: { value: "password123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "دخول إلى مساحة العمل" }))

    await waitFor(() => {
      expect(screen.getByText("رقم الهاتف أو كلمة المرور غير صحيحة.")).toBeTruthy()
    })
  })

  it("shows the bootstrap-specific fallback when first-user setup fails without a server message", async () => {
    mockState.setupStatus = { hasUsers: false }
    mocks.bootstrapMutate.mockRejectedValue({})

    renderWorkspace()

    fireEvent.change(screen.getByLabelText("الاسم الكامل"), {
      target: { value: "أحمد بن صالح" },
    })
    fireEvent.change(screen.getByLabelText("رقم الهاتف"), {
      target: { value: "0612345678" },
    })
    fireEvent.change(screen.getByLabelText("كلمة المرور"), {
      target: { value: "password123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب الأول" }))

    await waitFor(() => {
      expect(
        screen.getByText(
          "تعذر إكمال إعداد المستخدم الأول الآن. أعد المحاولة بعد التحقق من بيانات التهيئة.",
        ),
      ).toBeTruthy()
    })
  })

  it("shows a retry state when workspace data settles without payload", () => {
    setSignedInSession()
    mockState.workspaceData = undefined

    renderWorkspace("dashboard")

    expect(screen.getByText("تعذر تحميل بيانات مساحة العمل الآن.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))

    expect(mocks.workspaceRefetch).toHaveBeenCalledTimes(1)
  })

  it("shows dashboard as a separate page", () => {
    setSignedInSession()
    renderWorkspace("dashboard")

    expect(screen.getByRole("heading", { name: "لوحة التحكم" })).toBeTruthy()
    expect(screen.getByText("العمال النشطون")).toBeTruthy()
    expect(screen.queryByText("أنت هنا الآن")).toBeNull()
  })

  it("shows employees on their own page with clear action buttons", () => {
    setSignedInSession()
    renderWorkspace("employees")

    expect(screen.getByRole("heading", { name: "العاملون" })).toBeTruthy()
    expect(screen.getByText("علي بن حميد")).toBeTruthy()
    expect(screen.queryByText(/^المدير:/)).toBeNull()
    expect(screen.getAllByRole("button", { name: "عرض" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "تعديل" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "إنهاء" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "حذف" }).length).toBeGreaterThan(0)
  })

  it("opens a dedicated employee create page with batch submission", async () => {
    setSignedInSession()
    mocks.createEmployeesBatchMutate.mockResolvedValue({ createdCount: 2 })

    renderWorkspace("employees-create")

    expect(screen.getByRole("heading", { name: "صفحة إضافة العاملين" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "إضافة عامل آخر" }))
    fireEvent.change(screen.getAllByLabelText("الاسم الأول")[0]!, {
      target: { value: "سمير" },
    })
    fireEvent.change(screen.getAllByLabelText("اللقب")[0]!, {
      target: { value: "بوقرة" },
    })
    fireEvent.change(screen.getAllByLabelText("رقم الهاتف")[0]!, {
      target: { value: "0555123456" },
    })
    fireEvent.change(screen.getAllByLabelText("الدور")[0]!, {
      target: { value: "role-project-manager" },
    })
    fireEvent.change(screen.getAllByPlaceholderText("10000")[0]!, {
      target: { value: "95000" },
    })
    fireEvent.change(screen.getAllByLabelText("دورية الأجر")[0]!, {
      target: { value: "MONTHLY" },
    })

    fireEvent.change(screen.getAllByLabelText("الاسم الأول")[1]!, {
      target: { value: "نجيب" },
    })
    fireEvent.change(screen.getAllByLabelText("اللقب")[1]!, {
      target: { value: "قاسمي" },
    })
    fireEvent.change(screen.getAllByLabelText("رقم الهاتف")[1]!, {
      target: { value: "0666123456" },
    })
    fireEvent.change(screen.getAllByLabelText("الدور")[1]!, {
      target: { value: "role-worker" },
    })
    fireEvent.change(screen.getAllByLabelText("المدير المباشر")[1]!, {
      target: { value: "employee-manager-1" },
    })
    fireEvent.change(screen.getAllByPlaceholderText("10000")[1]!, {
      target: { value: "4500" },
    })
    fireEvent.change(screen.getAllByLabelText("دورية الأجر")[1]!, {
      target: { value: "DAILY" },
    })
    fireEvent.change(screen.getAllByLabelText("المشروع الحالي")[0]!, {
      target: { value: "project-1" },
    })

    fireEvent.click(screen.getByRole("button", { name: "حفظ جميع العمال" }))

    await waitFor(() => {
      expect(mocks.createEmployeesBatchMutate).toHaveBeenCalledWith({
        employees: [
          expect.objectContaining({
            firstName: "سمير",
            lastName: "بوقرة",
            phone: "0555123456",
            roleId: "role-project-manager",
            salaryAmountDzd: 95000,
            salaryPeriod: "MONTHLY",
          }),
          expect.objectContaining({
            firstName: "نجيب",
            lastName: "قاسمي",
            phone: "0666123456",
            roleId: "role-worker",
            salaryAmountDzd: 4500,
            salaryPeriod: "DAILY",
            managerId: "employee-manager-1",
            projectId: "project-1",
          }),
        ],
      })
    })
  })

  it("blocks employee batch submission when salary period is selected without an amount", async () => {
    setSignedInSession()
    renderWorkspace("employees-create")

    fireEvent.change(screen.getByLabelText("الاسم الأول"), {
      target: { value: "سمير" },
    })
    fireEvent.change(screen.getByLabelText("اللقب"), {
      target: { value: "بوقرة" },
    })
    fireEvent.change(screen.getByLabelText("رقم الهاتف"), {
      target: { value: "0555123456" },
    })
    fireEvent.change(screen.getByLabelText("دورية الأجر"), {
      target: { value: "MONTHLY" },
    })

    fireEvent.click(screen.getByRole("button", { name: "حفظ العامل" }))

    await waitFor(() => {
      expect(screen.getByText("أدخل قيمة الأجر عند اختيار دورية الأجر.")).toBeTruthy()
    })
    expect(mocks.createEmployeesBatchMutate).not.toHaveBeenCalled()
  })

  it("renders employee details as a dedicated page with tabs", async () => {
    setSignedInSession()
    renderWorkspace("employee-details", { employeeId: "employee-worker-1" })

    expect(await screen.findByText("المعلومات الشخصية")).toBeTruthy()
    expect(screen.getByText("سجل العمل")).toBeTruthy()
    expect(screen.getByRole("tab", { name: "المالية" })).toBeTruthy()
  })

  it("routes back to employees when a requested employee record is missing", () => {
    setSignedInSession()
    renderWorkspace("employee-details", { employeeId: "employee-missing" })

    fireEvent.click(screen.getByRole("button", { name: "العودة" }))

    expect(mocks.navigateMock).toHaveBeenCalledWith({
      to: "/employees",
    })
  })

  it("shows missing project and warehouse record fallbacks with return actions", () => {
    setSignedInSession()
    const { unmount } = renderWorkspace("project-details", { projectId: "project-missing" })

    expect(
      screen.getByText("تعذر العثور على هذا السجل أو لم يعد متاحًا ضمن البيانات الحالية."),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "العودة" }))

    expect(mocks.navigateMock).toHaveBeenCalledWith({ to: "/projects" })

    mocks.navigateMock.mockReset()
    unmount()

    renderWorkspace("warehouse-details", { warehouseId: "warehouse-missing" })

    expect(
      screen.getByText("تعذر العثور على هذا السجل أو لم يعد متاحًا ضمن البيانات الحالية."),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "العودة" }))

    expect(mocks.navigateMock).toHaveBeenCalledWith({ to: "/warehouses" })
  })

  it("shows no-notes fallback in the employee finance table when a salary payment note is missing", async () => {
    setSignedInSession()
    const noNotePayment = {
      id: "salary-payment-2",
      employeeId: "employee-worker-1",
      paymentDate: "2026-03-19T08:00:00.000Z",
      expectedAmountDzd: 4500,
      actualAmountDzd: 4500,
      periodType: "DAILY" as const,
      note: null,
      actorUserId: null,
      transactionId: null,
      createdAt: "2026-03-19T08:00:00.000Z",
      updatedAt: "2026-03-19T08:00:00.000Z",
    }

    const baseData = mockState.workspaceData!
    mockState.workspaceData = {
      ...baseData,
      salaryPayments: [noNotePayment],
    }

    renderWorkspace("employee-details", { detailTab: "finance", employeeId: "employee-worker-1" })

    expect(await screen.findByText("لا توجد ملاحظات.")).toBeTruthy()
  })

  it("submits salary payment form without client-controlled expected amount fields", async () => {
    setSignedInSession()
    renderWorkspace("employee-details", { detailTab: "finance", employeeId: "employee-worker-1" })

    fireEvent.click(await screen.findByRole("button", { name: "إضافة دفعة راتب" }))
    fireEvent.change(screen.getByPlaceholderText("0"), {
      target: { value: "5000" },
    })
    fireEvent.change(screen.getByLabelText("ملاحظات"), {
      target: { value: "دفعة مع زيادة" },
    })
    fireEvent.click(screen.getByRole("button", { name: "حفظ دفعة الراتب" }))

    expect(mocks.createSalaryPaymentMutate).toHaveBeenCalledWith({
      employeeId: "employee-worker-1",
      actualAmountDzd: 5000,
      paymentDate: expect.any(String),
      note: "دفعة مع زيادة",
    })
  })

  it("keeps salary payment save disabled when the paid amount is empty", async () => {
    setSignedInSession()
    renderWorkspace("employee-details", { detailTab: "finance", employeeId: "employee-worker-1" })

    fireEvent.click(await screen.findByRole("button", { name: "إضافة دفعة راتب" }))
    fireEvent.change(screen.getByPlaceholderText("0"), {
      target: { value: "" },
    })

    expect(screen.getByRole("button", { name: "حفظ دفعة الراتب" }).hasAttribute("disabled")).toBe(true)
  })

  it("renders project details as a dedicated page", async () => {
    setSignedInSession()
    renderWorkspace("project-details", { projectId: "project-1" })

    expect(await screen.findByRole("heading", { name: "مبنى الإدارة الجديد" })).toBeTruthy()
    expect(screen.getByText("العمال المرتبطون")).toBeTruthy()
  })

  it("opens a dedicated project create page and navigates to the new record", async () => {
    setSignedInSession()
    mocks.createProjectMutate.mockResolvedValue({ item: { id: "project-2" } })

    renderWorkspace("project-create")

    expect(await screen.findByRole("heading", { name: "إضافة مشروع" })).toBeTruthy()

    fireEvent.change(screen.getByLabelText("اسم المشروع"), {
      target: { value: "مشروع التوسعة" },
    })
    fireEvent.change(screen.getByLabelText("الموقع"), {
      target: { value: "وهران" },
    })
    fireEvent.change(screen.getByLabelText("المدير المسؤول"), {
      target: { value: "employee-manager-1" },
    })
    fireEvent.change(screen.getByLabelText("ملاحظات"), {
      target: { value: "مرحلة أولى" },
    })

    fireEvent.click(screen.getByRole("button", { name: "حفظ المشروع" }))

    await waitFor(() => {
      expect(mocks.createProjectMutate).toHaveBeenCalledWith({
        name: "مشروع التوسعة",
        location: "وهران",
        managerId: "employee-manager-1",
        status: "ACTIVE",
        notes: "مرحلة أولى",
      })
    })
    expect(mocks.navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId",
      params: { projectId: "project-2" },
    })
  })

  it("navigates project add actions to the dedicated create route", () => {
    setSignedInSession()
    renderWorkspace("projects")

    fireEvent.click(screen.getByRole("button", { name: "إضافة مشروع" }))

    expect(mocks.navigateMock).toHaveBeenCalledWith({ to: "/projects/create" })
  })

  it("opens a dedicated warehouse create page and navigates to the new record", async () => {
    setSignedInSession()
    mocks.createWarehouseMutate.mockResolvedValue({ item: { id: "warehouse-2" } })

    renderWorkspace("warehouse-create")

    expect(await screen.findByRole("heading", { name: "إضافة مستودع" })).toBeTruthy()

    fireEvent.change(screen.getByLabelText("اسم المستودع"), {
      target: { value: "مستودع الجنوب" },
    })
    fireEvent.change(screen.getByLabelText("العنوان"), {
      target: { value: "الأغواط" },
    })
    fireEvent.change(screen.getByLabelText("ملاحظات"), {
      target: { value: "قيد التجهيز" },
    })

    fireEvent.click(screen.getByRole("button", { name: "حفظ المستودع" }))

    await waitFor(() => {
      expect(mocks.createWarehouseMutate).toHaveBeenCalledWith({
        name: "مستودع الجنوب",
        address: "الأغواط",
        managerId: null,
        status: "ACTIVE",
        notes: "قيد التجهيز",
      })
    })
    expect(mocks.navigateMock).toHaveBeenCalledWith({
      to: "/warehouses/$warehouseId",
      params: { warehouseId: "warehouse-2" },
    })
  })

  it("navigates warehouse add actions to the dedicated create route", () => {
    setSignedInSession()
    renderWorkspace("warehouses")

    fireEvent.click(screen.getByRole("button", { name: "إضافة مستودع" }))

    expect(mocks.navigateMock).toHaveBeenCalledWith({ to: "/warehouses/create" })
  })

  it("renders the transactions page with grouped log rows", () => {
    setSignedInSession()
    renderWorkspace("transactions")

    expect(screen.getByRole("heading", { name: "سجل المعاملات" })).toBeTruthy()
    expect(
      screen.getByText("تم إسناد علي بن حميد إلى المشروع مبنى الإدارة الجديد"),
    ).toBeTruthy()
  })

  it("renders the salaries page with recent payments and worker shortcuts", () => {
    setSignedInSession()
    renderWorkspace("salaries")

    expect(screen.getByRole("heading", { name: "الرواتب" })).toBeTruthy()
    expect(screen.getAllByText("آخر دفعات الرواتب").length).toBeGreaterThan(0)
    expect(screen.getAllByText("علي بن حميد").length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "إضافة دفعة" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "تعديل الأجر" }).length).toBeGreaterThan(0)
  })

  it("navigates from salaries page to the worker edit page", () => {
    setSignedInSession()
    renderWorkspace("salaries")

    fireEvent.click(screen.getAllByRole("button", { name: "تعديل الأجر" })[0]!)

    expect(mocks.navigateMock).toHaveBeenCalledWith({
      to: "/employees/$employeeId/edit",
      params: { employeeId: "employee-worker-1" },
    })
  })

  it("renders account controls on the settings page", () => {
    setSignedInSession()
    renderWorkspace("settings")

    expect(screen.getAllByText("معلومات الحساب").length).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByText(
        "يلزم إدخال كلمة المرور الحالية عند تغيير رقم الهاتف لأنه يستخدم لتسجيل الدخول.",
      ),
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "حفظ بيانات الحساب" })).toBeTruthy()
  })

  it("submits account settings through the semantic form flow", async () => {
    setSignedInSession()
    mocks.updateAccountMutateAsync.mockResolvedValue({ success: true })

    renderWorkspace("settings")

    fireEvent.change(screen.getByDisplayValue("مدير التشغيل"), {
      target: { value: "مدير التشغيل الأول" },
    })

    fireEvent.submit(screen.getByRole("button", { name: "حفظ بيانات الحساب" }).closest("form")!)

    await waitFor(() => {
      expect(mocks.updateAccountMutateAsync).toHaveBeenCalledWith({
        currentPassword: undefined,
        name: "مدير التشغيل الأول",
        newPassword: undefined,
        phone: undefined,
      })
    })
  })

  it("shows the externals destination in the workspace sidebar", () => {
    setSignedInSession()
    renderWorkspace("dashboard")
    fireEvent.click(screen.getAllByRole("button", { name: "توسيع الشريط الجانبي" })[0]!)

    expect(screen.getByText("الجهات الخارجية")).toBeTruthy()
    expect(screen.getByText("الرواتب")).toBeTruthy()
  })

  it("shows worker manager and project controls on the employee edit page", async () => {
    setSignedInSession()
    renderWorkspace("employee-edit", { employeeId: "employee-worker-1" })

    expect(await screen.findByText("المدير المباشر")).toBeTruthy()
    expect(screen.getByText("المشروع الحالي")).toBeTruthy()
  })

  it("persists the sidebar collapsed state across route remounts", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1400,
    })

    setSignedInSession()
    const firstRender = renderWorkspace("dashboard")

    fireEvent.click(screen.getByRole("button", { name: "تصغير الشريط الجانبي" }))

    expect(window.localStorage.getItem("tuari.workspace.sidebar.collapsed")).toBe("true")

    firstRender.unmount()
    renderWorkspace("employees")

    expect(screen.getAllByRole("button", { name: "توسيع الشريط الجانبي" })[0]).toBeTruthy()
  })

  it("restores an expanded sidebar from storage instead of collapsing on desktop widths", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1400,
    })
    window.localStorage.setItem("tuari.workspace.sidebar.collapsed", "false")

    setSignedInSession()
    renderWorkspace("dashboard")

    expect(screen.getByRole("button", { name: "تصغير الشريط الجانبي" })).toBeTruthy()
  })

  it("auto-collapses below 1200px without persisting to localStorage", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1400,
      writable: true,
    })

    setSignedInSession()
    renderWorkspace("dashboard")

    expect(screen.getByRole("button", { name: "تصغير الشريط الجانبي" })).toBeTruthy()

    window.innerWidth = 1100
    fireEvent(window, new Event("resize"))

    expect(screen.getAllByRole("button", { name: "توسيع الشريط الجانبي" })[0]).toBeTruthy()
    expect(window.localStorage.getItem("tuari.workspace.sidebar.collapsed")).not.toBe("true")

    window.innerWidth = 1400
    fireEvent(window, new Event("resize"))

    expect(screen.getAllByRole("button", { name: "توسيع الشريط الجانبي" })[0]).toBeTruthy()
  })

  it("does not resubmit workplace links when worker placement stays unchanged", async () => {
    setSignedInSession()
    mocks.updateEmployeeMutate.mockResolvedValue({ success: true })
    mocks.updateEmployeeWorkplaceMutate.mockResolvedValue({ success: true })

    renderWorkspace("employee-edit", { employeeId: "employee-worker-1" })

    fireEvent.click(await screen.findByRole("button", { name: "حفظ كل التغييرات" }))

    await waitFor(() => {
      expect(mocks.updateEmployeeMutate).toHaveBeenCalled()
    })

    expect(mocks.updateEmployeeWorkplaceMutate).not.toHaveBeenCalled()
  })
})
