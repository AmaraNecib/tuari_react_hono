// @vitest-environment jsdom

import "@/i18n"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { InventoryInvoiceCreatePage } from "./inventory-invoice-create-page"

const mocks = vi.hoisted(() => ({
  itemDefinitionsQuery: vi.fn(),
  warehousesQuery: vi.fn(),
  projectsQuery: vi.fn(),
  counterpartiesQuery: vi.fn(),
  createInvoiceMutation: { isPending: false, mutateAsync: vi.fn() },
  createWarehouseMutation: { isPending: false, mutateAsync: vi.fn() },
  createProjectMutation: { isPending: false, mutateAsync: vi.fn() },
  createCounterpartyMutation: { isPending: false, mutateAsync: vi.fn() },
  uploadInvoiceAttachments: vi.fn(),
}))

vi.mock("./inventory-hooks", () => ({
  useInventoryItemDefinitionsQuery: () => mocks.itemDefinitionsQuery(),
  useInventoryWarehousesQuery: () => mocks.warehousesQuery(),
  useInventoryProjectsQuery: () => mocks.projectsQuery(),
  useInventoryExternalCounterpartiesQuery: () => mocks.counterpartiesQuery(),
  useCreateInventoryInvoiceGroupMutation: () => mocks.createInvoiceMutation,
  uploadInvoiceAttachments: mocks.uploadInvoiceAttachments,
}))

vi.mock("@/features/app-shell/workspace-mutations", () => ({
  useCreateWarehouseMutation: () => mocks.createWarehouseMutation,
  useCreateProjectMutation: () => mocks.createProjectMutation,
  useCreateExternalCounterpartyMutation: () => mocks.createCounterpartyMutation,
}))

const WAREHOUSES = [
  { id: "wh-1", name: "المستودع المركزي" },
  { id: "wh-2", name: "مستودع المبيعات" },
]

const PROJECTS = [
  { id: "prj-1", name: "مشروع التوسعة" },
  { id: "prj-2", name: "مشروع الصيانة" },
]

const DEFINITIONS = [
  { id: "def-1", name: "مادة استهلاكية 1", itemType: "CONSUMABLE", unit: "قطعة", key: "consumable_1" },
]

/** Progressive disclosure section titles (from the ar resource). */
const DEBT_SECTION = "الدين والدفع"
const COUNTERPARTY_SECTION = "ربط بجهة خارجية"
const DEFAULTS_SECTION = "المستودع والمشروع الافتراضي"
const NOTES_SECTION = "ملاحظات وملفات"

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPage() {
  const queryClient = makeQueryClient()
  const onCreated = vi.fn()
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <InventoryInvoiceCreatePage onCreated={onCreated} />
    </QueryClientProvider>,
  )
  return { onCreated, ...utils }
}

/** Opens a progressive-disclosure section by clicking its toggle header. */
function openSection(title: string) {
  fireEvent.click(screen.getByRole("button", { name: title }))
  expect(screen.getByRole("button", { name: title }).getAttribute("aria-expanded")).toBe("true")
}

/** Closes an open progressive-disclosure section. */
function closeSection(title: string) {
  fireEvent.click(screen.getByRole("button", { name: title }))
  expect(screen.getByRole("button", { name: title }).getAttribute("aria-expanded")).toBe("false")
}

/** Finds the header combobox (Base UI) trigger inside the <label> that owns the field label. */
function headerCombobox(label: string) {
  const labelEl = screen.getByText(label)
  const wrapper = labelEl.closest("label")
  if (!wrapper) throw new Error(`no <label> wrapper for "${label}"`)
  return within(wrapper as HTMLElement).getByRole("combobox")
}

/** Finds the first native <select> whose options contain the given text. */
function nativeSelectWithOption(text: string): HTMLSelectElement {
  const select = screen
    .getAllByRole("combobox")
    .filter((el): el is HTMLSelectElement => el instanceof HTMLSelectElement)
    .find((el) => Array.from(el.options).some((o) => o.textContent?.includes(text)))
  if (!select) throw new Error(`no native <select> with option "${text}"`)
  return select
}

