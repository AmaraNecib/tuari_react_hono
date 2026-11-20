// @vitest-environment jsdom
import "@/i18n"
import { i18n } from "@/i18n"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { exactInventoryDetailSchema, inventoryItemDefinitionSchema, type ExactInventoryClient } from "@tuari/contracts"
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
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.splice(0).forEach(query => query.clear()); vi.clearAllMocks(); mocks.desktop = false })
function mount(page: "invoice-details" | "invoice-create" | "invoices" = "invoice-details") {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(query)
  query.setQueryData(sessionQueryKey, { user: { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0" } })
  const props = { page, selectedInvoiceId: group.id, copy: buildHomeViewCopy(i18n.t.bind(i18n)), derived: { roles: [], warehouses: [{ id: "warehouse", name: "Warehouse" }], projects: [], employeeRows: [], externalCounterparties: [] }, navigation: {}, t: i18n.t.bind(i18n) } as unknown as Parameters<typeof HomeViewPageDetailContent>[0]
  return render(<QueryClientProvider client={query}><HomeViewPageDetailContent {...props} /></QueryClientProvider>)
}
function setup() {
  Object.assign(mocks.inventory, { listInvoices: vi.fn().mockResolvedValue([group]), getInvoice: vi.fn().mockResolvedValue(detail()), definitions: vi.fn().mockResolvedValue([inventoryItemDefinitionSchema.parse({ id: "material", name: "Material", itemType: "CONSUMABLE", unit: "m", isActive: true, description: null, createdAt: date, updatedAt: date })]), listOutbounds: vi.fn().mockResolvedValue([]), locationContents: vi.fn().mockResolvedValue({ assets: [], consumables: [] }), createInvoice: vi.fn().mockResolvedValue(detail()) } satisfies Partial<Record<keyof ExactInventoryClient, unknown>>)
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
it("mounts create, freezes the created group on failed upload, retries without another writer, then fetches detail/list", async () => {
  setup(); mocks.upload.mockRejectedValueOnce(new Error("upload failed")).mockResolvedValueOnce([])
  mocks.inventory.getInvoice!.mockResolvedValue({ ...detail(), attachments: [file] })
  mount("invoice-create")
  const dialog = await screen.findByRole("dialog")
  fireEvent.change(within(dialog).getByRole("textbox", { name: "سعر الوحدة" }), { target: { value: "1" } })
  fireEvent.change(within(dialog).getByLabelText("ملفات الفاتورة"), { target: { files: [new File(["x"], "invoice.pdf", { type: "application/pdf" })] } })
  const save = within(dialog).getByRole("button", { name: "حفظ الفاتورة والمخزون" }) as HTMLButtonElement
  expect(save.disabled).toBe(false)
  expect(save.form?.checkValidity()).toBe(true)
  fireEvent.click(save)
  await waitFor(() => expect(mocks.inventory.createInvoice).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1))
  await screen.findByText("upload failed")
  fireEvent.click(within(dialog).getByRole("button", { name: /إعادة.*رفع/ }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(mocks.inventory.createInvoice).toHaveBeenCalledTimes(1)
  expect(mocks.upload).toHaveBeenNthCalledWith(2, group.id, expect.arrayContaining([expect.any(File)]))
  expect(await screen.findByRole("link", { name: "invoice.pdf" })).toBeTruthy()
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
