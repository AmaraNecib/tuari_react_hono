// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { i18n } from "@/i18n"
import { PurchaseAttachmentFiles } from "./inventory-exact-attachments"
import { getConsolidationRemainder, getDebtDirectionLabel, getDebtEntryTypeLabel, getNetDebtBalanceDisplay } from "../debts/debt-utils"

const originals = new Map<string, string>()
function substitute(key: string, value: string) {
  originals.set(key, i18n.getResource("ar", "translation", key) as string)
  i18n.addResource("ar", "translation", key, value)
}
afterEach(() => {
  cleanup()
  for (const [key, value] of originals) i18n.addResource("ar", "translation", key, value)
  originals.clear()
})

describe("production feature copy wiring", () => {
  it("renders the attachment label from the real resource without changing file selection", () => {
    substitute("featureCopy.inventoryExactAttachments.files", "Attachment label probe")
    let selected: File[] = []
    render(<PurchaseAttachmentFiles draft={{
      files: [], setFiles: files => { selected = files }, batchVersion: 0,
      needsReload: false, error: null, pending: false, upload: async () => {}, valid: true,
    }} />)
    const input = screen.getByLabelText("Attachment label probe")
    const file = new File(["invoice"], "invoice.pdf", { type: "application/pdf" })
    fireEvent.change(input, { target: { files: [file] } })
    expect(selected).toEqual([file])
  })

  it("translates utility labels and interpolated remainder copy without changing the debt direction", () => {
    expect(getDebtDirectionLabel("PAYABLE")).toBe("مستحقات علينا")
    expect(getDebtEntryTypeLabel("ADVANCE")).toBe("سلفة")
    const input = { payableAmount: 1250, receivableAmount: 250, payableDirection: "PAYABLE" as const, receivableDirection: "RECEIVABLE" as const }
    expect(getConsolidationRemainder(input)).toEqual({
      description: "يبقى رصيد 1,000 دج على حساب مستحقات علينا (مستحق علينا).",
      label: "يبقى مستحق علينا 1,000 دج",
    })
    substitute("featureCopy.debtUtils.payable", "Payable label probe")
    substitute("featureCopy.debtUtils.remainingDescription", "Remainder {{value1}} | {{value2}} | {{value3}}")
    expect(getConsolidationRemainder(input)?.description).toBe("Remainder 1,000 | Payable label probe | مستحق علينا")
  })

  it("resolves balance descriptions at the utility call rather than capturing copy at module import", () => {
    expect(getNetDebtBalanceDisplay(0).description).toBe("لا يوجد رصيد مفتوح — الحساب مسوّى.")
    substitute("featureCopy.debtUtils.settledDescription", "Settled description probe")
    expect(getNetDebtBalanceDisplay(0)).toMatchObject({ state: "settled", amount: 0, description: "Settled description probe" })
  })
})
