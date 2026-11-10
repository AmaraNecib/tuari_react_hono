// @vitest-environment jsdom
import "@/i18n"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ExactInventoryClient, InventoryItemDefinition } from "@tuari/contracts"
import { sessionQueryKey } from "@/features/app-shell/workspace-keys"
import { ExactInventoryPurchaseForm } from "./inventory-exact-purchase-form"
import { ExactInventoryMovementForm } from "./inventory-exact-movement-form"
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "operator" } } }) }))
const date = "2026-11-10T00:00:00.000Z"
const locations = [{ id: "warehouse", type: "WAREHOUSE" as const, label: "مخزن" }, { id: "project", type: "PROJECT" as const, label: "مشروع" }]
const parties = [{ id: "party", label: "طرف خارجي" }]
const definitions: InventoryItemDefinition[] = [{ id: "material", name: "مادة", itemType: "CONSUMABLE", unit: "m", isActive: true, description: null, createdAt: date, updatedAt: date }, { id: "asset", name: "مضخة", itemType: "ASSET", unit: null, isActive: true, description: null, createdAt: date, updatedAt: date }]
const contents = { assets: [], consumables: [{ id: "balance", inventoryEntryId: "entry", itemDefinitionId: "material", itemName: "مادة", warehouseId: "warehouse", projectId: null, quantity: 300, locationLabel: "مخزن", createdAt: date, updatedAt: date }] }
const queries: QueryClient[] = []
afterEach(() => { cleanup(); queries.splice(0).forEach(query => query.clear()) })
function wrapper(children: React.ReactNode) {
 const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
 queries.push(query)
 query.setQueryData(sessionQueryKey, { user: { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0" } })
 return render(<QueryClientProvider client={query}>{children}</QueryClientProvider>)
}
describe("exact inventory forms", () => {
 it("submits an agreed 10000/300 purchase without deriving a rounded unit price", async () => {
  const submit = vi.fn().mockResolvedValue(undefined)
  wrapper(<ExactInventoryPurchaseForm definitions={definitions} locations={locations} parties={parties} pending={false} error={null} close={() => {}} submit={submit} />)
  const dialog = screen.getByRole("dialog")
  fireEvent.change(within(dialog).getByRole("textbox", { name: "كمية المخزون" }), { target: { value: "300" } })
  fireEvent.change(within(dialog).getByRole("combobox", { name: "طريقة التسعير" }), { target: { value: "agreed-total" } })
  fireEvent.change(within(dialog).getByRole("textbox", { name: "إجمالي البند المتفق عليه" }), { target: { value: "١٠٬٠٠٠٫٠٠" } })
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "تسجيل الشراء كدين على الشركة" }))
  fireEvent.change(within(dialog).getByRole("textbox", { name: "الدفعة الأولى، اختياري" }), { target: { value: "٠٫٣٠" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "حفظ الفاتورة والمخزون" }))
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
  expect(submit.mock.calls[0]?.[0]).toMatchObject({ kind: "createInvoice", input: { warehouseId: "warehouse", createDebt: true, paidAmountDzd: "0.30", entries: [{ kind: "CONSUMABLE", quantity: 300, priceSource: { mode: "agreed-total", total: "10000.00", quantity: "300" } }] } })
  expect(submit.mock.calls[0]?.[0].input.entries[0]).not.toHaveProperty("unitPriceDzd")
 })
 it("keeps six-place stock independent of a localized price4", async () => {
  const submit = vi.fn().mockResolvedValue(undefined)
  wrapper(<ExactInventoryPurchaseForm definitions={definitions} locations={locations} parties={parties} pending={false} error={null} close={() => {}} submit={submit} />)
  fireEvent.change(screen.getByRole("textbox", { name: "كمية المخزون" }), { target: { value: "0.000003" } })
  fireEvent.change(screen.getByRole("textbox", { name: "سعر الوحدة" }), { target: { value: "١٢٣٫٤٥٦٧" } })
  fireEvent.click(screen.getByRole("button", { name: "حفظ الفاتورة والمخزون" }))
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
  expect(submit.mock.calls[0]?.[0]).toMatchObject({ input: { createDebt: false, entries: [{ quantity: 0.000003, unitPriceDzd: "123.4567" }] } })
 })
 it("does not finalize fractional purchase lines independently", async () => {
  const submit = vi.fn().mockResolvedValue(undefined)
  wrapper(<ExactInventoryPurchaseForm definitions={definitions} locations={locations} parties={parties} pending={false} error={null} close={() => {}} submit={submit} />)
  fireEvent.click(screen.getByRole("button", { name: "إضافة بند مخزون" }))
  const quantities = screen.getAllByRole("textbox", { name: "كمية المخزون" })
  const prices = screen.getAllByRole("textbox", { name: "سعر الوحدة" })
  quantities.forEach(input => fireEvent.change(input, { target: { value: "0.25" } }))
  prices.forEach(input => fireEvent.change(input, { target: { value: "1.5000" } }))
  expect(screen.getByText("0.75")).toBeTruthy()
  expect(screen.queryByText("0.76")).toBeNull()
 })
 it("preserves an omitted outbound price rather than submitting zero, and blocks overstock", async () => {
  const submit = vi.fn().mockResolvedValue(undefined)
  wrapper(<ExactInventoryMovementForm client={{} as ExactInventoryClient} contents={contents} definitions={definitions} locations={locations} parties={parties} source="WAREHOUSE:warehouse" pending={false} error={null} close={() => {}} submit={submit} />)
  fireEvent.change(screen.getByRole("combobox", { name: "نوع العملية" }), { target: { value: "GIFT" } })
  fireEvent.change(screen.getByRole("textbox", { name: "الكمية المحولة" }), { target: { value: "301" } })
  expect((screen.getByRole("button", { name: "تأكيد التحويل" }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByRole("textbox", { name: "الكمية المحولة" }), { target: { value: "0.000001" } })
  fireEvent.click(screen.getByRole("button", { name: "تأكيد التحويل" }))
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
  expect(submit.mock.calls[0]?.[0]).toMatchObject({ kind: "createOutbound", input: { transferType: "GIFT", fromType: "WAREHOUSE", fromId: "warehouse", items: [{ itemId: "material", optionId: "balance", quantity: 0.000001, unitPriceDzd: undefined, derivedPrice: undefined }] } })
 })
 it("submits exact explicit outbound credit and initial payment independently of source-ratio valuation", async () => {
  const submit = vi.fn().mockResolvedValue(undefined)
  wrapper(<ExactInventoryMovementForm client={{} as ExactInventoryClient} contents={contents} definitions={definitions} locations={locations} parties={parties} source="WAREHOUSE:warehouse" pending={false} error={null} close={() => {}} submit={submit} />)
  fireEvent.change(screen.getByRole("combobox", { name: "نوع العملية" }), { target: { value: "RETURN" } })
  fireEvent.change(screen.getByRole("combobox", { name: "التسعير، اختياري" }), { target: { value: "DERIVED" } })
  fireEvent.change(screen.getByRole("textbox", { name: "الإجمالي المتفق عليه للمصدر" }), { target: { value: "10000" } })
  fireEvent.change(screen.getByRole("textbox", { name: "كمية المصدر الأصلية" }), { target: { value: "300" } })
  fireEvent.click(screen.getByRole("checkbox", { name: "تسجيل مستحقات علينا من الإرجاع" }))
  fireEvent.change(screen.getByRole("textbox", { name: "القيمة الكاملة للدين" }), { target: { value: "90071992547409.93" } })
  fireEvent.change(screen.getByRole("textbox", { name: "الدفعة الأولى، اختياري" }), { target: { value: "0.10" } })
  fireEvent.click(screen.getByRole("button", { name: "تأكيد التحويل" }))
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
  expect(submit.mock.calls[0]?.[0]).toMatchObject({ kind: "createOutbound", input: { transferType: "RETURN", debtAmountDzd: "90071992547409.93", firstPaymentAmountDzd: "0.10", items: [{ derivedPrice: { total: "10000.00", originalQuantity: "300" } }] } })
 })
})
