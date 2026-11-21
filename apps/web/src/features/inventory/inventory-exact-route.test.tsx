// @vitest-environment jsdom
import "@/i18n"
import { i18n } from "@/i18n"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { exactInventoryInvoiceCreateSchema, exactInventoryDetailSchema, inventoryItemDefinitionSchema, type ExactInventoryClient } from "@tuari/contracts"
import { HomeViewPageDetailContent } from "@/features/app-shell/home-view-page-content-detail-pages"
import { sessionQueryKey } from "@/features/app-shell/workspace-keys"
import { buildHomeViewCopy } from "@/features/app-shell/home-view-copy"
const mocks = vi.hoisted(() => ({ inventory: {} as Record<string, ReturnType<typeof vi.fn>>, generic: vi.fn(), upload: vi.fn(), download: vi.fn(), desktop: false }))
vi.mock("@/lib/orpc-client", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/orpc-client")>(), financialClient: { inventory: mocks.inventory, invoices: { getInvoice: mocks.generic, listInvoices: vi.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }), listPayments: vi.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }) } } }))
vi.mock("./inventory-hooks", () => ({ uploadInvoiceAttachments: mocks.upload }))
vi.mock("@/lib/desktop-api-bridge", () => ({ downloadDesktopApiFile: mocks.download }))
vi.mock("@/lib/desktop-auth-session", () => ({ isDesktopRuntime: () => mocks.desktop }))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "operator" } } }) }))
const date = "2026-11-10T00:00:00.000Z"
const group = { id: "purchase-group", invoiceNumber: "PUR-7", supplierName: null, invoiceDate: date, warehouseId: "warehouse", projectId: null, externalCounterpartyId: null, grossTotalDzd: "1.00", paidAmountDzd: "1.00", remainingDebtDzd: "0.00", debtAccountId: null, debtEntryId: null, currency: "DZD", note: null, createdAt: date, updatedAt: date }
const detail = () => exactInventoryDetailSchema.parse({ group, entries: [], attachments: [], movements: [], consumableBalances: [] })
const file = { id: "attachment", invoiceGroupId: group.id, originalName: "invoice.pdf", mimeType: "application/pdf", byteSize: 1, storageKey: "invoice.pdf", relativePath: "invoice.pdf", downloadUrl: "/api/inventory/attachments/attachment", sha256: null, createdAt: date }
const material = inventoryItemDefinitionSchema.parse({ id: "material", name: "Material", itemType: "CONSUMABLE", unit: "m", isActive: true, description: null, createdAt: date, updatedAt: date })
const clients: QueryClient[] = []
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const selectedReceipt = () => new File(["receipt"], "a.pdf", { type: "application/pdf" })
const fileInput = () => screen.getByLabelText("ملفات الفاتورة") as HTMLInputElement
const saveButton = () => screen.getByRole("button", { name: "حفظ" }) as HTMLButtonElement
async function openPurchase(number: string) {
  fireEvent.click(screen.getByRole("button", { name: `تفاصيل ${number}` }))
  await screen.findByRole("heading", { name: `تفاصيل ${number}` })
}
afterEach(() => { cleanup(); clients.splice(0).forEach(query => query.clear()); vi.clearAllMocks(); mocks.desktop = false })
function mount(page: "invoice-details" | "invoice-create" | "invoices" = "invoice-details") {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(query)
  query.setQueryData(sessionQueryKey, { user: { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0" } })
  const props = { page, selectedInvoiceId: group.id, copy: buildHomeViewCopy(i18n.t.bind(i18n)), derived: { roles: [], warehouses: [{ id: "warehouse", name: "Warehouse" }], projects: [], employeeRows: [], externalCounterparties: [{ id: "party", fullName: "Supplier" }] }, navigation: {}, t: i18n.t.bind(i18n) } as unknown as Parameters<typeof HomeViewPageDetailContent>[0]
  return render(<QueryClientProvider client={query}><HomeViewPageDetailContent {...props} /></QueryClientProvider>)
}
function setup() {
  Object.assign(mocks.inventory, { listInvoices: vi.fn().mockResolvedValue([group]), getInvoice: vi.fn().mockResolvedValue(detail()), definitions: vi.fn().mockResolvedValue([material]), listOutbounds: vi.fn().mockResolvedValue([]), locationContents: vi.fn().mockResolvedValue({ assets: [], consumables: [] }), createInvoice: vi.fn().mockResolvedValue(detail()) } satisfies Partial<Record<keyof ExactInventoryClient, unknown>>)
}
it("mounts search purchase IDs on the inventory detail source, never generic invoices, and lists/downloads after remount", async () => {
  setup(); mocks.inventory.getInvoice!.mockResolvedValue({ ...detail(), attachments: [file] })
  const view = mount()
  const link = await screen.findByRole("link", { name: "invoice.pdf" })
  expect(link.getAttribute("href")).toContain("/api/inventory/attachments/attachment")
  expect(mocks.inventory.getInvoice).toHaveBeenCalledWith({ id: group.id })
  expect(mocks.generic).not.toHaveBeenCalled()
  view.unmount(); mocks.desktop = true; mount()
  fireEvent.click(await screen.findByRole("button", { name: "invoice.pdf" }))
  await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(expect.stringContaining("/api/inventory/attachments/attachment"), "invoice.pdf"))
})
it.each([false, true])("mounts create, freezes the created group on failed upload, retries without another writer, then fetches detail/list (Notes collapsed=%s)", async notesCollapsed => {
  setup(); mocks.upload.mockRejectedValueOnce(new Error("upload failed")).mockResolvedValueOnce([])
  const created = exactInventoryDetailSchema.parse({ ...detail(), group: { ...group, externalCounterpartyId: "party", supplierName: "Supplier", grossTotalDzd: "1.23", paidAmountDzd: "0.30", remainingDebtDzd: "0.93", debtEntryId: "debt-entry", note: "expanded note" }, attachments: [file] })
  mocks.inventory.createInvoice!.mockResolvedValue(created)
  mocks.inventory.listInvoices!.mockResolvedValue([created.group])
  mocks.inventory.getInvoice!.mockResolvedValue(created)
  mount("invoice-create")
  const dialog = await screen.findByRole("dialog")
  fireEvent.change(within(dialog).getByRole("textbox", { name: "سعر الوحدة" }), { target: { value: "1.2345" } })
  for (const name of ["تسجيل الشراء كدين على الشركة", "الطرف الخارجي", "الوجهة الافتراضية", "ملاحظات"]) fireEvent.click(within(dialog).getByRole("button", { name }))
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "تسجيل الشراء كدين على الشركة" }))
  fireEvent.change(within(dialog).getByRole("textbox", { name: "الدفعة الأولى، اختياري" }), { target: { value: "0.30" } })
  fireEvent.change(within(dialog).getByRole("textbox", { name: "ملاحظة" }), { target: { value: "expanded note" } })
  const receipt = new File(["x"], "invoice.pdf", { type: "application/pdf" })
  fireEvent.change(within(dialog).getByLabelText("ملفات الفاتورة"), { target: { files: [receipt] } })
  const notes = within(dialog).getByRole("button", { name: "ملاحظات" })
  if (notesCollapsed) {
    fireEvent.click(notes)
    expect(within(dialog).queryByLabelText("ملفات الفاتورة")).toBeNull()
  }
  const save = within(dialog).getByRole("button", { name: "حفظ الفاتورة والمخزون" }) as HTMLButtonElement
  expect(save.disabled).toBe(false)
  expect(save.form?.checkValidity()).toBe(true)
  fireEvent.click(save)
  await waitFor(() => expect(mocks.inventory.createInvoice).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1))
  const command = exactInventoryInvoiceCreateSchema.parse(mocks.inventory.createInvoice!.mock.calls[0]![0])
  expect(command).toMatchObject({ warehouseId: "warehouse", createDebt: true, externalCounterpartyId: "party", supplierName: "Supplier", paidAmountDzd: "0.30", note: "expanded note", entries: [{ unitPriceDzd: "1.2345" }] })
  const alert = await within(dialog).findByRole("alert")
  expect(alert.textContent).toBe("upload failed")
  expect(alert.closest("fieldset")).toBeNull()
  expect(within(dialog).getAllByRole("alert")).toHaveLength(1)
  expect(within(dialog).getAllByText("upload failed")).toHaveLength(1)
  expect((notes.closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true)
  expect(notes.getAttribute("aria-expanded")).toBe(String(!notesCollapsed))
  expect(mocks.upload).toHaveBeenNthCalledWith(1, group.id, [receipt])
  fireEvent.click(within(dialog).getByRole("button", { name: /إعادة.*رفع/ }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(mocks.inventory.createInvoice).toHaveBeenCalledTimes(1)
  expect(mocks.upload).toHaveBeenNthCalledWith(2, group.id, [receipt])
  expect(await screen.findByRole("link", { name: "invoice.pdf" })).toBeTruthy()
  expect(screen.getByText("0.93")).toBeTruthy()
})
it("uploads from mounted detail, retries against the same group, and refetches its attachment list", async () => {
  setup(); mocks.upload.mockRejectedValueOnce(new Error("retry upload")).mockResolvedValueOnce([])
  mount()
  await screen.findByRole("heading", { name: "تفاصيل PUR-7" })
  const selectedFile = new File(["x"], "invoice.pdf", { type: "application/pdf" })
  fireEvent.change(screen.getByLabelText("ملفات الفاتورة"), { target: { files: [selectedFile] } })
  fireEvent.click(screen.getByRole("button", { name: "حفظ" }))
  await screen.findByText("retry upload")
  mocks.inventory.getInvoice!.mockResolvedValue({ ...detail(), attachments: [file] })
  fireEvent.click(screen.getByRole("button", { name: /إعادة.*رفع/ }))
  expect(await screen.findByRole("link", { name: "invoice.pdf" })).toBeTruthy()
  expect(mocks.upload).toHaveBeenNthCalledWith(2, group.id, [selectedFile])
  expect(mocks.inventory.getInvoice!.mock.calls.length).toBeGreaterThan(1)
})

it.each([false, true])("isolates selected receipt and failed retry when switching to cached B (failed=%s)", async failed => {
  setup()
  const b = { ...group, id: "purchase-b", invoiceNumber: "PUR-B" }
  mocks.inventory.listInvoices!.mockResolvedValue([group, b])
  mocks.inventory.getInvoice!.mockImplementation(({ id }) => Promise.resolve({ ...detail(), group: id === b.id ? b : group }))
  mocks.upload.mockRejectedValue(new Error("A upload failed"))
  mount("invoices")
  await screen.findByRole("button", { name: "تفاصيل PUR-B" })
  await openPurchase("PUR-B")
  await openPurchase("PUR-7")
  fireEvent.change(fileInput(), { target: { files: [selectedReceipt()] } })
  if (failed) {
    fireEvent.click(saveButton())
    await screen.findByText("A upload failed")
  }
  await openPurchase("PUR-B")
  expect(fileInput().files?.length).toBe(0)
  expect(screen.queryByText("A upload failed")).toBeNull()
  expect(saveButton().disabled).toBe(true)
  fireEvent.click(saveButton())
  expect(mocks.upload).toHaveBeenCalledTimes(failed ? 1 : 0)
})
it("keeps Save and replacement guarded through authoritative reload", async () => {
  setup(); mocks.upload.mockResolvedValue([])
  const reload = deferred<ReturnType<typeof detail>>()
  mocks.inventory.getInvoice!.mockResolvedValueOnce(detail()).mockReturnValueOnce(reload.promise)
  mount()
  await screen.findByRole("heading", { name: "تفاصيل PUR-7" })
  const original = selectedReceipt()
  fireEvent.change(fileInput(), { target: { files: [original] } })
  const save = saveButton()
  fireEvent.click(save)
  await waitFor(() => expect(mocks.inventory.getInvoice).toHaveBeenCalledTimes(2))
  expect(fileInput().disabled).toBe(true)
  expect(save.disabled).toBe(true)
  fireEvent.click(save)
  expect(mocks.upload).toHaveBeenCalledTimes(1)
  await act(async () => reload.resolve({ ...detail(), attachments: [file] }))
  expect(await screen.findByRole("link", { name: "invoice.pdf" })).toBeTruthy()
  await waitFor(() => expect(fileInput().disabled).toBe(false))
  expect(saveButton().disabled).toBe(true)
  const next = new File(["next"], "next.pdf", { type: "application/pdf" })
  fireEvent.change(fileInput(), { target: { files: [next] } })
  mocks.inventory.getInvoice!.mockResolvedValue({ ...detail(), attachments: [file] })
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2))
  expect(mocks.upload).toHaveBeenLastCalledWith(group.id, [next])
})
it("recovers a failed reconciliation by refetch only, without hiding the editor or reuploading", async () => {
  setup(); mocks.upload.mockResolvedValue([])
  mocks.inventory.getInvoice!.mockResolvedValueOnce(detail()).mockRejectedValueOnce(new Error("reload failed"))
  mount()
  await screen.findByRole("heading", { name: "تفاصيل PUR-7" })
  fireEvent.change(fileInput(), { target: { files: [selectedReceipt()] } })
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.inventory.getInvoice).toHaveBeenCalledTimes(2))
  await screen.findByRole("alert")
  expect(fileInput().disabled).toBe(true)
  const retry = screen.getByRole("button", { name: i18n.t("common.retry") })
  const reload = deferred<ReturnType<typeof detail>>()
  mocks.inventory.getInvoice!.mockReturnValueOnce(reload.promise)
  fireEvent.click(retry)
  await waitFor(() => expect(mocks.inventory.getInvoice).toHaveBeenCalledTimes(3))
  expect((retry as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(retry)
  expect(mocks.inventory.getInvoice).toHaveBeenCalledTimes(3)
  await act(async () => reload.resolve({ ...detail(), attachments: [file] }))
  expect(await screen.findByRole("link", { name: "invoice.pdf" })).toBeTruthy()
  expect(mocks.upload).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(fileInput().disabled).toBe(false))
})
it("retains initial create intent through definitions failure and retry with a valid initial item", async () => {
  setup()
  const definitions = [material]
  const request = deferred<typeof definitions>()
  mocks.inventory.definitions!.mockReturnValueOnce(request.promise).mockResolvedValueOnce(definitions)
  mount("invoice-create")
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(await screen.findByText("جارٍ تحميل دليل العناصر...")).toBeTruthy()
  await act(async () => request.reject(new Error("definitions failed")))
  const alert = await screen.findByRole("alert")
  expect(alert.textContent).toContain("تعذر تحميل دليل العناصر.")
  fireEvent.click(within(alert).getByRole("button", { name: i18n.t("common.retry") }))
  const dialog = await screen.findByRole("dialog")
  fireEvent.change(within(dialog).getByRole("textbox", { name: "سعر الوحدة" }), { target: { value: "1" } })
  expect((within(dialog).getByRole("button", { name: "حفظ الفاتورة والمخزون" }) as HTMLButtonElement).disabled).toBe(false)
  expect(mocks.inventory.definitions).toHaveBeenCalledTimes(2)
})

