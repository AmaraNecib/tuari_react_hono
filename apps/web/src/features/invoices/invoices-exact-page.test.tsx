// @vitest-environment jsdom
import "@/i18n"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ExactInvoicesClient, ExactInvoice } from "@tuari/contracts"
import { sessionQueryKey, workspaceQueryKeys } from "@/features/app-shell/workspace-keys"
import { ExactInvoicesPage } from "./invoices-exact-page"
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "operator" } } }) }))
const party = { id: "party", label: "المورد أحمد", type: "EXTERNAL_COUNTERPARTY" as const }
const date = "2026-11-10T00:00:00.000Z"
const invoice: ExactInvoice = { id: "invoice", invoiceNumber: "INV-1", supplierName: party.label, supplierPhone: null, counterpartyId: party.id, counterpartyType: party.type, currency: "DZD", direction: "PURCHASE", warehouseId: null, projectId: null, invoiceDate: date, dueDate: null, notes: null, status: "RECEIVED", totalAmount: "90071992547409.93", paidAmount: "0.00", remainingAmount: "90071992547409.93", debtAccountId: "account", debtEntryId: "entry", createdAt: date, updatedAt: date, lineItems: [{ id: "line", invoiceId: "invoice", description: "مادة", source: { mode: "agreed-total", total: "90071992547409.93", quantity: "1" } }] }
const queries: QueryClient[] = []
function fixture(row = invoice, firstPage = { hasMore: false, nextCursor: null as string | null }) {
  const client = { listInvoices: vi.fn().mockResolvedValue({ items: [row], ...firstPage }), listPayments: vi.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }), createInvoice: vi.fn().mockResolvedValue(invoice), updateInvoice: vi.fn().mockResolvedValue(invoice), receiveInvoice: vi.fn().mockResolvedValue(invoice), deleteDraft: vi.fn().mockResolvedValue({ id: invoice.id }), voidInvoice: vi.fn().mockResolvedValue(invoice), createPayment: vi.fn().mockResolvedValue({}), allocatePayment: vi.fn().mockResolvedValue({}), voidPayment: vi.fn().mockResolvedValue({}), deleteUnallocatedPayment: vi.fn().mockResolvedValue({}), splitPayment: vi.fn().mockResolvedValue([{ invoiceId: invoice.id, amount: "0.01" }]) }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queries.push(query)
  query.setQueryData(sessionQueryKey, { user: { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0" } })
  query.setQueryData(workspaceQueryKeys.workspaceSnapshot("operator"), { numeric: "unchanged" })
  const mount = () => render(<QueryClientProvider client={query}><ExactInvoicesPage client={client as unknown as ExactInvoicesClient} parties={[party]} /></QueryClientProvider>)
  const view = mount()
  return { client, query, unmount: view.unmount, remount: mount }
}
afterEach(() => { cleanup(); queries.splice(0).forEach(query => query.clear()) })
describe("opt-in exact invoices and payments", () => {
  it.each(["DRAFT", "RECEIVED", "PAID", "VOIDED"] as const)("separates %s state from action controls in a dedicated column", async status => {
    fixture({ ...invoice, status })
    const region = await screen.findByRole("region", { name: "جدول الفواتير" })
    await within(region).findByText("INV-1")
    const headers = within(region).getAllByRole("columnheader")
    expect(headers.map(header => header.textContent)).toEqual(["الفاتورة والطرف", "الإجمالي", "المدفوع", "المتبقي", "الحالة", "الإجراءات"])
    const cells = within(region).getAllByRole("cell")
    expect(within(cells[4]!).queryByRole("button")).toBeNull()
    expect(cells[4]?.textContent).toBe(({ DRAFT: "مسودة", RECEIVED: "مستلمة", PAID: "مسددة", VOIDED: "ملغاة" })[status])
    expect(within(cells[5]!).getAllByRole("button").length).toBeGreaterThan(0)
  })
  it("renders unsafe-number cents unchanged without using the numeric workspace cache", async () => {
    const { query } = fixture()
    await screen.findByText("INV-1")
    expect(screen.getAllByText("90,071,992,547,409.93").length).toBe(2)
    expect(query.getQueryData(workspaceQueryKeys.workspaceSnapshot("operator"))).toEqual({ numeric: "unchanged" })
  })
  it("preserves localized price4 operands and document-once total when creating a draft", async () => {
    const { client } = fixture()
    fireEvent.click(screen.getByRole("button", { name: "فاتورة جديدة" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.change(within(dialog).getByRole("textbox", { name: "الوصف" }), { target: { value: "أسمنت" } })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "الكمية" }), { target: { value: "0.25" } })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "سعر الوحدة" }), { target: { value: "١٫٥٠٠٠" } })
    expect(within(dialog).getByText("0.38")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ المسودة" }))
    await waitFor(() => expect(client.createInvoice).toHaveBeenCalledTimes(1))
    expect(client.createInvoice.mock.calls[0]?.[0]).toMatchObject({ requestId: expect.any(String), lineItems: [{ description: "أسمنت", source: { mode: "unit-price", price: "1.5000", quantity: "0.25" } }] })
  })
  it("submits exact localized cash and independent per-invoice allocations", async () => {
    const { client } = fixture()
    await screen.findByText("INV-1")
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دفعة" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.change(within(dialog).getByRole("textbox", { name: "مبلغ الدفعة" }), { target: { value: "٠٫١٠" } })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "توزيع INV-1" }), { target: { value: "0.11" } })
    expect((within(dialog).getByRole("button", { name: "حفظ الدفعة والتوزيع" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(dialog).getByRole("textbox", { name: "توزيع INV-1" }), { target: { value: "٠٫٠٣" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ الدفعة والتوزيع" }))
    await waitFor(() => expect(client.createPayment).toHaveBeenCalledTimes(1))
    expect(client.createPayment.mock.calls[0]?.[0]).toMatchObject({ totalAmount: "0.10", allocations: [{ invoiceId: invoice.id, amount: "0.03" }] })
  })
  it("retains a payment receipt identity after response loss and page remount", async () => {
    const { client, unmount, remount } = fixture()
    client.createPayment.mockRejectedValueOnce(new Error("Response lost"))
    async function pay() {
      await screen.findByText("INV-1")
      fireEvent.click(screen.getByRole("button", { name: "تسجيل دفعة" }))
      const dialog = await screen.findByRole("dialog")
      fireEvent.change(within(dialog).getByRole("textbox", { name: "مبلغ الدفعة" }), { target: { value: "0.10" } })
      fireEvent.click(within(dialog).getByRole("button", { name: "حفظ الدفعة والتوزيع" }))
    }
    await pay()
    await screen.findByRole("alert")
    unmount(); remount()
    await pay()
    await waitFor(() => expect(client.createPayment).toHaveBeenCalledTimes(2))
    expect(client.createPayment.mock.calls[0]?.[0]).toEqual(client.createPayment.mock.calls[1]?.[0])
  })
  it("preserves derived source operands when editing a draft instead of repricing from its displayed total", async () => {
    const { client } = fixture({ ...invoice, status: "DRAFT", totalAmount: "33.33", remainingAmount: "33.33", lineItems: [{ ...invoice.lineItems[0]!, source: { mode: "derived-price", total: "10000.00", originalQuantity: "300", quantity: "1" } }] })
    fireEvent.click(await screen.findByRole("button", { name: "تعديل المسودة" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("33.33")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ المسودة" }))
    await waitFor(() => expect(client.updateInvoice).toHaveBeenCalledTimes(1))
    expect(client.updateInvoice.mock.calls[0]?.[0]).toMatchObject({ lineItems: [{ source: { mode: "derived-price", total: "10000.00", originalQuantity: "300", quantity: "1" } }] })
  })
  it("passes an opaque large-amount cursor unchanged when loading more invoices", async () => {
    const cursor = "exact:90071992547409.93"
    const { client } = fixture(invoice, { hasMore: true, nextCursor: cursor })
    client.listInvoices.mockResolvedValueOnce({ items: [], hasMore: false, nextCursor: null })
    fireEvent.click(await screen.findByRole("button", { name: "عرض المزيد" }))
    await waitFor(() => expect(client.listInvoices).toHaveBeenCalledTimes(2))
    expect(client.listInvoices.mock.calls[1]?.[0]).toEqual({ limit: 100, cursor })
  })
  it("requires an explicit void reason and sends only the selected invoice identity", async () => {
    const { client } = fixture()
    await screen.findByText("INV-1")
    fireEvent.click(screen.getByRole("button", { name: "إلغاء الفاتورة" }))
    const dialog = await screen.findByRole("dialog")
    expect((within(dialog).getByRole("button", { name: "تأكيد الإلغاء" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(dialog).getByRole("textbox", { name: "سبب الإلغاء" }), { target: { value: "إلغاء موثق" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الإلغاء" }))
    await waitFor(() => expect(client.voidInvoice).toHaveBeenCalledTimes(1))
    expect(client.voidInvoice.mock.calls[0]?.[0]).toMatchObject({ id: invoice.id, reason: "إلغاء موثق" })
  })
})
