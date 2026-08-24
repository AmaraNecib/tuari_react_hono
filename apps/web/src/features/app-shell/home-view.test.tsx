// @vitest-environment jsdom

import { act, cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  demoUser,
  getInvoiceGroupQueryState,
  getSearchQueryState,
  makeInvoiceGroupDetail,
  makeWorkspaceData,
  mockAllMutations,
  renderWorkspace,
  resetAllMutations,
} from "./__test-utils__/workspace-fixtures"
import type { WorkspaceMocks } from "./__test-utils__/workspace-fixtures"
import { HomeView } from "./home-view"
import { AppPreferencesProvider } from "@/features/preferences/preferences"

// Spy on the splashscreen-readiness hook so the wiring seam between the
// shell and the Tauri reveal can be asserted without invoking IPC.
vi.mock("@/hooks/use-notify-app-ready", () => ({
  useNotifyAppReady: vi.fn(),
}))

import { useNotifyAppReady } from "@/hooks/use-notify-app-ready"

const useNotifyAppReadyMock = vi.mocked(useNotifyAppReady)

// Load-sensitive suite: page renders can exceed the default 1s async wait
// under full-suite parallel load (see issue #219). Raise the default for all
// findBy*/waitFor calls in this file. Sections are lazy-loaded (issue #286):
// the heavy employees chunk needs extra headroom under parallel load.
configure({ asyncUtilTimeout: 20000 })
// Sections are lazy-loaded (issue #286): the employees chunk in particular is
// heavy under full-suite parallel load, so give the suite a longer test
// timeout than the 5s vitest default.
vi.setConfig({ testTimeout: 30000 })

let mocks: WorkspaceMocks

beforeEach(() => {
  mocks = mockAllMutations()
  resetAllMutations(mocks)
  useNotifyAppReadyMock.mockClear()
  window.localStorage.clear()
  // The first-run tour auto-starts 500ms after the shell mounts (autoStart).
  // Now that the tour is a real modal (Base UI — issue #275) it marks the
  // rest of the page aria-hidden, which hides the form controls these tests
  // drive. Dismiss it like the E2E helper does (tests/e2e/helpers/session.ts).
  window.localStorage.setItem("journey-home-tour-status", "skipped")
  document.documentElement.className = ""
  document.documentElement.lang = "ar"
  document.documentElement.dir = "rtl"
})

afterEach(() => {
  cleanup()
  // Restore the viewport width overridden by mobile-drawer tests so it cannot
  // leak into later tests in this file (issue #284 test hygiene).
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
    writable: true,
  })
})

