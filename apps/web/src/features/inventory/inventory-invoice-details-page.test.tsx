// @vitest-environment jsdom

import "@/i18n"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { InventoryInvoiceGroupDetail } from "@tuari/contracts"

import { InventoryInvoiceDetailsPage } from "./inventory-invoice-details-page"
import { ALGERIA_DAY, MIDNIGHT_CROSSING, UTC_DAY, pinUtcTimeZone } from "@/test-utils/algeria-day"

const mocks = vi.hoisted(() => ({
  invoiceGroupQuery: vi.fn(),
  warehousesQuery: vi.fn(),
  projectsQuery: vi.fn(),
  chargeQueryIds: [] as Array<string | undefined>,
  transferAssetMutation: { isPending: false, mutateAsync: vi.fn() },
  transferConsumableMutation: { isPending: false, mutateAsync: vi.fn() },
}))

vi.mock("./inventory-hooks", () => ({
  useInventoryInvoiceGroupQuery: () => mocks.invoiceGroupQuery(),
  useInventoryWarehousesQuery: (enabled?: boolean) => mocks.warehousesQuery(enabled),
  useInventoryProjectsQuery: (enabled?: boolean) => mocks.projectsQuery(enabled),
  useTransferInventoryAssetMutation: () => mocks.transferAssetMutation,
  useTransferInventoryConsumableMutation: () => mocks.transferConsumableMutation,
  // The page now embeds AssetChargeHistory so a unit with no location keeps its
  // charge editor reachable (#422 round 6).
  useAssetChargesByUnitQuery: (assetUnitId?: string) => {
    mocks.chargeQueryIds.push(assetUnitId)
    return { data: { items: [] }, isPending: false, isError: false }
  },
  useUpdateAssetChargeMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useVoidAssetChargeMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  // The invoice screen routes asset transfers through TransferItemDialog (#413).
  useAssetChargeDefaultQuery: () => ({
    data: {
      assetUnitId: "asset-1",
      amountDzd: 3000,
      purchasePriceDzd: 3000,
      source: "PURCHASE_PRICE",
    },
  }),
}))

vi.mock("./record-invoice-payment-dialog", () => ({
  RecordInvoicePaymentDialog: () => null,
}))

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

/**
 * Minimal invoice-group detail with both entry shapes (CONSUMABLE + ASSET),
 * a movement, an attachment and a consumable balance — enough to prove the
 * success layout renders end to end (issue #34 regression guard).
 */
function makeInvoiceGroupDetail(): InventoryInvoiceGroupDetail {
  const createdAt = "2026-03-20T10:00:00.000Z"
  return {
    group: {
      id: "invoice-1",
      invoiceNumber: "FAC-2026-001",
      supplierName: "مورد الاختبار",
      invoiceDate: createdAt,
      warehouseId: "warehouse-1",
      projectId: null,
      externalCounterpartyId: null,
      grossTotalDzd: 1500,
      paidAmountDzd: 500,
      remainingDebtDzd: 1000,
      debtAccountId: null,
      note: null,
      createdAt,
      updatedAt: createdAt,
    },
    entries: [
      {
        id: "entry-1",
        invoiceGroupId: "invoice-1",
        itemDefinitionId: "item-def-1",
        warehouseId: "warehouse-1",
        projectId: null,
        itemType: "CONSUMABLE",
        itemName: "أسمنت",
        unit: "كيس",
        quantity: 10,
        unitPriceDzd: 150,
        totalPriceDzd: 1500,
        note: null,
        createdAt,
        updatedAt: createdAt,
        assets: [],
      },
      {
        id: "entry-2",
        invoiceGroupId: "invoice-1",
        itemDefinitionId: "item-def-2",
        warehouseId: null,
        projectId: "project-1",
        itemType: "ASSET",
        itemName: "حاسوب محمول",
        unit: null,
        quantity: 1,
        unitPriceDzd: 3000,
        totalPriceDzd: 3000,
        note: null,
        createdAt,
        updatedAt: createdAt,
        assets: [
          {
            id: "asset-1",
            inventoryEntryId: "entry-2",
            assetName: "حاسوب محمول",
            assetTag: null,
            serialNumber: null,
            condition: null,
            purchaseDate: null,
            purchasePriceDzd: 3000,
            currentWarehouseId: null,
            currentProjectId: "project-1",
            currentLocationLabel: "مشروع التوسعة",
            note: null,
            createdAt,
            updatedAt: createdAt,
          },
        ],
      },
    ],
    attachments: [
      {
        id: "att-1",
        invoiceGroupId: "invoice-1",
        originalName: "فاتورة-المورد.pdf",
        mimeType: "application/pdf",
        byteSize: 1024,
        storageKey: "attachments/invoice-1/att-1.pdf",
        relativePath: "/api/inventory/attachments/att-1",
        downloadUrl: "http://127.0.0.1:4318/api/inventory/attachments/att-1",
        sha256: null,
        createdAt,
      },
    ],
    movements: [
      {
        id: "mov-1",
        itemType: "CONSUMABLE",
        movementType: "PURCHASE",
        quantity: 10,
        inventoryEntryId: "entry-1",
        assetUnitId: null,
        fromWarehouseId: null,
        fromProjectId: null,
        toWarehouseId: "warehouse-1",
        toProjectId: null,
        occurredAt: createdAt,
        note: null,
        createdAt,
      },
    ],
    consumableBalances: [
      {
        id: "balance-1",
        inventoryEntryId: "entry-1",
        itemDefinitionId: "item-def-1",
        itemName: "أسمنت",
        locationLabel: "المستودع المركزي",
        quantity: 8,
        warehouseId: "warehouse-1",
        projectId: null,
        createdAt,
        updatedAt: createdAt,
      },
    ],
  }
}