/**
 * Selects an option in a header CreateableSelect (Base UI).
 * Base UI only commits a click when the option is highlighted (activeIndex set
 * by pointer hover), so we dispatch the hover/click sequence a real mouse would.
 */
async function selectHeaderComboboxOption(label: string, optionName: string) {
  const trigger = headerCombobox(label)
  fireEvent.mouseDown(trigger)
  // Base UI mounts its popup in a portal; scope the option lookup so native
  // <select> options from line items can't shadow it.
  const popup = await screen.findByRole("listbox")
  const option = await within(popup).findByRole("option", { name: optionName })
  // Base UI only commits a click on a highlighted option; a real mouse hover
  // sets the active index before the click, so mirror that here.
  fireEvent.mouseEnter(option)
  fireEvent.click(option)
  await waitFor(() => {
    expect(headerCombobox(label).textContent).toContain(optionName)
  })
}

async function submitInvoice() {
  fireEvent.click(screen.getByText("حفظ الفاتورة"))
  await waitFor(() => {
    expect(mocks.createInvoiceMutation.mutateAsync).toHaveBeenCalled()
  })
  const call = mocks.createInvoiceMutation.mutateAsync.mock.calls.at(-1)
  return call![0]
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** Shared query/mutation mock values for both describe blocks. */
function mockQueries() {
  mocks.itemDefinitionsQuery.mockReturnValue({ data: { items: DEFINITIONS } })
  mocks.warehousesQuery.mockReturnValue({ data: { items: WAREHOUSES } })
  mocks.projectsQuery.mockReturnValue({ data: { items: PROJECTS } })
  mocks.counterpartiesQuery.mockReturnValue({ data: { items: [] } })
  mocks.createInvoiceMutation.mutateAsync.mockResolvedValue({
    item: { group: { id: "inv-1" } },
    message: "تم إنشاء الفاتورة.",
  })
  mocks.uploadInvoiceAttachments.mockResolvedValue(undefined)
}

/** Base UI's popup settling + act-wrapped add-line clicks can exceed the 5s
    default under parallel-load CPU contention (repo-known flake class, see the
    act() wrap comments in the #24 suite). Assertions are unchanged; only the
    per-test budget grows. */
const BASE_UI_TIMEOUT = 10_000

describe("InventoryInvoiceCreatePage header-level default warehouse/project", () => {
  beforeEach(() => mockQueries())

  // Issue #25: the warehouse/project defaults live in a collapsible section,
  // so every test below opens it first — exactly what a user must do to reach
  // the fields. The seeding/XOR assertions are unchanged.

  it("keeps the default warehouse selection visible and in form state across re-renders", async () => {

    renderPage()

    openSection(DEFAULTS_SECTION)
    await selectHeaderComboboxOption("المستودع الافتراضي", "المستودع المركزي")

    // The trigger displays the selected warehouse name (not the empty label).
    expect(headerCombobox("المستودع الافتراضي").textContent).toContain("المستودع المركزي")
    expect(headerCombobox("المستودع الافتراضي").textContent).not.toContain("بدون مستودع")

    // Re-render by adding a line item; the selection must persist. The click
    // is wrapped in act() so Base UI Select's async popup/option state settles
    // inside the act scope — otherwise the trailing flush can exceed the
    // per-test timeout under parallel load (same fix as the project sibling).
    await act(async () => {
      fireEvent.click(screen.getByText("إضافة مادة"))
    })
    await waitFor(() => {
      expect(headerCombobox("المستودع الافتراضي").textContent).toContain("المستودع المركزي")
    })
  }, BASE_UI_TIMEOUT)

  it("keeps the default project selection visible across re-renders", async () => {

    renderPage()

    openSection(DEFAULTS_SECTION)
    await selectHeaderComboboxOption("المشروع الافتراضي", "مشروع التوسعة")

    expect(headerCombobox("المشروع الافتراضي").textContent).toContain("مشروع التوسعة")
    expect(headerCombobox("المشروع الافتراضي").textContent).not.toContain("بدون مشروع")

    // Re-render by adding a line. Wrap the state-changing click in act() so
    // Base UI Select's async popup/option state settles inside the act scope;
    // otherwise the trailing act-warning flush can exceed the per-test timeout
    // in slower CI environments.
    await act(async () => {
      fireEvent.click(screen.getByText("إضافة أصل"))
    })
    await waitFor(() => {
      expect(headerCombobox("المشروع الافتراضي").textContent).toContain("مشروع التوسعة")
    })
  }, BASE_UI_TIMEOUT)

  it("applies the header defaults to a line item that leaves its own warehouse/project unset", async () => {

    renderPage()

    openSection(DEFAULTS_SECTION)
    await selectHeaderComboboxOption("المستودع الافتراضي", "المستودع المركزي")

    // Fill the first (consumable) line: choose an item definition; leave its
    // warehouse/project on "default" so the header default must seed it.
    fireEvent.change(nativeSelectWithOption("مادة استهلاكية 1"), { target: { value: "def-1" } })

    const payload = await submitInvoice()
    expect(payload.warehouseId).toBe("wh-1")
    expect(payload.entries[0].warehouseId).toBe("wh-1")
    expect(payload.entries[0].projectId).toBeNull()
  }, BASE_UI_TIMEOUT)

  it("keeps a line item's own warehouse when it overrides the header default", async () => {

    renderPage()

    openSection(DEFAULTS_SECTION)
    await selectHeaderComboboxOption("المستودع الافتراضي", "المستودع المركزي")

    fireEvent.change(nativeSelectWithOption("مادة استهلاكية 1"), { target: { value: "def-1" } })
    // The line's warehouse select is the native select listing warehouses.
    fireEvent.change(nativeSelectWithOption("مستودع المبيعات"), { target: { value: "wh-2" } })

    const payload = await submitInvoice()
    expect(payload.warehouseId).toBe("wh-1")
    expect(payload.entries[0].warehouseId).toBe("wh-2")
    expect(payload.entries[0].projectId).toBeNull()
  }, BASE_UI_TIMEOUT)

  it("does not seed the header warehouse into a line that picks its own project", async () => {

    renderPage()

    openSection(DEFAULTS_SECTION)
    await selectHeaderComboboxOption("المستودع الافتراضي", "المستودع المركزي")

    fireEvent.change(nativeSelectWithOption("مادة استهلاكية 1"), { target: { value: "def-1" } })
    // Line picks its own project → must NOT inherit the header warehouse.
    fireEvent.change(nativeSelectWithOption("مشروع التوسعة"), { target: { value: "prj-1" } })

    const payload = await submitInvoice()
    expect(payload.entries[0].warehouseId).toBeNull()
    expect(payload.entries[0].projectId).toBe("prj-1")
  }, BASE_UI_TIMEOUT)

  it("seeds the header project into a line that leaves its own project unset", async () => {

    renderPage()

    openSection(DEFAULTS_SECTION)
    await selectHeaderComboboxOption("المشروع الافتراضي", "مشروع التوسعة")

    // Fill the first (consumable) line: choose an item definition; leave its
    // warehouse/project on "default" so the header project must seed it.
    fireEvent.change(nativeSelectWithOption("مادة استهلاكية 1"), { target: { value: "def-1" } })

    const payload = await submitInvoice()
    expect(payload.projectId).toBe("prj-1")
    expect(payload.entries[0].projectId).toBe("prj-1")
    expect(payload.entries[0].warehouseId).toBeNull()
  }, BASE_UI_TIMEOUT)
})

describe("InventoryInvoiceCreatePage progressive disclosure (issue #25)", () => {
  beforeEach(() => mockQueries())

  it("shows only the essential create path fields by default", () => {
    renderPage()

    // Essential path: invoice number + date are visible with no interaction.
    expect(screen.getByText("رقم الفاتورة")).not.toBeNull()
    expect(screen.getByText("تاريخ الفاتورة")).not.toBeNull()

    // Section titles are the only less-used fields visible when collapsed.
    expect(screen.getByRole("button", { name: DEBT_SECTION }).getAttribute("aria-expanded")).toBe("false")
    expect(screen.getByRole("button", { name: COUNTERPARTY_SECTION }).getAttribute("aria-expanded")).toBe("false")
    expect(screen.getByRole("button", { name: DEFAULTS_SECTION }).getAttribute("aria-expanded")).toBe("false")
    expect(screen.getByRole("button", { name: NOTES_SECTION }).getAttribute("aria-expanded")).toBe("false")

    // Debt, counterparty/supplier, defaults, and notes/files fields are not mounted.
    expect(screen.queryByText("هل هذه دين؟")).toBeNull()
    expect(screen.queryByText("الجهة الخارجية")).toBeNull()
    expect(screen.queryByText("اسم المورد")).toBeNull()
    expect(screen.queryByText("المستودع الافتراضي")).toBeNull()
    expect(screen.queryByText("المشروع الافتراضي")).toBeNull()
    expect(screen.queryByText("ملاحظة")).toBeNull()
    expect(screen.queryByText("ملفات الفاتورة")).toBeNull()
  })

  it("reveals the counterparty/supplier fields only after opening their section", () => {
    renderPage()

    expect(screen.queryByText("الجهة الخارجية")).toBeNull()
    expect(screen.queryByText("اسم المورد")).toBeNull()

    openSection(COUNTERPARTY_SECTION)

    expect(screen.getByText("الجهة الخارجية")).not.toBeNull()
    expect(screen.getByText("اسم المورد")).not.toBeNull()
  })

  it("reveals the default warehouse/project fields only after opening their section", () => {
    renderPage()

    expect(screen.queryByText("المستودع الافتراضي")).toBeNull()
    expect(screen.queryByText("المشروع الافتراضي")).toBeNull()

    openSection(DEFAULTS_SECTION)

    expect(screen.getByText("المستودع الافتراضي")).not.toBeNull()
    expect(screen.getByText("المشروع الافتراضي")).not.toBeNull()
  })

  it("reveals the notes/files fields only after opening their section", () => {
    renderPage()

    expect(screen.queryByText("ملفات الفاتورة")).toBeNull()
    expect(screen.queryByText("ملاحظة")).toBeNull()

    openSection(NOTES_SECTION)

    expect(screen.getByText("ملاحظة")).not.toBeNull()
    expect(screen.getByText("ملفات الفاتورة")).not.toBeNull()
  })

  it("shows debt fields only when the debt section is opened and 'is this a debt?' is yes", () => {
    renderPage()

    // Collapsed: no debt select at all.
    expect(screen.queryByText("هل هذه دين؟")).toBeNull()

    openSection(DEBT_SECTION)

    // Opened but "لا": the debt select appears, payment fields stay hidden.
    expect(screen.getByText("هل هذه دين؟")).not.toBeNull()
    expect(screen.queryByText("طريقة الدفع")).toBeNull()
    expect(screen.queryByText("المدفوع الآن")).toBeNull()

    // Flip to "نعم": payment method + paid-now appear next to the debt select.
    fireEvent.change(screen.getByLabelText("هل هذه دين؟"), { target: { value: "YES" } })
    expect(screen.getByText("طريقة الدفع")).not.toBeNull()
    expect(screen.getByText("المدفوع الآن")).not.toBeNull()

    // Flip back to "لا": payment fields vanish again (as before the disclosure
    // change), while the debt select stays because the section is open.
    fireEvent.change(screen.getByLabelText("هل هذه دين؟"), { target: { value: "NO" } })
    expect(screen.queryByText("طريقة الدفع")).toBeNull()
    expect(screen.queryByText("المدفوع الآن")).toBeNull()
    expect(screen.getByText("هل هذه دين؟")).not.toBeNull()
  })

  it("keeps debt payment fields and values when the section is closed and reopened", () => {
    renderPage()

    openSection(DEBT_SECTION)
    fireEvent.change(screen.getByLabelText("هل هذه دين؟"), { target: { value: "YES" } })
    fireEvent.change(screen.getByLabelText("طريقة الدفع", { exact: false }), { target: { value: "PERCENT" } })
    fireEvent.change(screen.getByLabelText("النسبة المدفوعة"), { target: { value: "25" } })

    closeSection(DEBT_SECTION)
    expect(screen.queryByText("هل هذه دين؟")).toBeNull()

    // Reopening must restore the whole debt state: select, chosen option,
    // payment type and its paid-now value.
    openSection(DEBT_SECTION)
    expect(screen.getByText("هل هذه دين؟")).not.toBeNull()
    expect((screen.getByLabelText("هل هذه دين؟") as HTMLSelectElement).value).toBe("YES")
    expect((screen.getByLabelText("طريقة الدفع", { exact: false }) as HTMLSelectElement).value).toBe("PERCENT")
    expect((screen.getByLabelText("النسبة المدفوعة") as HTMLInputElement).value).toBe("25")
  })

  it("keeps the default warehouse selection when its section is closed and reopened", async () => {

    renderPage()

    openSection(DEFAULTS_SECTION)
    await selectHeaderComboboxOption("المستودع الافتراضي", "المستودع المركزي")

    // Collapse: the combobox unmounts with the section.
    closeSection(DEFAULTS_SECTION)
    expect(screen.queryByText("المستودع الافتراضي")).toBeNull()

    // Reopen: the header default selection must survive the unmount/remount.
    openSection(DEFAULTS_SECTION)
    expect(headerCombobox("المستودع الافتراضي").textContent).toContain("المستودع المركزي")
    expect(headerCombobox("المستودع الافتراضي").textContent).not.toContain("بدون مستودع")
  }, BASE_UI_TIMEOUT)

  it("keeps sections expanded when a line item is added or removed (re-render)", async () => {

    renderPage()

    openSection(DEBT_SECTION)
    openSection(COUNTERPARTY_SECTION)
    openSection(DEFAULTS_SECTION)
    openSection(NOTES_SECTION)

    // A re-render (adding a line) must not collapse any open section.
    await act(async () => {
      fireEvent.click(screen.getByText("إضافة مادة"))
    })

    expect(screen.getByRole("button", { name: DEBT_SECTION }).getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("button", { name: COUNTERPARTY_SECTION }).getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("button", { name: DEFAULTS_SECTION }).getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("button", { name: NOTES_SECTION }).getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("هل هذه دين؟")).not.toBeNull()
    expect(screen.getByText("المستودع الافتراضي")).not.toBeNull()

    // A re-render that removes a line must behave identically.
    await act(async () => {
      fireEvent.click(screen.getAllByText("حذف")[0]!)
    })
    expect(screen.getByRole("button", { name: DEBT_SECTION }).getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("button", { name: DEFAULTS_SECTION }).getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("هل هذه دين؟")).not.toBeNull()
  }, BASE_UI_TIMEOUT)

  it("submits debt + payment payload when the debt section is used", async () => {
    renderPage()

    openSection(DEBT_SECTION)
    fireEvent.change(screen.getByLabelText("هل هذه دين؟"), { target: { value: "YES" } })
    fireEvent.change(screen.getByLabelText("المدفوع الآن"), { target: { value: "1500.5" } })

    fireEvent.change(nativeSelectWithOption("مادة استهلاكية 1"), { target: { value: "def-1" } })

    const payload = await submitInvoice()
    expect(payload.createDebt).toBe(true)
    expect(payload.paymentInputType).toBe("AMOUNT")
    expect(payload.paidAmountDzd).toBe(1500.5)
    expect(payload.paidPercent).toBeNull()
  })
})