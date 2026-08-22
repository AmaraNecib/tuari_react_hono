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

describe("InventoryInvoiceCreatePage header-level default warehouse/project", () => {
  beforeEach(() => {
    mocks.itemDefinitionsQuery.mockReturnValue({ data: { items: DEFINITIONS } })
    mocks.warehousesQuery.mockReturnValue({ data: { items: WAREHOUSES } })
    mocks.projectsQuery.mockReturnValue({ data: { items: PROJECTS } })
    mocks.counterpartiesQuery.mockReturnValue({ data: { items: [] } })
    mocks.createInvoiceMutation.mutateAsync.mockResolvedValue({
      item: { group: { id: "inv-1" } },
      message: "تم إنشاء الفاتورة.",
    })
    mocks.uploadInvoiceAttachments.mockResolvedValue(undefined)
  })

  it("keeps the default warehouse selection visible and in form state across re-renders", async () => {
    renderPage()

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
  })

  it("keeps the default project selection visible across re-renders", async () => {
    renderPage()

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
  })

  it("applies the header defaults to a line item that leaves its own warehouse/project unset", async () => {
    renderPage()

    await selectHeaderComboboxOption("المستودع الافتراضي", "المستودع المركزي")

    // Fill the first (consumable) line: choose an item definition; leave its
    // warehouse/project on "default" so the header default must seed it.
    fireEvent.change(nativeSelectWithOption("مادة استهلاكية 1"), { target: { value: "def-1" } })

    const payload = await submitInvoice()
    expect(payload.warehouseId).toBe("wh-1")
    expect(payload.entries[0].warehouseId).toBe("wh-1")
    expect(payload.entries[0].projectId).toBeNull()
  })

  it("keeps a line item's own warehouse when it overrides the header default", async () => {
    renderPage()

    await selectHeaderComboboxOption("المستودع الافتراضي", "المستودع المركزي")

    fireEvent.change(nativeSelectWithOption("مادة استهلاكية 1"), { target: { value: "def-1" } })
    // The line's warehouse select is the native select listing warehouses.
    fireEvent.change(nativeSelectWithOption("مستودع المبيعات"), { target: { value: "wh-2" } })

    const payload = await submitInvoice()
    expect(payload.warehouseId).toBe("wh-1")
    expect(payload.entries[0].warehouseId).toBe("wh-2")
    expect(payload.entries[0].projectId).toBeNull()
  })

  it("does not seed the header warehouse into a line that picks its own project", async () => {
    renderPage()

    await selectHeaderComboboxOption("المستودع الافتراضي", "المستودع المركزي")

    fireEvent.change(nativeSelectWithOption("مادة استهلاكية 1"), { target: { value: "def-1" } })
    // Line picks its own project → must NOT inherit the header warehouse.
    fireEvent.change(nativeSelectWithOption("مشروع التوسعة"), { target: { value: "prj-1" } })

    const payload = await submitInvoice()
    expect(payload.entries[0].warehouseId).toBeNull()
    expect(payload.entries[0].projectId).toBe("prj-1")
  })

  it("seeds the header project into a line that leaves its own project unset", async () => {
    renderPage()

    await selectHeaderComboboxOption("المشروع الافتراضي", "مشروع التوسعة")

    // Fill the first (consumable) line: choose an item definition; leave its
    // warehouse/project on "default" so the header project must seed it.
    fireEvent.change(nativeSelectWithOption("مادة استهلاكية 1"), { target: { value: "def-1" } })

    const payload = await submitInvoice()
    expect(payload.projectId).toBe("prj-1")
    expect(payload.entries[0].projectId).toBe("prj-1")
    expect(payload.entries[0].warehouseId).toBeNull()
  })
})