type InvoiceQueryState = {
  data: InventoryInvoiceGroupDetail | undefined
  isPending: boolean
  isError: boolean
  refetch: ReturnType<typeof vi.fn>
}

function resolveQuery(query: InvoiceQueryState) {
  mocks.invoiceGroupQuery.mockReturnValue(query)
}

function renderPage(query: InvoiceQueryState) {
  resolveQuery(query)
  mocks.warehousesQuery.mockReturnValue({ data: { items: [] }, isPending: false, isError: false })
  mocks.projectsQuery.mockReturnValue({ data: { items: [] }, isPending: false, isError: false })
  const onBack = vi.fn()
  const utils = render(
    <QueryClientProvider client={makeQueryClient()}>
      <InventoryInvoiceDetailsPage invoiceId="invoice-1" onBack={onBack} />
    </QueryClientProvider>,
  )
  return { onBack, ...utils }
}

function successQuery(): InvoiceQueryState {
  return { data: makeInvoiceGroupDetail(), isPending: false, isError: false, refetch: vi.fn() }
}

function errorQuery(): InvoiceQueryState {
  return { data: undefined, isPending: false, isError: true, refetch: vi.fn() }
}

function noDataQuery(): InvoiceQueryState {
  return { data: undefined, isPending: false, isError: false, refetch: vi.fn() }
}

