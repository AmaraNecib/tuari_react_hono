// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  charges: vi.fn(),
  chargeQueryIds: [] as Array<string | undefined>,
  update: { isPending: false, mutateAsync: vi.fn() },
  voidCharge: { isPending: false, mutateAsync: vi.fn() },
}))

vi.mock("./inventory-hooks", () => ({
  useAssetChargesByUnitQuery: (assetUnitId?: string) => {
    mocks.chargeQueryIds.push(assetUnitId)
    return mocks.charges()
  },
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
    mocks.chargeQueryIds.length = 0
    mocks.charges.mockReturnValue({ data: { items: [makeCharge()] } })
    mocks.update.mutateAsync.mockResolvedValue({})
    mocks.voidCharge.mutateAsync.mockResolvedValue({})
  })

  afterEach(cleanup)

  it("shows the unit's charge chain once expanded, scoped to that unit", () => {
    render(<AssetChargeHistory assetUnitId="asset-1" />)

    // Lazy: the query stays disabled until the row is expanded.
    expect(mocks.chargeQueryIds).toEqual([undefined])

    fireEvent.click(screen.getByText("سجل الاحتساب"))

    expect(mocks.chargeQueryIds).toContain("asset-1")

    expect(screen.getByText(/مشروع أ/)).toBeTruthy()
    // Money uses the repo convention, not the raw JS number.
    expect(screen.getByText(new RegExp((100_000).toLocaleString("ar-DZ")))).toBeTruthy()
  })

  it("exposes the panel state to assistive tech", () => {
    render(<AssetChargeHistory assetUnitId="asset-1" />)

    const toggle = screen.getByText("سجل الاحتساب")
    expect(toggle.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(toggle)

    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    const panelId = toggle.getAttribute("aria-controls")
    expect(panelId).toBeTruthy()
    expect(document.getElementById(panelId!)?.getAttribute("data-testid")).toBe("asset-charge-history")
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

  it("keeps the edit form open and swallows the rejection when a correction fails", async () => {
    // The mutation's onError already toasted; the click handler must not leak
    // the rejected promise. Assert no unhandled rejection reaches the process
    // AND the operator's draft stays on screen (#422 round 5).
    mocks.update.mutateAsync.mockRejectedValue(new Error("رفض الخادم"))
    const onUnhandled = vi.fn()
    process.on("unhandledRejection", onUnhandled)
    try {
      render(<AssetChargeHistory assetUnitId="asset-1" />)
      fireEvent.click(screen.getByText("سجل الاحتساب"))
      fireEvent.click(screen.getByText("تعديل"))
      fireEvent.change(screen.getByLabelText("المبلغ الجديد"), { target: { value: "75000" } })
      fireEvent.click(screen.getByText("حفظ"))

      await waitFor(() => expect(mocks.update.mutateAsync).toHaveBeenCalled())
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(onUnhandled).not.toHaveBeenCalled()
      expect(screen.getByLabelText("المبلغ الجديد")).toBeTruthy()
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
  })

  it("keeps the void form open and swallows the rejection when a void fails", async () => {
    mocks.voidCharge.mutateAsync.mockRejectedValue(new Error("رفض الخادم"))
    const onUnhandled = vi.fn()
    process.on("unhandledRejection", onUnhandled)
    try {
      render(<AssetChargeHistory assetUnitId="asset-1" />)
      fireEvent.click(screen.getByText("سجل الاحتساب"))
      fireEvent.click(screen.getByTestId("void-charge-1"))
      fireEvent.click(screen.getByTestId("confirm-void-charge-1"))

      await waitFor(() => expect(mocks.voidCharge.mutateAsync).toHaveBeenCalled())
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(onUnhandled).not.toHaveBeenCalled()
      expect(screen.getByTestId("confirm-void-charge-1")).toBeTruthy()
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
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

    // The voided row shows its state and has no edit/void affordance. The live
    // row keeps both, so a regression that renders "تعديل" on the voided row
    // must fail here.
    expect(screen.getByText("ملغى")).toBeTruthy()
    expect(screen.getAllByText("إلغاء")).toHaveLength(1)
    expect(screen.getAllByText("تعديل")).toHaveLength(1)

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

  it("cancels an in-progress correction and an in-progress void without sending anything", () => {
    render(<AssetChargeHistory assetUnitId="asset-1" />)
    fireEvent.click(screen.getByText("سجل الاحتساب"))

    fireEvent.click(screen.getByText("تعديل"))
    const editForm = screen.getByLabelText("المبلغ الجديد").parentElement!
    fireEvent.click(within(editForm).getByText("إلغاء"))
    expect(screen.queryByLabelText("المبلغ الجديد")).toBeNull()

    fireEvent.click(screen.getByTestId("void-charge-1"))
    const voidForm = screen.getByLabelText("سبب الإلغاء (اختياري)").parentElement!
    fireEvent.click(within(voidForm).getByText("إلغاء"))
    expect(screen.queryByLabelText("سبب الإلغاء (اختياري)")).toBeNull()

    expect(mocks.update.mutateAsync).not.toHaveBeenCalled()
    expect(mocks.voidCharge.mutateAsync).not.toHaveBeenCalled()
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

    const from100 = (100_000).toLocaleString("ar-DZ")
    const to75 = (75_000).toLocaleString("ar-DZ")
    expect(screen.getByText(new RegExp(`تصحيح من ${from100} إلى ${to75}`))).toBeTruthy()
    expect(screen.getByText(new RegExp(`إلغاء من ${to75} إلى 0`))).toBeTruthy()
    // The actor, the timestamp and the reason are not collapsed into a single
    // "corrected" badge.
    expect(screen.getAllByText(/مدير/).length).toBe(2)
    expect(screen.getByText(/خصم/)).toBeTruthy()
    expect(
      screen.getAllByText((content) => content.includes(new Date(createdAt).toLocaleString("ar-DZ"))).length,
    ).toBeGreaterThan(0)
  })
})