describe("HomeView workspace shell", () => {
  it("boots on the Arabic RTL sign-in screen", () => {
    renderWorkspace()

    expect(document.documentElement.lang).toBe("ar")
    expect(document.documentElement.dir).toBe("rtl")
    expect(screen.getByLabelText("رقم الهاتف")).toBeTruthy()
    expect(screen.getByRole("button", { name: "دخول إلى مساحة العمل" })).toBeTruthy()
  })

  it("signals app readiness once the initial auth state has settled", () => {
    // Fixture mocks resolve synchronously, so the auth state is ready on
    // the first render and the splashscreen reveal fires immediately.
    renderWorkspace()

    expect(useNotifyAppReadyMock).toHaveBeenCalledWith(true)
  })

  it("stays unready while the initial auth state is still loading", () => {
    renderWorkspace("dashboard", { setupStatus: undefined, setupPending: true })

    expect(useNotifyAppReadyMock).toHaveBeenCalledWith(false)
  })

  it("shows first-user bootstrap when there are no auth users yet", async () => {
    mocks.bootstrapMutate.mockResolvedValue({ success: true })
    mocks.signInMutate.mockResolvedValue(undefined)

    renderWorkspace("dashboard", { setupStatus: { hasUsers: false } })

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
    renderWorkspace("dashboard", { setupStatus: undefined, setupPending: true })

    expect(screen.getByRole("status", { name: "loading auth" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "دخول إلى مساحة العمل" })).toBeNull()
  })

  it("shows a retry state when auth startup fails", () => {
    renderWorkspace("dashboard", {
      setupStatus: undefined,
      setupError: new Error("Timed out while starting the local API."),
    })

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
    mocks.bootstrapMutate.mockRejectedValue({})

    renderWorkspace("dashboard", { setupStatus: { hasUsers: false } })

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
    renderWorkspace("dashboard", { sessionUser: demoUser, workspaceData: undefined })

    expect(screen.getByText("تعذر تحميل بيانات مساحة العمل الآن.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))

    expect(mocks.workspaceRefetch).toHaveBeenCalledTimes(1)
  })

  it("shows dashboard as a separate page", async () => {
    renderWorkspace("dashboard", { sessionUser: demoUser })

    expect(await screen.findByRole("heading", { name: "لوحة التحكم" })).toBeTruthy()
    expect(screen.getByText("العمال النشطون")).toBeTruthy()
    expect(screen.queryByText("أنت هنا الآن")).toBeNull()
  })

  it("shows employees on their own page with clear action buttons", async () => {
    renderWorkspace("employees", { sessionUser: demoUser })

    expect(await screen.findByRole("heading", { name: "العاملون" })).toBeTruthy()
    expect(screen.getByText("علي بن حميد")).toBeTruthy()
    expect(screen.queryByText(/^المدير:/)).toBeNull()
    expect(screen.getAllByRole("button", { name: "عرض" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "تعديل" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "إنهاء" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "حذف" }).length).toBeGreaterThan(0)
  })

  it("searches employees server-side across all records (issue #183)", async () => {
    renderWorkspace("employees", { sessionUser: demoUser })

    expect(await screen.findByRole("heading", { name: "العاملون" })).toBeTruthy()
    // أحمد بلخير appears in both the name cell and the manager column.
    expect(screen.getAllByText("أحمد بلخير").length).toBeGreaterThan(0)
    expect(screen.getByText("علي بن حميد")).toBeTruthy()

    // The old local-page hint must be gone: search is no longer page-local.
    expect(
      screen.queryByText("يبحث في الصفحة الحالية فقط. اعمل مسح لرؤية جميع النتائج."),
    ).toBeNull()

    const searchInput = screen.getByPlaceholderText("بحث...")
    // Each employee row renders one "عرض" action button, so the count is the
    // number of rows the server-side search returned. queryAllBy* so the
    // zero-row case is assertable.
    const rowCount = () => screen.queryAllByRole("button", { name: "عرض" }).length

    // Search by last name — only أحمد بلخير matches.
    fireEvent.change(searchInput, { target: { value: "بلخير" } })
    await waitFor(() => expect(rowCount()).toBe(1))
    expect(screen.queryByText("علي بن حميد")).toBeNull()

    // Search that matches nobody — empty state, no stale rows.
    fireEvent.change(searchInput, { target: { value: "0555000000" } })
    await waitFor(() => expect(rowCount()).toBe(0))
    expect(screen.getByText("لا توجد بيانات في هذا القسم حاليًا.")).toBeTruthy()

    // Search by phone digits — only علي بن حميد matches; أحمد remains only
    // as علي's manager-cell label, not as a row.
    fireEvent.change(searchInput, { target: { value: "0555200120" } })
    await waitFor(() => expect(rowCount()).toBe(1))
    expect(screen.getByText("علي بن حميد")).toBeTruthy()
    expect(screen.getAllByText("أحمد بلخير")).toHaveLength(1)

    // Search by role label — only أحمد بلخير (مدير مشروع) matches; علي (عامل)
    // does not. This pins the server-side role-label regression fix (PR #329).
    // (Sync point is content, not count: the previous step also left 1 row.)
    fireEvent.change(searchInput, { target: { value: "مدير" } })
    await waitFor(() => expect(screen.queryByText("علي بن حميد")).toBeNull())
    expect(screen.getByText("أحمد بلخير")).toBeTruthy()
    expect(rowCount()).toBe(1)

    // Clearing the search restores every record.
    fireEvent.change(searchInput, { target: { value: "" } })
    await waitFor(() => expect(rowCount()).toBe(2))
    expect(screen.getByText("علي بن حميد")).toBeTruthy()
  })

  it("opens a dedicated employee create page with batch submission", async () => {
    mocks.createEmployeesBatchMutate.mockResolvedValue({ createdCount: 2 })

    renderWorkspace("employees-create", { sessionUser: demoUser })

    expect(await screen.findByRole("heading", { name: "صفحة إضافة العاملين" })).toBeTruthy()

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
    fireEvent.change(screen.getAllByLabelText("صلاحية التطبيق")[0]!, {
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
    fireEvent.change(screen.getAllByLabelText("صلاحية التطبيق")[1]!, {
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
    renderWorkspace("employees-create", { sessionUser: demoUser })

    fireEvent.change(await screen.findByLabelText("الاسم الأول"), {
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
    renderWorkspace("employee-details", { sessionUser: demoUser, employeeId: "employee-worker-1" })

    expect(await screen.findByText("المعلومات الشخصية")).toBeTruthy()
    expect(screen.getByText("سجل العمل")).toBeTruthy()
    expect(screen.getByRole("tab", { name: "المالية" })).toBeTruthy()
    expect(screen.getByText("المهنة / الدور الوظيفي")).toBeTruthy()
    expect(screen.getByText("عامل بناء")).toBeTruthy()
  })

  it("shows the no-occupation fallback on an employee without an occupation", async () => {
    renderWorkspace("employee-details", { sessionUser: demoUser, employeeId: "employee-manager-1" })

    expect(await screen.findByText("المهنة / الدور الوظيفي")).toBeTruthy()
    expect(screen.getByText("غير محدد")).toBeTruthy()
  })

  it("routes back to employees when a requested employee record is missing", () => {
    renderWorkspace("employee-details", { sessionUser: demoUser, employeeId: "employee-missing" })

    fireEvent.click(screen.getByRole("button", { name: "العودة" }))

    expect(mocks.navigateMock).toHaveBeenCalledWith({
      to: "/employees",
    })
  })

  it("shows missing project and warehouse record fallbacks with return actions", () => {
    const { unmount } = renderWorkspace("project-details", { sessionUser: demoUser, projectId: "project-missing" })

    expect(
      screen.getByText("تعذر العثور على هذا السجل أو لم يعد متاحًا ضمن البيانات الحالية."),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "العودة" }))

    expect(mocks.navigateMock).toHaveBeenCalledWith({ to: "/projects" })

    mocks.navigateMock.mockReset()
    unmount()

    renderWorkspace("warehouse-details", { sessionUser: demoUser, warehouseId: "warehouse-missing" })

    expect(
      screen.getByText("تعذر العثور على هذا السجل أو لم يعد متاحًا ضمن البيانات الحالية."),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "العودة" }))

    expect(mocks.navigateMock).toHaveBeenCalledWith({ to: "/warehouses" })
  })

  it("shows no-notes fallback in the employee finance table when a salary payment note is missing", async () => {
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

    renderWorkspace("employee-details", {
      sessionUser: demoUser,
      detailTab: "finance",
      employeeId: "employee-worker-1",
      workspaceData: makeWorkspaceData({ salaryPayments: [noNotePayment] }),
    })

    expect(await screen.findByText("لا توجد ملاحظات.")).toBeTruthy()
  })

  it("submits salary payment form without client-controlled expected amount fields", async () => {
    renderWorkspace("employee-details", { sessionUser: demoUser, detailTab: "finance", employeeId: "employee-worker-1" })

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
    renderWorkspace("employee-details", { sessionUser: demoUser, detailTab: "finance", employeeId: "employee-worker-1" })

    fireEvent.click(await screen.findByRole("button", { name: "إضافة دفعة راتب" }))
    fireEvent.change(screen.getByPlaceholderText("0"), {
      target: { value: "" },
    })

    expect(screen.getByRole("button", { name: "حفظ دفعة الراتب" }).hasAttribute("disabled")).toBe(true)
  })

  it("renders project details as a dedicated page", async () => {
    renderWorkspace("project-details", { sessionUser: demoUser, projectId: "project-1" })

    expect(await screen.findByRole("heading", { name: "مبنى الإدارة الجديد" })).toBeTruthy()
    expect(screen.getByText("العمال المرتبطون")).toBeTruthy()
  })

  it("renders the created invoice details once the route id is provided (issue #30)", async () => {
    renderWorkspace("invoice-details", {
      sessionUser: demoUser,
      invoiceId: "invoice-1",
      invoiceGroupDetail: makeInvoiceGroupDetail(),
    })

    // The details view must mount the inventory invoice group query and
    // render the fetched invoice — invoice number, line items (both
    // CONSUMABLE and ASSET), totals, movements and attachments surfaces.
    // Before issue #30 the id never reached HomeViewPageContent, so the
    // main stayed empty.
    expect(await screen.findByRole("heading", { name: "FAC-2026-001" })).toBeTruthy()
    expect((await screen.findAllByText("أسمنت")).length).toBeGreaterThan(0)
    expect(screen.getAllByText("الإجمالي: 1500.00 دج").length).toBeGreaterThan(0)
    // ASSET entry branch: renders the asset count label and the asset row
    // (entry line name and the asset row both carry the asset name).
    expect(screen.getByText("عدد الأصول: 1")).toBeTruthy()
    expect(screen.getAllByText("حاسوب محمول").length).toBeGreaterThan(0)
    // Movement + attachment entry content (proves the entries render, not
    // just the section headers).
    expect(screen.getAllByText(/شراء - مادة/).length).toBeGreaterThan(0)
    expect(screen.getByText("فاتورة-المورد.pdf")).toBeTruthy()
    expect(screen.getByRole("button", { name: "العودة إلى الفواتير" })).toBeTruthy()
  })

  it("routes the invoice route param into the inventory invoice group query (issue #30)", async () => {
    renderWorkspace("invoice-details", {
      sessionUser: demoUser,
      invoiceId: "invoice-1",
      invoiceGroupDetail: makeInvoiceGroupDetail(),
    })

    await screen.findByRole("heading", { name: "FAC-2026-001" })
    expect(getInvoiceGroupQueryState().invoiceId).toBe("invoice-1")
  })

  it("shows the missing-record fallback for an id-less invoice details route (issue #30)", () => {
    renderWorkspace("invoice-details", { sessionUser: demoUser })

    expect(
      screen.getByText("تعذر العثور على هذا السجل أو لم يعد متاحًا ضمن البيانات الحالية."),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "العودة" }))

    expect(mocks.navigateMock).toHaveBeenCalledWith({ to: "/invoices" })
  })

  it("opens a dedicated project create page and navigates to the new record", async () => {
    mocks.createProjectMutate.mockResolvedValue({ item: { id: "project-2" } })

    renderWorkspace("project-create", { sessionUser: demoUser })

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

  it("navigates project add actions to the dedicated create route", async () => {
    renderWorkspace("projects", { sessionUser: demoUser })

    fireEvent.click(await screen.findByRole("button", { name: "إضافة مشروع" }))

    expect(mocks.navigateMock).toHaveBeenCalledWith({ to: "/projects/create" })
  })

  it("opens a dedicated warehouse create page and navigates to the new record", async () => {
    mocks.createWarehouseMutate.mockResolvedValue({ item: { id: "warehouse-2" } })

    renderWorkspace("warehouse-create", { sessionUser: demoUser })

    expect(await screen.findByRole("heading", { name: "إضافة مستودع" }, { timeout: 5000 })).toBeTruthy()

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

  it("navigates warehouse add actions to the dedicated create route", async () => {
    renderWorkspace("warehouses", { sessionUser: demoUser })

    fireEvent.click(await screen.findByRole("button", { name: "إضافة مستودع" }))

    expect(mocks.navigateMock).toHaveBeenCalledWith({ to: "/warehouses/create" })
  })

  it("renders the transactions page with grouped log rows", async () => {
    renderWorkspace("transactions", { sessionUser: demoUser })

    expect(await screen.findByRole("heading", { name: "سجل المعاملات" })).toBeTruthy()
    expect(
      screen.getByText("تم إسناد علي بن حميد إلى المشروع مبنى الإدارة الجديد"),
    ).toBeTruthy()
  })

  it("renders the salaries page with recent payments and worker shortcuts", async () => {
    renderWorkspace("salaries", { sessionUser: demoUser })

    expect(await screen.findByRole("heading", { name: "الرواتب" })).toBeTruthy()
    expect(screen.getAllByText("آخر دفعات الرواتب").length).toBeGreaterThan(0)
    expect(screen.getAllByText("علي بن حميد").length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "إضافة دفعة" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "تعديل الأجر" }).length).toBeGreaterThan(0)
  })

  it("navigates from salaries page to the worker edit page", async () => {
    renderWorkspace("salaries", { sessionUser: demoUser })

    fireEvent.click((await screen.findAllByRole("button", { name: "تعديل الأجر" }))[0]!)

    expect(mocks.navigateMock).toHaveBeenCalledWith({
      to: "/employees/$employeeId/edit",
      params: { employeeId: "employee-worker-1" },
    })
  })

  it("renders account controls on the settings page", async () => {
    renderWorkspace("settings", { sessionUser: demoUser })

    expect((await screen.findAllByText("معلومات الحساب")).length).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByText(
        "يلزم إدخال كلمة المرور الحالية عند تغيير رقم الهاتف لأنه يستخدم لتسجيل الدخول.",
      ),
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "حفظ بيانات الحساب" })).toBeTruthy()
  })

  it("submits account settings through the semantic form flow", async () => {
    mocks.updateAccountMutateAsync.mockResolvedValue({ success: true })

    renderWorkspace("settings", { sessionUser: demoUser })

    fireEvent.change(await screen.findByDisplayValue("مدير التشغيل"), {
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
    renderWorkspace("dashboard", { sessionUser: demoUser })
    fireEvent.click(screen.getAllByRole("button", { name: "توسيع الشريط الجانبي" })[0]!)

    // The label also appears on the dashboard counterparties stat card, so
    // scope the assertion to the sidebar navigation only (issue #23).
    const sidebar = document.querySelector('[data-tour="sidebar"]')
    expect(within(sidebar as HTMLElement).getByText("الجهات الخارجية")).toBeTruthy()
    expect(within(sidebar as HTMLElement).getByText("الرواتب")).toBeTruthy()
  })

  it("shows worker manager and project controls on the employee edit page", async () => {
    renderWorkspace("employee-edit", { sessionUser: demoUser, employeeId: "employee-worker-1" })

    expect(await screen.findByText("المدير المباشر")).toBeTruthy()
    expect(screen.getByText("المشروع الحالي")).toBeTruthy()
  })

  it("persists the sidebar collapsed state across route remounts", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1400,
    })

    const firstRender = renderWorkspace("dashboard", { sessionUser: demoUser })

    fireEvent.click(screen.getByRole("button", { name: "تصغير الشريط الجانبي" }))

    expect(window.localStorage.getItem("tuari.workspace.sidebar.collapsed")).toBe("true")

    firstRender.unmount()
    renderWorkspace("employees", { sessionUser: demoUser })

    expect(screen.getAllByRole("button", { name: "توسيع الشريط الجانبي" })[0]).toBeTruthy()
  })

  it("restores an expanded sidebar from storage instead of collapsing on desktop widths", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1400,
    })
    window.localStorage.setItem("tuari.workspace.sidebar.collapsed", "false")

    renderWorkspace("dashboard", { sessionUser: demoUser })

    expect(screen.getByRole("button", { name: "تصغير الشريط الجانبي" })).toBeTruthy()
  })

  it("auto-collapses below 1200px without persisting to localStorage", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1400,
      writable: true,
    })

    renderWorkspace("dashboard", { sessionUser: demoUser })

    expect(screen.getByRole("button", { name: "تصغير الشريط الجانبي" })).toBeTruthy()

    window.innerWidth = 1100
    fireEvent(window, new Event("resize"))

    expect(screen.getAllByRole("button", { name: "توسيع الشريط الجانبي" })[0]).toBeTruthy()
    expect(window.localStorage.getItem("tuari.workspace.sidebar.collapsed")).not.toBe("true")

    window.innerWidth = 1400
    fireEvent(window, new Event("resize"))

    expect(screen.getAllByRole("button", { name: "توسيع الشريط الجانبي" })[0]).toBeTruthy()
  })

  it("submits unchanged workplace links as part of the atomic batch", async () => {
    mocks.saveEmployeeMutate.mockResolvedValue({ success: true })

    renderWorkspace("employee-edit", { sessionUser: demoUser, employeeId: "employee-worker-1" })

    fireEvent.click(await screen.findByRole("button", { name: "حفظ كل التغييرات" }))

    await waitFor(() => {
      expect(mocks.saveEmployeeMutate).toHaveBeenCalled()
    })

    expect(mocks.updateEmployeeMutate).not.toHaveBeenCalled()
    expect(mocks.updateEmployeeWorkplaceMutate).not.toHaveBeenCalled()
  })

  it("mounts the skip-to-content link and a focusable main-content target", () => {
    renderWorkspace("dashboard", { sessionUser: demoUser })

    const skipLink = screen.getByRole("link", { name: "تخطي إلى المحتوى" }) as HTMLAnchorElement
    expect(skipLink.getAttribute("href")).toBe("#main-content")
    // Skip link must precede the shell grid so it is the first focusable node
    // and never becomes a grid item (issue #284).
    expect(document.body.innerHTML.indexOf("تخطي إلى المحتوى")).toBeLessThan(
      document.body.innerHTML.indexOf('class="tauri-shell"'),
    )

    const mainContent = document.getElementById("main-content")
    expect(mainContent).toBeTruthy()
    expect(mainContent?.tagName).toBe("MAIN")
    expect(mainContent?.getAttribute("tabindex")).toBe("-1")
    expect(document.body.innerHTML.indexOf('id="main-content"')).toBeGreaterThan(
      document.body.innerHTML.indexOf('class="tauri-shell"'),
    )

    // The tour's declared [data-tour="sidebar"] target must survive on the
    // aside after the wrapper div was removed (issue #284).
    expect(document.querySelector('aside[data-tour="sidebar"]')).toBeTruthy()
  })

  it("opens the mobile drawer from the header toggle and closes it on backdrop tap", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
      writable: true,
    })

    renderWorkspace("dashboard", { sessionUser: demoUser })

    const shell = document.querySelector(".tauri-shell") as HTMLElement
    expect(shell.getAttribute("data-sidebar-open")).toBe("false")

    // Mobile header toggle (menu button) opens the drawer. Scope to the
    // header so the sidebar footer's expand button is not matched.
    const header = document.querySelector(".tauri-shell header") as HTMLElement
    const toggle = within(header).getByRole("button", { name: "توسيع الشريط الجانبي" })
    fireEvent.click(toggle)

    expect(shell.getAttribute("data-sidebar-open")).toBe("true")

    const backdrop = document.querySelector(".sb-mobile-backdrop") as HTMLElement
    expect(backdrop).toBeTruthy()
    expect(backdrop.getAttribute("data-open")).toBe("true")

    // Tapping the backdrop closes the drawer (issue #284).
    fireEvent.click(backdrop)

    expect(shell.getAttribute("data-sidebar-open")).toBe("false")
    expect(backdrop.getAttribute("data-open")).toBe("false")
  })

  it("keeps the drawer closed across a mobile→tablet→mobile resize round trip", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
      writable: true,
    })

    renderWorkspace("dashboard", { sessionUser: demoUser })

    const shell = document.querySelector(".tauri-shell") as HTMLElement
    const header = document.querySelector(".tauri-shell header") as HTMLElement
    const toggle = within(header).getByRole("button", { name: "توسيع الشريط الجانبي" })
    fireEvent.click(toggle)
    expect(shell.getAttribute("data-sidebar-open")).toBe("true")

    // Grow into the tablet band (768–1023px): the drawer backdrop unmounts,
    // and leaving the mobile band must close the drawer so it never pops back
    // open on a later shrink to mobile (issue #284).
    act(() => {
      window.innerWidth = 800
      fireEvent(window, new Event("resize"))
    })
    expect(shell.getAttribute("data-sidebar-open")).toBe("false")

    act(() => {
      window.innerWidth = 375
      fireEvent(window, new Event("resize"))
    })
    expect(shell.getAttribute("data-sidebar-open")).toBe("false")
  })

  it("closes the mobile drawer when navigating to another page", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
      writable: true,
    })

    // Render in place and re-render with a different page prop — a remount
    // would reset useMobileLayout's local sidebarOpen state and pass even if
    // the close-on-navigation effect were deleted.
    const view = renderWorkspace("dashboard", { sessionUser: demoUser })

    const shell = document.querySelector(".tauri-shell") as HTMLElement
    const header = document.querySelector(".tauri-shell header") as HTMLElement
    const toggle = within(header).getByRole("button", { name: "توسيع الشريط الجانبي" })
    fireEvent.click(toggle)
    expect(shell.getAttribute("data-sidebar-open")).toBe("true")

    act(() => {
      view.rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <AppPreferencesProvider>
            <HomeView page="employees" />
          </AppPreferencesProvider>
        </QueryClientProvider>,
      )
    })

    expect(shell.getAttribute("data-sidebar-open")).toBe("false")
  })
})

