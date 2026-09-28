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

  it("refuses a blank correction instead of silently recording a revision to 0", async () => {
    render(<AssetChargeHistory assetUnitId="asset-1" />)
    fireEvent.click(screen.getByText("سجل الاحتساب"))

    fireEvent.click(screen.getByText("تعديل"))
    fireEvent.change(screen.getByLabelText("المبلغ الجديد"), { target: { value: "   " } })
    fireEvent.click(screen.getByText("حفظ"))

    expect(screen.getByTestId("charge-edit-error")).toBeTruthy()
    expect(mocks.update.mutateAsync).not.toHaveBeenCalled()
  })

  it("accepts an explicit zero correction (a free placement) and refuses a non-numeric one", async () => {
    render(<AssetChargeHistory assetUnitId="asset-1" />)
    fireEvent.click(screen.getByText("سجل الاحتساب"))

    fireEvent.click(screen.getByText("تعديل"))
    fireEvent.change(screen.getByLabelText("المبلغ الجديد"), { target: { value: "abc" } })
    fireEvent.click(screen.getByText("حفظ"))
    expect(screen.getByTestId("charge-edit-error")).toBeTruthy()
    expect(mocks.update.mutateAsync).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("المبلغ الجديد"), { target: { value: "0" } })
    fireEvent.click(screen.getByText("حفظ"))
    await waitFor(() =>
      expect(mocks.update.mutateAsync).toHaveBeenCalledWith({ chargeId: "charge-1", amountDzd: 0, reason: null }),
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

    fireEvent.click(screen.getByTestId("void-charge-1"))
    fireEvent.click(screen.getByTestId("confirm-void-charge-1"))
    await waitFor(() =>
      expect(mocks.voidCharge.mutateAsync).toHaveBeenCalledWith({ chargeId: "charge-1", reason: null }),
    )
  })

  it("records a void reason on the charge being voided, not another charge's correction reason", async () => {
    // Two live charges: a reason typed while correcting charge A must never be
    // recorded when the operator voids charge B (#422 round 4).
    mocks.charges.mockReturnValue({
      data: { items: [makeCharge(), makeCharge({ id: "charge-2", projectName: "مشروع ب" })] },
    })
    render(<AssetChargeHistory assetUnitId="asset-1" />)
    fireEvent.click(screen.getByText("سجل الاحتساب"))

    fireEvent.click(screen.getAllByText("تعديل")[0]!)
    fireEvent.change(screen.getByLabelText("السبب (اختياري)"), { target: { value: "سبب التصحيح" } })

    fireEvent.click(screen.getByTestId("void-charge-2"))
    fireEvent.change(screen.getByLabelText("سبب الإلغاء (اختياري)"), { target: { value: "سبب الإلغاء" } })
    fireEvent.click(screen.getByTestId("confirm-void-charge-2"))

    await waitFor(() =>
      expect(mocks.voidCharge.mutateAsync).toHaveBeenCalledWith({ chargeId: "charge-2", reason: "سبب الإلغاء" }),
    )
    expect(mocks.voidCharge.mutateAsync).not.toHaveBeenCalledWith(expect.objectContaining({ reason: "سبب التصحيح" }))
  })

  it("shows an empty state when the unit has never been charged", () => {
    mocks.charges.mockReturnValue({ data: { items: [] } })
    render(<AssetChargeHistory assetUnitId="asset-1" />)

    fireEvent.click(screen.getByText("سجل الاحتساب"))

    expect(screen.getByText("لا توجد احتسابات لهذا الأصل بعد.")).toBeTruthy()
  })

  it("shows a loading state instead of the empty list while the query is pending", () => {
    mocks.charges.mockReturnValue({ isPending: true, data: undefined })
    render(<AssetChargeHistory assetUnitId="asset-1" />)

    fireEvent.click(screen.getByText("سجل الاحتساب"))

    expect(screen.getByText("جارٍ تحميل سجل الاحتساب...")).toBeTruthy()
    expect(screen.queryByText("لا توجد احتسابات لهذا الأصل بعد.")).toBeNull()
  })

  it("shows a load error instead of the empty list when the query fails", () => {
    mocks.charges.mockReturnValue({ isError: true, data: undefined })
    render(<AssetChargeHistory assetUnitId="asset-1" />)

    fireEvent.click(screen.getByText("سجل الاحتساب"))

    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByText("تعذر تحميل سجل الاحتساب. حاول مرة أخرى.")).toBeTruthy()
    expect(screen.queryByText("لا توجد احتسابات لهذا الأصل بعد.")).toBeNull()
  })

  it("shows each correction's from → to amount, actor, time and reason", () => {
    mocks.charges.mockReturnValue({
      data: {
        items: [
          makeCharge({
            revisions: [
              {
                id: "rev-1",
                chargeId: "charge-1",
                previousAmountDzd: 100_000,
                newAmountDzd: 75_000,
                reason: "خصم",
                actorUserId: "user-1",
                actorLabel: "مدير",
                createdAt,
              },
              {
                id: "rev-2",
                chargeId: "charge-1",
                previousAmountDzd: 75_000,
                newAmountDzd: null,
                reason: null,
                actorUserId: "user-1",
                actorLabel: "مدير",
                createdAt,
              },
            ],
          }),
        ],
      },
    })
    render(<AssetChargeHistory assetUnitId="asset-1" />)

    fireEvent.click(screen.getByText("سجل الاحتساب"))

    expect(screen.getByText(/تصحيح من 100000 إلى 75000/)).toBeTruthy()
    expect(screen.getByText(/إلغاء من 75000 إلى 0/)).toBeTruthy()
    // The actor and the reason are not collapsed into a single "corrected" badge.
    expect(screen.getAllByText(/مدير/).length).toBe(2)
    expect(screen.getByText(/خصم/)).toBeTruthy()
  })
})
