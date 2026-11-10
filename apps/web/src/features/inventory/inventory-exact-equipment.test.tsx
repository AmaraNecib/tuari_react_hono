// @vitest-environment jsdom
import "@/i18n"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ExactInventoryAsset, ExactInventoryCharge, ExactInventoryClient, InventoryItemDefinition } from "@tuari/contracts"
import { sessionQueryKey } from "@/features/app-shell/workspace-keys"
import { ExactInventoryPage } from "./inventory-exact-page"
import { ExactInventoryMovementForm } from "./inventory-exact-movement-form"

vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "operator" } } }) }))
const date = "2026-11-10T00:00:00.000Z"
const locations = [{ id: "warehouse", type: "WAREHOUSE" as const, label: "مخزن" }, { id: "project", type: "PROJECT" as const, label: "مشروع" }]
const parties = [{ id: "party", label: "طرف خارجي" }]
const definitions: InventoryItemDefinition[] = [{ id: "pump", name: "مضخة", itemType: "ASSET", unit: null, isActive: true, description: null, createdAt: date, updatedAt: date }]
const asset: ExactInventoryAsset = { id: "asset-unit", inventoryEntryId: "entry", itemDefinitionId: "pump", assetName: "مضخة", assetTag: null, serialNumber: null, condition: null, purchaseDate: null, currentWarehouseId: "warehouse", currentProjectId: null, currentLocationLabel: "مخزن", note: null, purchasePriceDzd: "90071992547409.93", createdAt: date, updatedAt: date }
const contents = { assets: [asset], consumables: [] }
const charge: ExactInventoryCharge = { id: "charge-selected", assetUnitId: asset.id, projectId: "project", projectName: "مشروع", movementId: "movement", amountDzd: "71.29", status: "LIVE", voidedAt: null, voidReason: null, revisions: [{ id: "revision-old", chargeId: "charge-selected", previousAmountDzd: "71.28", newAmountDzd: "71.29", reason: "تصحيح سابق", actorUserId: "operator", actorLabel: "Operator", revisionSequence: 1, transactionId: null, createdAt: date }], placementSequence: 1, voidedBy: null, createdAt: date, updatedAt: date }
const queries: QueryClient[] = []
afterEach(() => { cleanup(); queries.splice(0).forEach(query => query.clear()) })
function wrapper(children: React.ReactNode) {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queries.push(query)
  query.setQueryData(sessionQueryKey, { user: { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0" } })
  return render(<QueryClientProvider client={query}>{children}</QueryClientProvider>)
}
function inventoryClient() {
  return {
    listInvoices: vi.fn().mockResolvedValue([]), definitions: vi.fn().mockResolvedValue(definitions), listOutbounds: vi.fn().mockResolvedValue([]),
    locationContents: vi.fn().mockResolvedValue(contents), chargeDefault: vi.fn().mockResolvedValue({ assetUnitId: asset.id, amountDzd: "71.29", purchasePriceDzd: asset.purchasePriceDzd, source: "LAST_CHARGE" }),
    projectCharges: vi.fn().mockResolvedValue({ projectId: "project", totalDzd: "71.29", charges: [charge] }),
    projectContribution: vi.fn().mockResolvedValue({ projectId: "project", chargedMaterialsDzd: "0.00", equipmentChargesDzd: "71.29", totalDzd: "71.29", parkedAssetValueDzd: "0.00", parkedAssets: [], materialMovements: [] }),
    transferAsset: vi.fn().mockResolvedValue({}), updateCharge: vi.fn().mockResolvedValue({}), voidCharge: vi.fn().mockResolvedValue({}),
  }
}
const page = (client: ReturnType<typeof inventoryClient>) => <ExactInventoryPage client={client as unknown as ExactInventoryClient} locations={locations} parties={parties} />
describe("exact equipment interactions", () => {
  it.each([false, true])("preserves server-default versus explicit free placement: override=%s", async free => {
    const client = inventoryClient()
    const submit = vi.fn().mockResolvedValue(undefined)
    wrapper(<ExactInventoryMovementForm client={client as unknown as ExactInventoryClient} contents={contents} definitions={definitions} locations={locations} parties={parties} source="WAREHOUSE:warehouse" pending={false} error={null} close={() => {}} submit={submit} />)
    fireEvent.change(screen.getByRole("combobox", { name: "الوجهة" }), { target: { value: "PROJECT:project" } })
    await screen.findByText("71.29")
    expect(client.chargeDefault).toHaveBeenCalledWith({ assetUnitId: asset.id })
    if (free) {
      fireEvent.click(screen.getByRole("checkbox", { name: "تحديد احتساب مختلف على المشروع" }))
      fireEvent.change(screen.getByRole("textbox", { name: "احتساب المشروع، صفر يعني مجانًا" }), { target: { value: "٠" } })
    }
    fireEvent.click(screen.getByRole("button", { name: "تأكيد التحويل" }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ kind: "transferAsset", input: { requestId: "pending", assetUnitId: asset.id, toProjectId: "project", chargeAmountDzd: free ? "0.00" : undefined } })
  })
  it("keeps purchase value separate and preserves previous/new correction values after an exact large update", async () => {
    const client = inventoryClient()
    const updated: ExactInventoryCharge = { ...charge, amountDzd: "90071992547409.97", revisions: [...charge.revisions, { ...charge.revisions[0]!, id: "revision-new", previousAmountDzd: "71.29", newAmountDzd: "90071992547409.97", revisionSequence: 2, reason: "تصحيح موثق" }] }
    client.updateCharge.mockImplementation(async () => {
      client.projectCharges.mockResolvedValue({ projectId: "project", totalDzd: updated.amountDzd, charges: [updated] })
      return {}
    })
    wrapper(page(client))
    await screen.findByText("90,071,992,547,409.93")
    expect(screen.getByText("90,071,992,547,409.93")).toBeTruthy()
    expect(screen.getByText("71.28")).toBeTruthy()
    fireEvent.click(await screen.findByRole("button", { name: "تصحيح الاحتساب" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.change(within(dialog).getByRole("textbox", { name: "المبلغ المصحح" }), { target: { value: "٩٠٬٠٧١٬٩٩٢٬٥٤٧٬٤٠٩٫٩٧" } })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "السبب" }), { target: { value: "تصحيح موثق" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await waitFor(() => expect(client.updateCharge).toHaveBeenCalledTimes(1))
    expect(client.updateCharge.mock.calls[0]?.[0]).toMatchObject({ requestId: expect.any(String), chargeId: charge.id, amountDzd: "90071992547409.97", reason: "تصحيح موثق" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(screen.getByText("تصحيح موثق", { exact: false })).toBeTruthy()
    expect(screen.getAllByText("90,071,992,547,409.97").length).toBe(2)
    expect(screen.getByText("90,071,992,547,409.93")).toBeTruthy()
    expect(screen.getByText("71.28")).toBeTruthy()
    expect(charge.revisions).toHaveLength(1)
    expect(charge.amountDzd).toBe("71.29")
  })
  it("voids only the selected charge and exposes disabled pending and localized retry states", async () => {
    const client = inventoryClient()
    let rejectVoid: (error: Error) => void = () => { throw new Error("Void has not started") }
    client.voidCharge.mockImplementation(() => new Promise((_, reject) => { rejectVoid = reject }))
    wrapper(page(client))
    fireEvent.click(await screen.findByRole("button", { name: "إلغاء الاحتساب" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await waitFor(() => expect(client.voidCharge).toHaveBeenCalledTimes(1))
    expect(client.voidCharge.mock.calls[0]?.[0]).toMatchObject({ requestId: expect.any(String), chargeId: charge.id, reason: null })
    expect((within(dialog).getByRole("button", { name: "تأكيد الحفظ" }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(dialog).getByRole("button", { name: "رجوع" }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { rejectVoid(new Error("Synthetic server failure")) })
    expect((await screen.findByRole("alert")).textContent).toBe("تعذر حفظ العملية أو تأكيد نتيجتها. تحقق من البيانات وأعد المحاولة.")
    expect((within(dialog).getByRole("button", { name: "تأكيد الحفظ" }) as HTMLButtonElement).disabled).toBe(false)
  })
})