describe("debts pages surface feature-query errors", () => {
  it("shows the debts load error instead of an empty hub when the summary query fails", async () => {
    renderWorkspace("debts", { sessionUser: demoUser, debtsSummaryError: true })

    expect(
      await screen.findByText("تعذر تحميل بيانات الديون. حاول مرة أخرى."),
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeTruthy()
  })

  it("shows the debts load error instead of the externals list when the summary query fails", async () => {
    renderWorkspace("externals", { sessionUser: demoUser, debtsSummaryError: true })

    expect(
      await screen.findByText("تعذر تحميل بيانات الديون. حاول مرة أخرى."),
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeTruthy()
  })
})

describe("debts pages show a loading state while the summary query is pending", () => {
  it("shows the detail-page skeleton instead of a zero-balance hub", async () => {
    renderWorkspace("debts", { sessionUser: demoUser, debtsSummaryPending: true })

    // The skeleton fallback (animate-pulse shimmer) replaces the hub until
    // the feature-scoped summary query resolves — no zero-balance flash.
    expect(document.querySelector(".animate-pulse")).toBeTruthy()
    expect(screen.queryByText("مركز الديون")).toBeNull()
  })
})

describe("global search (Ctrl+K) — debounced and lazy (issue #280)", () => {
  it("opens the dialog showing page categories while the query is empty", () => {
    renderWorkspace("dashboard", { sessionUser: demoUser })

    fireEvent.click(screen.getByRole("button", { name: "بحث" }))

    expect(screen.getByPlaceholderText("بحث...")).toBeTruthy()
    // Every page category carries the "الصفحات" label; the sidebar never
    // renders it, so its presence proves the category corpus is shown.
    expect(screen.getAllByText("الصفحات").length).toBeGreaterThan(0)
    expect(screen.getAllByText("المستودعات").length).toBeGreaterThan(0)
  })

  it("fetches the seven search-corpus queries only while the dialog is open", () => {
    // Render a non-dashboard page: the dashboard section (issue #23)
    // legitimately mounts the inventory/invoices queries for its stat cards,
    // so the search gating is only observable where the shell is the sole
    // consumer of the corpus query hooks.
    renderWorkspace("projects", { sessionUser: demoUser })

    // Shell mounts with the dialog closed → every corpus query disabled.
    expect(getSearchQueryState()).toEqual({
      employees: false,
      projects: false,
      warehouses: false,
      debts: false,
      externals: false,
      inventory: false,
      invoices: false,
    })

    fireEvent.click(screen.getByRole("button", { name: "بحث" }))

    expect(getSearchQueryState()).toEqual({
      employees: true,
      projects: true,
      warehouses: true,
      debts: true,
      externals: true,
      inventory: true,
      invoices: true,
    })

    // The dialog's own input handles Escape → close.
    fireEvent.keyDown(screen.getByPlaceholderText("بحث..."), { key: "Escape" })

    expect(getSearchQueryState()).toEqual({
      employees: false,
      projects: false,
      warehouses: false,
      debts: false,
      externals: false,
      inventory: false,
      invoices: false,
    })
  })

  it("defers fuzzy results until the 175ms debounce window elapses", () => {
    renderWorkspace("dashboard", { sessionUser: demoUser })
    fireEvent.click(screen.getByRole("button", { name: "بحث" }))

    vi.useFakeTimers()
    try {
      fireEvent.change(screen.getByPlaceholderText("بحث..."), {
        target: { value: "مبنى" },
      })

      // Inside the window: the project is not searched yet — categories stay.
      expect(screen.queryByText("مبنى الإدارة الجديد")).toBeNull()
      expect(screen.getAllByText("الصفحات").length).toBeGreaterThan(0)

      act(() => {
        vi.advanceTimersByTime(174)
      })
      expect(screen.queryByText("مبنى الإدارة الجديد")).toBeNull()

      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(screen.getByText("مبنى الإدارة الجديد")).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it("searches employees, warehouses, and projects from the corpus", () => {
    renderWorkspace("dashboard", { sessionUser: demoUser })
    fireEvent.click(screen.getByRole("button", { name: "بحث" }))

    vi.useFakeTimers()
    try {
      // Warehouse hit.
      fireEvent.change(screen.getByPlaceholderText("بحث..."), {
        target: { value: "المستودع الرئيسي" },
      })
      act(() => {
        vi.advanceTimersByTime(175)
      })
      expect(screen.getByText("المستودع الرئيسي")).toBeTruthy()

      // Employee hit (first + last name).
      fireEvent.change(screen.getByPlaceholderText("بحث..."), {
        target: { value: "أحمد بلخير" },
      })
      act(() => {
        vi.advanceTimersByTime(175)
      })
      expect(screen.getByText("أحمد بلخير")).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it("restores the categories immediately when the query is cleared", () => {
    renderWorkspace("dashboard", { sessionUser: demoUser })
    fireEvent.click(screen.getByRole("button", { name: "بحث" }))

    vi.useFakeTimers()
    try {
      const input = screen.getByPlaceholderText("بحث...")
      fireEvent.change(input, { target: { value: "مبنى" } })
      act(() => {
        vi.advanceTimersByTime(175)
      })
      expect(screen.getByText("مبنى الإدارة الجديد")).toBeTruthy()

      // Clearing the input shows the categories right away — no stale results
      // linger while the debounced value catches up to "".
      fireEvent.change(input, { target: { value: "" } })
      expect(screen.getAllByText("الصفحات").length).toBeGreaterThan(0)
      expect(screen.queryByText("مبنى الإدارة الجديد")).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("closing the dialog clears the query for the next open", () => {
    renderWorkspace("dashboard", { sessionUser: demoUser })
    fireEvent.click(screen.getByRole("button", { name: "بحث" }))

    vi.useFakeTimers()
    try {
      fireEvent.change(screen.getByPlaceholderText("بحث..."), {
        target: { value: "مبنى" },
      })
      act(() => {
        vi.advanceTimersByTime(175)
      })
      expect(screen.getByText("مبنى الإدارة الجديد")).toBeTruthy()

      fireEvent.keyDown(screen.getByPlaceholderText("بحث..."), { key: "Escape" })
      fireEvent.click(screen.getByRole("button", { name: "بحث" }))

      // Reopened fresh: input empty, categories shown, no stale result.
      const input = screen.getByPlaceholderText("بحث...") as HTMLInputElement
      expect(input.value).toBe("")
      expect(screen.getAllByText("الصفحات").length).toBeGreaterThan(0)
      expect(screen.queryByText("مبنى الإدارة الجديد")).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("rapid close/reopen never leaks the previous query's results", () => {
    renderWorkspace("dashboard", { sessionUser: demoUser })
    fireEvent.click(screen.getByRole("button", { name: "بحث" }))

    vi.useFakeTimers()
    try {
      // Settle a search for the project.
      const input = screen.getByPlaceholderText("بحث...")
      fireEvent.change(input, { target: { value: "مبنى" } })
      act(() => {
        vi.advanceTimersByTime(175)
      })
      expect(screen.getByText("مبنى الإدارة الجديد")).toBeTruthy()

      // Close and reopen WITHOUT letting the debounce timer run out — the
      // reset key must drop the stale debounced value synchronously.
      fireEvent.keyDown(input, { key: "Escape" })
      fireEvent.click(screen.getByRole("button", { name: "بحث" }))

      // Typing a NEW query immediately must not show the old query's results
      // beneath the new input.
      fireEvent.change(screen.getByPlaceholderText("بحث..."), {
        target: { value: "مستودع" },
      })
      expect(screen.queryByText("مبنى الإدارة الجديد")).toBeNull()

      act(() => {
        vi.advanceTimersByTime(175)
      })
      expect(screen.getByText("المستودع الرئيسي")).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})