it("keeps an in-flight A completion from clearing or reloading cached B", async () => {
  setup()
  const b = { ...group, id: "purchase-b", invoiceNumber: "PUR-B" }
  mocks.inventory.listInvoices!.mockResolvedValue([group, b])
  mocks.inventory.getInvoice!.mockImplementation(({ id }) => Promise.resolve({ ...detail(), group: id === b.id ? b : group }))
  const upload = deferred<unknown[]>()
  mocks.upload.mockReturnValueOnce(upload.promise).mockResolvedValue([])
  mount("invoices")
  await screen.findByRole("button", { name: "تفاصيل PUR-B" })
  await openPurchase("PUR-B")
  await openPurchase("PUR-7")
  const aFile = selectedReceipt()
  fireEvent.change(fileInput(), { target: { files: [aFile] } })
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1))
  await openPurchase("PUR-B")
  const bFile = new File(["B"], "b.pdf", { type: "application/pdf" })
  fireEvent.change(fileInput(), { target: { files: [bFile] } })
  const bReads = mocks.inventory.getInvoice!.mock.calls.filter(([input]) => input.id === b.id).length
  await act(async () => upload.resolve([]))
  expect(fileInput().files?.[0]).toBe(bFile)
  expect(saveButton().disabled).toBe(false)
  expect(mocks.inventory.getInvoice!.mock.calls.filter(([input]) => input.id === b.id)).toHaveLength(bReads)
  fireEvent.click(saveButton())
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2))
  expect(mocks.upload).toHaveBeenNthCalledWith(1, group.id, [aFile])
  expect(mocks.upload).toHaveBeenNthCalledWith(2, b.id, [bFile])
})
