// @vitest-environment jsdom

import "@/i18n"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { showErrorToast } from "@/lib/toast"
import { getAlgeriaDateInputValue } from "@/lib/algeria-time"
import { InventoryInvoiceCreatePage } from "./inventory-invoice-create-page"

const mocks = vi.hoisted(() => ({
  itemDefinitionsQuery: vi.fn(),
  /** Every `useItemDefinitionOptionsQuery` call's usage, in render order. */
  itemDefinitionsQueryOptions: [] as Array<{ surface: string; kind?: "CONSUMABLE" | "ASSET" }>,
  warehousesQuery: vi.fn(),
  projectsQuery: vi.fn(),
  counterpartiesQuery: vi.fn(),
  createInvoiceMutation: { isPending: false, mutateAsync: vi.fn() },
  createWarehouseMutation: { isPending: false, mutateAsync: vi.fn() },
  createProjectMutation: { isPending: false, mutateAsync: vi.fn() },
  createCounterpartyMutation: { isPending: false, mutateAsync: vi.fn() },
  uploadInvoiceAttachments: vi.fn(),
}))

vi.mock("@/lib/toast", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

vi.mock("./inventory-hooks", () => ({
  // Mirror the usage-scoped offer filter so the test proves the page asks for
  // the right options AND renders only what is valid for the row type.
  useItemDefinitionOptionsQuery: (options: { usage: { surface: string; kind?: "CONSUMABLE" | "ASSET" } }) => {
    mocks.itemDefinitionsQueryOptions.push(options.usage)
    const items = mocks.itemDefinitionsQuery()?.data?.items ?? []
    const offered =
      options.usage.surface === "INVOICE_LINE"
        ? items.filter((item: { itemType?: string }) => item.itemType === options.usage.kind)
        : items
    return { options: offered, fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false }
  },
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
  { id: "def-asset", name: "أصل ثابت 1", itemType: "ASSET", unit: "قطعة", key: "asset_1" },
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

/** The nth row's type <select> (variant C puts the type first in the row). */
function lineTypeSelect(index = 0): HTMLSelectElement {
  return screen.getAllByLabelText("النوع", { exact: false })[index] as HTMLSelectElement
}

/** The nth row's item-definition <select>. */
function lineDefinitionSelect(index = 0): HTMLSelectElement {
  return screen.getAllByLabelText("تعريف العنصر", { exact: false })[index] as HTMLSelectElement
}

/** Sets the nth row's type. */
function setLineType(index: number, kind: "CONSUMABLE" | "ASSET") {
  fireEvent.change(lineTypeSelect(index), { target: { value: kind } })
}

/** Picks an item in the nth row. */
function selectLineDefinition(index: number, definitionId: string) {
  fireEvent.change(lineDefinitionSelect(index), { target: { value: definitionId } })
}

/** Types the nth row and picks one of its items (variant C: type first). */
function fillLine(index: number, kind: "CONSUMABLE" | "ASSET", definitionId: string) {
  setLineType(index, kind)
  selectLineDefinition(index, definitionId)
}

/** The option texts the nth row's item picker currently offers. */
function lineOptionTexts(index = 0): string[] {
  return Array.from(lineDefinitionSelect(index).options).map((option) => option.textContent ?? "")
}

/** Clicks the single add-line action. */
function addLine() {
  fireEvent.click(screen.getByRole("button", { name: "إضافة سطر" }))
}

/** Opens the nth DatePicker on the page and selects the given canonical day. */
function pickCalendarDate(isoDay: string, index = 0) {
  const triggers = document.querySelectorAll<HTMLElement>('[data-slot="popover-trigger"]')
  const trigger = triggers[index]
  if (!trigger) throw new Error(`no date picker trigger #${index}`)
  fireEvent.click(trigger)
  const cell = document.querySelector(`[data-day="${isoDay}"]`)
  if (!cell) throw new Error(`day ${isoDay} not found`)
  fireEvent.click(cell.querySelector("button") ?? (cell as HTMLElement))
}

/**
 * The page seeds its date fields with the UTC today; pick a different day in
 * that same month so the assertion proves the pick changed the value, even on
 * a run dated the 15th.
 */
function nonDefaultPickedDay() {
  const today = new Date().toISOString().slice(0, 10)
  return `${today.slice(0, 7)}-${today.endsWith("-15") ? "16" : "15"}`
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.itemDefinitionsQueryOptions.length = 0
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
      addLine()
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
      addLine()
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
    fillLine(0, "CONSUMABLE", "def-1")

    const payload = await submitInvoice()
    expect(payload.warehouseId).toBe("wh-1")
    expect(payload.entries[0].warehouseId).toBe("wh-1")
    expect(payload.entries[0].projectId).toBeNull()
  }, BASE_UI_TIMEOUT)

  it("keeps a line item's own warehouse when it overrides the header default", async () => {

    renderPage()

    openSection(DEFAULTS_SECTION)
    await selectHeaderComboboxOption("المستودع الافتراضي", "المستودع المركزي")

    fillLine(0, "CONSUMABLE", "def-1")
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

    fillLine(0, "CONSUMABLE", "def-1")
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
    fillLine(0, "CONSUMABLE", "def-1")

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
      addLine()
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

    fillLine(0, "CONSUMABLE", "def-1")

    const payload = await submitInvoice()
    expect(payload.createDebt).toBe(true)
    expect(payload.paymentInputType).toBe("AMOUNT")
    expect(payload.paidAmountDzd).toBe(1500.5)
    expect(payload.paidPercent).toBeNull()
  })

  // Issue #42: paid-value bounds must be validated before the payload reaches
  // the API. Each blocked test doubles as the unhandled-rejection guard:
  // vitest fails a run on an unhandled rejection, so clicking save with an
  // invalid paid value and observing the inline field error proves the submit
  // handler resolved instead of throwing through `void handleSubmit()`.
  it("blocks submitting a negative paid amount (issue #42)", () => {
    renderPage()

    // The line must be complete: an incomplete line now disables Save (it has
    // its own reason), which would stop the submit-path assertion below.
    fillLine(0, "CONSUMABLE", "def-1")
    openSection(DEBT_SECTION)
    fireEvent.change(screen.getByLabelText("هل هذه دين؟"), { target: { value: "YES" } })
    fireEvent.change(screen.getByLabelText("المدفوع الآن"), { target: { value: "-5" } })

    fireEvent.click(screen.getByText("حفظ الفاتورة"))

    expect(screen.getByText("المبلغ المدفوع يجب أن يكون صفرًا أو أكثر.")).not.toBeNull()
    expect(mocks.createInvoiceMutation.mutateAsync).not.toHaveBeenCalled()
  })

  it("blocks submitting a paid percent above 100 (issue #42)", () => {
    renderPage()

    fillLine(0, "CONSUMABLE", "def-1")
    openSection(DEBT_SECTION)
    fireEvent.change(screen.getByLabelText("هل هذه دين؟"), { target: { value: "YES" } })
    fireEvent.change(screen.getByLabelText("طريقة الدفع", { exact: false }), { target: { value: "PERCENT" } })
    fireEvent.change(screen.getByLabelText("النسبة المدفوعة"), { target: { value: "150" } })

    fireEvent.click(screen.getByText("حفظ الفاتورة"))

    expect(screen.getByText("النسبة المدفوعة يجب أن تكون بين 0 و 100.")).not.toBeNull()
    expect(mocks.createInvoiceMutation.mutateAsync).not.toHaveBeenCalled()
  })

  it("blocks submitting a negative paid percent (issue #42)", () => {
    renderPage()

    fillLine(0, "CONSUMABLE", "def-1")
    openSection(DEBT_SECTION)
    fireEvent.change(screen.getByLabelText("هل هذه دين؟"), { target: { value: "YES" } })
    fireEvent.change(screen.getByLabelText("طريقة الدفع", { exact: false }), { target: { value: "PERCENT" } })
    fireEvent.change(screen.getByLabelText("النسبة المدفوعة"), { target: { value: "-1" } })

    fireEvent.click(screen.getByText("حفظ الفاتورة"))

    expect(screen.getByText("النسبة المدفوعة يجب أن تكون بين 0 و 100.")).not.toBeNull()
    expect(mocks.createInvoiceMutation.mutateAsync).not.toHaveBeenCalled()
  })

  it("accepts the boundary paid values: amount 0 and percent 100 (issue #42)", async () => {
    renderPage()

    openSection(DEBT_SECTION)
    fireEvent.change(screen.getByLabelText("هل هذه دين؟"), { target: { value: "YES" } })
    fireEvent.change(screen.getByLabelText("المدفوع الآن"), { target: { value: "0" } })
    fillLine(0, "CONSUMABLE", "def-1")

    const amountPayload = await submitInvoice()
    expect(amountPayload.paidAmountDzd).toBe(0)

    // Percent mode at the upper boundary still submits.
    mocks.createInvoiceMutation.mutateAsync.mockClear()
    fireEvent.change(screen.getByLabelText("طريقة الدفع", { exact: false }), { target: { value: "PERCENT" } })
    fireEvent.change(screen.getByLabelText("النسبة المدفوعة"), { target: { value: "100" } })

    const percentPayload = await submitInvoice()
    expect(percentPayload.paidPercent).toBe(100)
  })

  it("shows a retry action and does not navigate when attachment upload fails (duplicate-invoice guard)", async () => {
    const { onCreated } = renderPage()

    // The invoice is created first; only the attachment upload rejects. The
    // user must see a clear error, must NOT be navigated away past an
    // invisible partial save, and the Save button must disappear so a second
    // save click can never re-run the creation mutation.
    mocks.uploadInvoiceAttachments.mockRejectedValue(new Error("تعذر رفع ملفات الفاتورة."))

    openSection(NOTES_SECTION)
    fireEvent.change(screen.getByLabelText("ملفات الفاتورة", { exact: false }), {
      target: { files: [new File(["bytes"], "facture.pdf", { type: "application/pdf" })] },
    })
    fillLine(0, "CONSUMABLE", "def-1")

    fireEvent.click(screen.getByText("حفظ الفاتورة"))

    await waitFor(() => {
      expect(mocks.createInvoiceMutation.mutateAsync).toHaveBeenCalledTimes(1)
      // The upload error's own message is surfaced (in production the server
      // message names the offending file), not a fixed generic string.
      expect(showErrorToast).toHaveBeenCalledWith("تعذر رفع ملفات الفاتورة.")
    })
    expect(onCreated).not.toHaveBeenCalled()
    // Save is gone; only the retry action can be used from now on.
    expect(screen.queryByText("حفظ الفاتورة")).toBeNull()
    expect(screen.getByRole("button", { name: "إعادة محاولة رفع المرفقات" })).not.toBeNull()
  })

  it("retries the attachment upload with the SAME invoice id without re-creating it", async () => {
    const { onCreated } = renderPage()
    const attachment = new File(["bytes"], "facture.pdf", { type: "application/pdf" })

    mocks.uploadInvoiceAttachments.mockRejectedValueOnce(new Error("تعذر رفع ملفات الفاتورة."))

    openSection(NOTES_SECTION)
    fireEvent.change(screen.getByLabelText("ملفات الفاتورة", { exact: false }), {
      target: { files: [attachment] },
    })
    fillLine(0, "CONSUMABLE", "def-1")

    // First save: invoice created, upload fails.
    fireEvent.click(screen.getByText("حفظ الفاتورة"))
    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalled()
      expect(screen.getByRole("button", { name: "إعادة محاولة رفع المرفقات" })).not.toBeNull()
    })

    // Second attempt must hit ONLY the upload path, with the same invoice id.
    mocks.uploadInvoiceAttachments.mockResolvedValueOnce(undefined)
    fireEvent.click(screen.getByRole("button", { name: "إعادة محاولة رفع المرفقات" }))

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith("inv-1")
    })
    // Creation ran exactly once; the retry re-used the created invoice id.
    expect(mocks.createInvoiceMutation.mutateAsync).toHaveBeenCalledTimes(1)
    expect(mocks.uploadInvoiceAttachments).toHaveBeenCalledTimes(2)
    expect(mocks.uploadInvoiceAttachments).toHaveBeenNthCalledWith(2, "inv-1", [attachment])
  })

  it("stays in retry state when the retried upload fails again", async () => {
    const { onCreated } = renderPage()

    mocks.uploadInvoiceAttachments.mockRejectedValue(new Error("تعذر رفع ملفات الفاتورة."))

    openSection(NOTES_SECTION)
    fireEvent.change(screen.getByLabelText("ملفات الفاتورة", { exact: false }), {
      target: { files: [new File(["bytes"], "facture.pdf", { type: "application/pdf" })] },
    })
    fillLine(0, "CONSUMABLE", "def-1")

    fireEvent.click(screen.getByText("حفظ الفاتورة"))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "إعادة محاولة رفع المرفقات" })).not.toBeNull()
    })
    expect(showErrorToast).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "إعادة محاولة رفع المرفقات" }))

    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledTimes(2)
    })
    // Still no navigation, still no re-creation, still in retry state.
    expect(onCreated).not.toHaveBeenCalled()
    expect(mocks.createInvoiceMutation.mutateAsync).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "إعادة محاولة رفع المرفقات" })).not.toBeNull()
  })

  it("does not navigate when the invoice creation mutation rejects (review fix)", async () => {
    const { onCreated } = renderPage()

    mocks.createInvoiceMutation.mutateAsync.mockRejectedValue(new Error("تعذر إنشاء الفاتورة."))
    fillLine(0, "CONSUMABLE", "def-1")

    fireEvent.click(screen.getByText("حفظ الفاتورة"))

    await waitFor(() => {
      expect(mocks.createInvoiceMutation.mutateAsync).toHaveBeenCalled()
    })
    // Let the rejected mutateAsync settle through handleSubmit's catch.
    await act(async () => {})
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe("InventoryInvoiceCreatePage save reason and attachment validation", () => {
  beforeEach(() => mockQueries())

  it("explains why Save is disabled for an incomplete line and for no lines", () => {
    renderPage()

    const saveButton = () => screen.getByRole("button", { name: "حفظ الفاتورة" }) as HTMLButtonElement

    // Default single empty row: Save is dead and names the missing type.
    expect(saveButton().disabled).toBe(true)
    expect(screen.getByText("اختر نوع السطر 1.")).not.toBeNull()

    // Choosing a type moves the reason to the item.
    setLineType(0, "CONSUMABLE")
    expect(screen.queryByText("اختر نوع السطر 1.")).toBeNull()
    expect(screen.getByText("اختر تعريف العنصر في السطر 1.")).not.toBeNull()

    fillLine(0, "CONSUMABLE", "def-1")
    expect(saveButton().disabled).toBe(false)
    expect(screen.queryByText("اختر تعريف العنصر في السطر 1.")).toBeNull()

    // Delete every line: the reason becomes the no-lines one.
    fireEvent.click(screen.getAllByText("حذف")[0]!)
    expect(saveButton().disabled).toBe(true)
    expect(screen.getByText("أضف سطرًا واحدًا على الأقل قبل الحفظ.")).not.toBeNull()
  })

  it("names the second incomplete line in the disabled reason", () => {
    renderPage()

    fillLine(0, "CONSUMABLE", "def-1")
    addLine()

    // The new row is untyped first, then its item is the incomplete field.
    expect(screen.getByText("اختر نوع السطر 2.")).not.toBeNull()
    setLineType(1, "CONSUMABLE")

    expect((screen.getByRole("button", { name: "حفظ الفاتورة" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("اختر تعريف العنصر في السطر 2.")).not.toBeNull()
  })

  it("rejects an unsupported attachment by name before creating the invoice", async () => {
    const { onCreated } = renderPage()

    fillLine(0, "CONSUMABLE", "def-1")
    openSection(NOTES_SECTION)
    fireEvent.change(screen.getByLabelText("ملفات الفاتورة", { exact: false }), {
      target: { files: [new File(["hello"], "notes.txt", { type: "text/plain" })] },
    })

    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("notes.txt")
    expect(alert.textContent).toContain("غير مدعوم")

    fireEvent.click(screen.getByText("حفظ الفاتورة"))

    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(expect.stringContaining("notes.txt"))
    })
    expect(mocks.createInvoiceMutation.mutateAsync).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it("rejects an oversized attachment by name", () => {
    renderPage()

    openSection(NOTES_SECTION)
    fireEvent.change(screen.getByLabelText("ملفات الفاتورة", { exact: false }), {
      target: {
        files: [new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" })],
      },
    })

    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("big.pdf")
    expect(alert.textContent).toContain("5")
  })

  it("surfaces the server upload rejection that names the file", async () => {
    const { onCreated } = renderPage()

    mocks.uploadInvoiceAttachments.mockRejectedValue(new Error("حجم الملف كبير جدًا: facture.pdf"))

    fillLine(0, "CONSUMABLE", "def-1")
    openSection(NOTES_SECTION)
    fireEvent.change(screen.getByLabelText("ملفات الفاتورة", { exact: false }), {
      target: { files: [new File(["bytes"], "facture.pdf", { type: "application/pdf" })] },
    })

    fireEvent.click(screen.getByText("حفظ الفاتورة"))

    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith("حجم الملف كبير جدًا: facture.pdf")
    })
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe("InventoryInvoiceCreatePage row type (items 13 + 12)", () => {
  beforeEach(() => mockQueries())

  it("offers exactly one add action; the two old buttons are gone", () => {
    renderPage()

    expect(screen.getAllByRole("button", { name: "إضافة سطر" })).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "إضافة مادة" })).toBeNull()
    expect(screen.queryByRole("button", { name: "إضافة أصل" })).toBeNull()
  })

  it("starts a new row with a type control and blocks save without a type", () => {
    renderPage()

    // The row starts untyped, and the item picker is disabled with a reason
    // rather than silently offering everything.
    expect(lineTypeSelect(0).value).toBe("")
    expect(lineDefinitionSelect(0).disabled).toBe(true)
    expect(lineDefinitionSelect(0).options[0]?.textContent).toBe("اختر النوع أولًا")

    expect((screen.getByRole("button", { name: "حفظ الفاتورة" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("اختر نوع السطر 1.")).not.toBeNull()

    // Choosing a type enables the picker and moves the reason to the item.
    setLineType(0, "CONSUMABLE")
    expect(lineDefinitionSelect(0).disabled).toBe(false)
    expect(screen.getByText("اختر تعريف العنصر في السطر 1.")).not.toBeNull()
  })

  it("filters the item options by the row type, requesting the server-side filter", () => {
    renderPage()

    setLineType(0, "CONSUMABLE")
    expect(lineOptionTexts(0)).toContain("مادة استهلاكية 1")
    expect(lineOptionTexts(0)).not.toContain("أصل ثابت 1")

    setLineType(0, "ASSET")
    expect(lineOptionTexts(0)).toContain("أصل ثابت 1")
    expect(lineOptionTexts(0)).not.toContain("مادة استهلاكية 1")

    // The usage (which the hook turns into a server-side offer filter) is what
    // the page asks for; it never filters a full list in the browser.
    expect(mocks.itemDefinitionsQueryOptions).toEqual(
      expect.arrayContaining([
        { surface: "INVOICE_LINE", kind: "CONSUMABLE" },
        { surface: "INVOICE_LINE", kind: "ASSET" },
      ]),
    )
  })

  it("clears the chosen item when the row type changes", () => {
    renderPage()

    setLineType(0, "CONSUMABLE")
    selectLineDefinition(0, "def-1")
    expect(lineDefinitionSelect(0).value).toBe("def-1")

    setLineType(0, "ASSET")
    expect(lineDefinitionSelect(0).value).toBe("")

    selectLineDefinition(0, "def-asset")
    expect(lineDefinitionSelect(0).value).toBe("def-asset")
    setLineType(0, "CONSUMABLE")
    expect(lineDefinitionSelect(0).value).toBe("")
  })

  it("clears the per-row item search when the row type changes", () => {
    renderPage()

    setLineType(0, "CONSUMABLE")
    const search = screen.getByLabelText("ابحث عن عنصر...") as HTMLInputElement
    fireEvent.change(search, { target: { value: "إسمنت" } })
    expect(search.value).toBe("إسمنت")

    // A search typed for the consumable kind must not follow the row into the
    // asset kind — it would hide every asset option behind a stale term.
    setLineType(0, "ASSET")
    expect((screen.getByLabelText("ابحث عن عنصر...") as HTMLInputElement).value).toBe("")
  })

  it("does not rewrite the row type from the picked item", async () => {
    renderPage()

    setLineType(0, "CONSUMABLE")
    selectLineDefinition(0, "def-1")

    // The kind is the row's own intent; a pick must not derive it back from the
    // definition (the inversion the item-offer seam removed).
    expect(lineTypeSelect(0).value).toBe("CONSUMABLE")
    const payload = await submitInvoice()
    expect(payload.entries[0].kind).toBe("CONSUMABLE")
    expect(payload.entries[0].itemDefinitionId).toBe("def-1")
  })

  it("places the add action after the line rows in the DOM order", () => {
    renderPage()

    const firstRow = screen.getByText("العنصر 1")
    const addAction = screen.getByRole("button", { name: "إضافة سطر" })

    expect(firstRow.compareDocumentPosition(addAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe("InventoryInvoiceCreatePage date pickers submit canonical days (#428)", () => {
  beforeEach(() => mockQueries())

  it("submits the picked invoice date on the picked Algeria day", async () => {
    // The page seeds the picker with the UTC today, so pick inside that month.
    const pickedDay = nonDefaultPickedDay()
    expect(pickedDay).not.toBe(new Date().toISOString().slice(0, 10))
    renderPage()
    fillLine(0, "CONSUMABLE", "def-1")

    pickCalendarDate(pickedDay)

    const payload = await submitInvoice()
    // Convention-agnostic: the submitted instant must land on the picked
    // Algeria day. The page converts via UTC today; #440 aligns it with the
    // Algeria business day. Both land on the same Algeria day, so this holds
    // either way and does not pin the UTC string.
    expect(getAlgeriaDateInputValue(new Date(payload.invoiceDate))).toBe(pickedDay)
  })

  it("submits the picked asset purchase date on the picked Algeria day", async () => {
    const pickedDay = nonDefaultPickedDay()
    renderPage()

    fillLine(0, "CONSUMABLE", "def-1")
    addLine()
    fillLine(1, "ASSET", "def-asset")

    // Picker #1 is the asset's purchase date; picker #0 is the invoice date.
    pickCalendarDate(pickedDay, 1)

    const payload = await submitInvoice()
    const assetLine = (payload.entries as Array<{ kind: string; assets?: Array<{ purchaseDate: string | null }> }>).find(
      (entry) => entry.kind === "ASSET",
    )
    const purchaseDate = assetLine?.assets?.[0]?.purchaseDate
    expect(purchaseDate).toBeTruthy()
    // See the invoice-date case: assert the Algeria day, not the UTC string,
    // so #440 can change the conversion without rewriting this test.
    expect(getAlgeriaDateInputValue(new Date(purchaseDate as string))).toBe(pickedDay)
  })
})
