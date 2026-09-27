// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  charges: vi.fn(),
  update: { isPending: false, mutateAsync: vi.fn() },
  voidCharge: { isPending: false, mutateAsync: vi.fn() },
}))

vi.mock("./inventory-hooks", () => ({
  useAssetChargesByUnitQuery: () => mocks.charges(),
  useUpdateAssetChargeMutation: () => mocks.update,
  useVoidAssetChargeMutation: () => mocks.voidCharge,
}))

import { AssetChargeHistory } from "./asset-charge-history"

const createdAt = "2026-06-01T00:00:00.000Z"

function makeCharge(overrides: Record<string, unknown> = {}) {
  return {
    id: "charge-1",
    assetUnitId: "asset-1",
    projectId: "project-a",
    projectName: "مشروع أ",
    movementId: "movement-1",
    amountDzd: 100_000,
    status: "LIVE",
    voidedAt: null,
    voidReason: null,
    createdAt,
    updatedAt: createdAt,
    revisions: [],
    ...overrides,
  }
}

describe("AssetChargeHistory (#413)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.charges.mockReturnValue({ data: { items: [makeCharge()] } })
    mocks.update.mutateAsync.mockResolvedValue({})
    mocks.voidCharge.mutateAsync.mockResolvedValue({})
  })

  afterEach(cleanup)

  it("shows the unit's charge chain once expanded", () => {
    render(<AssetChargeHistory assetUnitId="asset-1" />)

    fireEvent.click(screen.getByText("سجل الاحتساب"))

    expect(screen.getByText(/مشروع أ/)).toBeTruthy()
    expect(screen.getByText(/100000/)).toBeTruthy()
  })

  it("records a correction with the typed amount and optional reason", async () => {
    render(<AssetChargeHistory assetUnitId="asset-1" />)
    fireEvent.click(screen.getByText("سجل الاحتساب"))

    fireEvent.click(screen.getByText("تعديل"))
    fireEvent.change(screen.getByLabelText("المبلغ الجديد"), { target: { value: "75000" } })
    fireEvent.change(screen.getByLabelText("السبب (اختياري)"), { target: { value: "خصم" } })
    fireEvent.click(screen.getByText("حفظ"))

    await waitFor(() =>
      expect(mocks.update.mutateAsync).toHaveBeenCalledWith({
        chargeId: "charge-1",
        amountDzd: 75_000,
        reason: "خصم",
      }),
    )
  })

  it("voids a live charge and marks a voided one", async () => {
    mocks.charges.mockReturnValue({
      data: { items: [makeCharge(), makeCharge({ id: "charge-2", status: "VOID", projectName: "مشروع ب" })] },
    })
    render(<AssetChargeHistory assetUnitId="asset-1" />)
    fireEvent.click(screen.getByText("سجل الاحتساب"))

    // The voided row shows its state and has no edit/void affordance.
    expect(screen.getByText("ملغى")).toBeTruthy()
    expect(screen.getAllByText("إلغاء")).toHaveLength(1)

    fireEvent.click(screen.getByText("إلغاء"))
    await waitFor(() =>
      expect(mocks.voidCharge.mutateAsync).toHaveBeenCalledWith({ chargeId: "charge-1", reason: null }),
    )
  })

  it("shows an empty state when the unit has never been charged", () => {
    mocks.charges.mockReturnValue({ data: { items: [] } })
    render(<AssetChargeHistory assetUnitId="asset-1" />)

    fireEvent.click(screen.getByText("سجل الاحتساب"))

    expect(screen.getByText("لا توجد احتسابات لهذا الأصل بعد.")).toBeTruthy()
  })
})
