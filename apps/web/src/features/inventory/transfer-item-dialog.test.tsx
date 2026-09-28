// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { transferAssetMutateAsync } = vi.hoisted(() => ({
  transferAssetMutateAsync: vi.fn(async () => ({})),
}))

vi.mock("./inventory-hooks", () => ({
  useAssetChargeDefaultQuery: () => ({
    data: {
      assetUnitId: "asset-1",
      amountDzd: 100_000,
      purchasePriceDzd: 100_000,
      source: "PURCHASE_PRICE",
    },
  }),
  useTransferInventoryAssetMutation: () => ({ isPending: false, mutateAsync: transferAssetMutateAsync }),
  useTransferInventoryConsumableMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useInventoryWarehousesQuery: () => ({ data: { items: [{ id: "wh-1", name: "رئيسي" }] } }),
  useInventoryProjectsQuery: () => ({ data: { items: [{ id: "project-a", name: "مشروع أ" }] } }),
}))

import {
  TransferItemDialog,
  chargeAmountFromPercent,
  chargePercentFromAmount,
  parseChargeAmountInput,
} from "./transfer-item-dialog"

/**
 * Percentage ↔ amount linkage for a placement charge (#413). The dialog lets
 * the operator type either field; the two must stay consistent against the
 * unit's purchase price (negative = cut, positive = above).
 */
describe("placement charge amount ↔ percentage", () => {
  it("reports a cut as a negative percentage and an over-charge as positive", () => {
    expect(chargePercentFromAmount(100_000, 100_000)).toBe(0)
    expect(chargePercentFromAmount(80_000, 100_000)).toBe(-20)
    expect(chargePercentFromAmount(120_000, 100_000)).toBe(20)
  })

  it("converts a percentage back into an amount, clamped at a free placement", () => {
    expect(chargeAmountFromPercent(0, 100_000)).toBe(100_000)
    expect(chargeAmountFromPercent(-20, 100_000)).toBe(80_000)
    expect(chargeAmountFromPercent(20, 100_000)).toBe(120_000)
    expect(chargeAmountFromPercent(-100, 100_000)).toBe(0)
    // A cut over 100% cannot produce a negative amount (money is non-negative).
    expect(chargeAmountFromPercent(-150, 100_000)).toBe(0)
  })

  it("round-trips an amount through the percentage when the percentage is exact", () => {
    for (const amount of [0, 50_000, 80_000, 100_000, 250_000]) {
      const percent = chargePercentFromAmount(amount, 100_000)
      expect(percent).not.toBeNull()
      expect(chargeAmountFromPercent(percent!, 100_000)).toBeCloseTo(amount, 2)
    }
  })

  it("returns no percentage when the purchase price is zero (division undefined)", () => {
    expect(chargePercentFromAmount(50_000, 0)).toBeNull()
    expect(chargePercentFromAmount(50_000, -1)).toBeNull()
  })

  it("distinguishes blank (use the default) from an explicit zero and invalid input", () => {
    expect(parseChargeAmountInput("")).toEqual({ kind: "default" })
    expect(parseChargeAmountInput("   ")).toEqual({ kind: "default" })
    expect(parseChargeAmountInput("0")).toEqual({ kind: "amount", value: 0 })
    expect(parseChargeAmountInput("80000")).toEqual({ kind: "amount", value: 80_000 })
    // A non-blank invalid entry must NOT silently become a free placement.
    expect(parseChargeAmountInput("abc")).toEqual({ kind: "invalid" })
    expect(parseChargeAmountInput("-5")).toEqual({ kind: "invalid" })
    // The shared money bound is enforced client-side too, so an over-bound
    // amount is refused before the wire gate rather than after submit.
    expect(parseChargeAmountInput(String(Number.MAX_SAFE_INTEGER))).toEqual({
      kind: "amount",
      value: Number.MAX_SAFE_INTEGER,
    })
    expect(parseChargeAmountInput(String(Number.MAX_SAFE_INTEGER + 1))).toEqual({ kind: "invalid" })
  })
})

describe("TransferItemDialog charge validation (#413)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(cleanup)

  function renderDialog() {
    return render(
      <TransferItemDialog
        open
        target={{ type: "ASSET", assetUnitId: "asset-1", assetName: "مثقاب" }}
        onOpenChange={vi.fn()}
      />,
    )
  }

  function chooseProjectDestination() {
    fireEvent.change(screen.getByLabelText("نوع الوجهة"), { target: { value: "PROJECT" } })
    fireEvent.change(screen.getByLabelText("الوجهة"), { target: { value: "project-a" } })
  }

  it("prefills the resolved default and warns without blocking an over-price amount", () => {
    renderDialog()
    chooseProjectDestination()

    const amount = screen.getByLabelText("مبلغ الاحتساب") as HTMLInputElement
    expect(amount.value).toBe("100000")

    fireEvent.change(amount, { target: { value: "150000" } })
    expect(screen.getByTestId("charge-warning")).toBeTruthy()
    expect(screen.getByRole("button", { name: "تأكيد التحويل" })).toBeTruthy()
  })

  it("rejects an invalid amount instead of booking a free placement", () => {
    renderDialog()
    chooseProjectDestination()

    fireEvent.change(screen.getByLabelText("مبلغ الاحتساب"), { target: { value: "-5" } })

    expect(screen.getByRole("alert")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "تأكيد التحويل" }))
    expect(transferAssetMutateAsync).not.toHaveBeenCalled()
  })

  it("sends an explicit zero as a free placement", async () => {
    renderDialog()
    chooseProjectDestination()

    fireEvent.change(screen.getByLabelText("مبلغ الاحتساب"), { target: { value: "0" } })
    fireEvent.click(screen.getByRole("button", { name: "تأكيد التحويل" }))

    await waitFor(() =>
      expect(transferAssetMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ assetUnitId: "asset-1", toProjectId: "project-a", chargeAmountDzd: 0 }),
      ),
    )
  })

  it("sends null for a cleared field so the server resolves the default", async () => {
    renderDialog()
    chooseProjectDestination()

    fireEvent.change(screen.getByLabelText("مبلغ الاحتساب"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "تأكيد التحويل" }))

    await waitFor(() =>
      expect(transferAssetMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ assetUnitId: "asset-1", toProjectId: "project-a", chargeAmountDzd: null }),
      ),
    )
  })
})