function pendingQuery(): InvoiceQueryState {
  return { data: undefined, isPending: true, isError: false, refetch: vi.fn() }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe("InventoryInvoiceDetailsPage error surface (issue #34)", () => {
  it("renders the load-error surface instead of infinite loading when the invoice-group query errors", () => {
    renderPage(errorQuery())

    expect(screen.getByRole("alert")).toBeTruthy()
    expect(
      screen.getByText("تعذر تحميل بيانات الفاتورة. حاول مرة أخرى."),
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeTruthy()
    // No stale loader text, no partial invoice content.
    expect(screen.queryByText("جارٍ تحميل بيانات الفاتورة...")).toBeNull()
    expect(screen.queryByRole("heading", { name: "FAC-2026-001" })).toBeNull()
  })

  it("refetches the invoice-group query when the retry button is clicked", () => {
    const query = errorQuery()
    renderPage(query)

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))

    expect(query.refetch).toHaveBeenCalledTimes(1)
  })

  it("renders the load-error surface for the has-id-but-data-undefined case (settled, no error)", () => {
    renderPage(noDataQuery())

    expect(screen.getByRole("alert")).toBeTruthy()
    expect(
      screen.getByText("تعذر تحميل بيانات الفاتورة. حاول مرة أخرى."),
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeTruthy()
    expect(screen.queryByText("جارٍ تحميل بيانات الفاتورة...")).toBeNull()
    expect(screen.queryByRole("heading", { name: "FAC-2026-001" })).toBeNull()
  })

  it("prefers the error surface over a retained invoice when a settled refetch fails", () => {
    // TanStack v5 keeps stale data after a failed background refetch: isError
    // is true while data still holds the last payload. The error surface must
    // win so the user sees the failure (and a retry) instead of the stale
    // invoice as if nothing went wrong.
    renderPage({ ...successQuery(), isError: true })

    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeTruthy()
    expect(
      screen.queryByRole("heading", { name: "FAC-2026-001" }),
    ).toBeNull()
  })

  it("keeps the loader while the invoice-group query is pending", () => {
    renderPage(pendingQuery())

    expect(screen.getByText("جارٍ تحميل بيانات الفاتورة...")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByRole("button", { name: "إعادة المحاولة" })).toBeNull()
  })

  it("renders the invoice details unchanged on success", () => {
    renderPage(successQuery())

    expect(screen.getByRole("heading", { name: "FAC-2026-001" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "العودة إلى الفواتير" })).toBeTruthy()
    expect(screen.getAllByText("الإجمالي: 1500.00 دج").length).toBeGreaterThan(0)
    expect(screen.getAllByText("أسمنت").length).toBeGreaterThan(0)
    expect(screen.getByText("عدد الأصول: 1")).toBeTruthy()
    expect(screen.getAllByText("حاسوب محمول").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/شراء - مادة/).length).toBeGreaterThan(0)
    expect(screen.getByText("فاتورة-المورد.pdf")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("routes an asset transfer through the charge-aware dialog (#413)", () => {
    renderPage(successQuery())

    fireEvent.click(screen.getByRole("button", { name: "تحويل الأصل" }))
    // Destination defaults to a warehouse; pick a project so the charge fields
    // appear. The operator must be able to say what to charge from this screen.
    fireEvent.change(screen.getByLabelText("نوع الوجهة"), { target: { value: "PROJECT" } })

    expect(screen.getByLabelText("مبلغ الاحتساب")).toBeTruthy()
  })

  it("keeps the destination lists disabled until a transfer dialog opens (#422 round 6)", () => {
    renderPage(successQuery())

    expect(mocks.warehousesQuery).toHaveBeenCalledWith(false)
    expect(mocks.projectsQuery).toHaveBeenCalledWith(false)

    fireEvent.click(screen.getByRole("button", { name: "تحويل الأصل" }))

    expect(mocks.warehousesQuery).toHaveBeenCalledWith(true)
    expect(mocks.projectsQuery).toHaveBeenCalledWith(true)
  })

  it("routes a consumable transfer through the shared dialog too (#422 round 6)", () => {
    renderPage(successQuery())

    fireEvent.click(screen.getByRole("button", { name: "تحويل الكمية" }))

    expect(screen.getByRole("heading", { name: "تحويل عنصر" })).toBeTruthy()
  })

  it("keeps the charge editor reachable for a unit with no location (#422 round 6)", () => {
    // An outbound sale/gift/return clears the unit's location, so it drops out
    // of the location-contents view. The invoice's own asset list is the
    // per-unit view that keeps its charge history and correction reachable.
    const detail = makeInvoiceGroupDetail()
    const asset = detail.entries[1]!.assets[0]!
    detail.entries[1]!.assets = [
      { ...asset, currentWarehouseId: null, currentProjectId: null, currentLocationLabel: null },
    ]
    renderPage({ data: detail, isPending: false, isError: false, refetch: vi.fn() })

    expect(screen.getByText("المكان الحالي: غير محدد")).toBeTruthy()
    mocks.chargeQueryIds.length = 0
    fireEvent.click(screen.getByRole("button", { name: "سجل الاحتساب" }))

    expect(screen.getByTestId("asset-charge-history")).toBeTruthy()
    // The history read is scoped to the rendered unit, not an arbitrary one.
    expect(mocks.chargeQueryIds).toContain(asset.id)
  })
})

describe("InventoryInvoiceDetailsPage pins the invoice day (#473)", () => {
  let restoreTimeZone: () => void

  beforeEach(() => {
    restoreTimeZone = pinUtcTimeZone()
  })

  afterEach(() => {
    restoreTimeZone()
  })

  it("renders the invoice on its Algeria day under a UTC machine", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC")
    expect(ALGERIA_DAY).not.toBe(UTC_DAY)

    const detail = makeInvoiceGroupDetail()
    detail.group.invoiceDate = MIDNIGHT_CROSSING
    renderPage({ data: detail, isPending: false, isError: false, refetch: vi.fn() })

    expect(screen.getByText(`تاريخ الفاتورة: ${ALGERIA_DAY}`)).toBeTruthy()
    expect(screen.queryByText(`تاريخ الفاتورة: ${UTC_DAY}`)).toBeNull()
  })
})