import { describe, expect, it } from "vitest"
import { DEBT_BALANCE_STATE_PHRASE } from "@tuari/contracts"

import { ar } from "@/i18n/resources/ar"
import {
  formatDebtAmount,
  formatDebtMoney,
  getDebtAccountBalance,
  getDebtBalanceDisplay,
  getDebtBalanceMeta,
  getDebtDirectionLabel,
  sortDebtAccounts,
} from "./debt-utils"

const ARABIC_STATES = {
  owedToUs: "مستحق لنا",
  owedByUs: "مستحق علينا",
  creditWithUs: "رصيد مستحق لنا",
  creditWithThem: "رصيد مستحق لهم",
  settled: "مسوّى",
} as const

describe("getDebtBalanceDisplay (the single balance display helper)", () => {
  it("shows a positive PAYABLE balance as 'مستحق علينا' with a positive amount", () => {
    const display = getDebtBalanceDisplay({ currentBalance: 600, direction: "PAYABLE" })
    expect(display.state).toBe("owedByUs")
    expect(display.phrase).toBe(ARABIC_STATES.owedByUs)
    expect(display.amount).toBe(600)
    expect(display.amountLabel).toBe("600 دج")
    expect(display.amount).toBeGreaterThan(0)
  })

  it("shows an overpaid PAYABLE balance as 'رصيد مستحق لنا' with the magnitude", () => {
    const display = getDebtBalanceDisplay({ currentBalance: -50_000, direction: "PAYABLE" })
    expect(display.state).toBe("creditWithUs")
    expect(display.phrase).toBe(ARABIC_STATES.creditWithUs)
    expect(display.amount).toBe(50_000)
    expect(display.amountLabel).toBe("50,000 دج")
  })

  it("shows a positive RECEIVABLE balance as 'مستحق لنا' with a positive amount", () => {
    const display = getDebtBalanceDisplay({ currentBalance: 600, direction: "RECEIVABLE" })
    expect(display.state).toBe("owedToUs")
    expect(display.phrase).toBe(ARABIC_STATES.owedToUs)
    expect(display.amount).toBe(600)
  })

  it("shows an overpaid RECEIVABLE balance as 'رصيد مستحق لهم' with the magnitude", () => {
    const display = getDebtBalanceDisplay({ currentBalance: -600, direction: "RECEIVABLE" })
    expect(display.state).toBe("creditWithThem")
    expect(display.phrase).toBe(ARABIC_STATES.creditWithThem)
    expect(display.amount).toBe(600)
  })

  it("shows zero as the settled phrase, never 'مستحق علينا 0'", () => {
    const display = getDebtBalanceDisplay({ currentBalance: 0, direction: "PAYABLE" })
    expect(display.state).toBe("settled")
    expect(display.phrase).toBe(ARABIC_STATES.settled)
    expect(display.amount).toBe(0)
    expect(display.phrase).not.toContain("0")
  })

  it("falls back to sign-only phrasing for a netted party balance", () => {
    expect(getDebtBalanceDisplay({ currentBalance: 2500 }).phrase).toBe(ARABIC_STATES.owedToUs)
    expect(getDebtBalanceDisplay({ currentBalance: -1500 }).phrase).toBe(ARABIC_STATES.owedByUs)
  })
})

describe("getDebtBalanceMeta (sign-only, for aggregated net)", () => {
  it("positive balance is owed to us (emerald)", () => {
    const meta = getDebtBalanceMeta(500)
    expect(meta.shortLabel).toBe(ARABIC_STATES.owedToUs)
    expect(meta.textClassName).toContain("emerald")
  })

  it("negative balance is owed by us (rose)", () => {
    const meta = getDebtBalanceMeta(-500)
    expect(meta.shortLabel).toBe(ARABIC_STATES.owedByUs)
    expect(meta.textClassName).toContain("rose")
  })

  it("zero balance is settled (muted)", () => {
    const meta = getDebtBalanceMeta(0)
    expect(meta.shortLabel).toBe(ARABIC_STATES.settled)
    expect(meta.textClassName).toContain("muted")
  })
})

describe("getDebtDirectionLabel", () => {
  it("returns the direction phrase for PAYABLE", () => {
    expect(getDebtDirectionLabel("PAYABLE")).toBe("مستحقات علينا")
  })

  it("returns the direction phrase for RECEIVABLE", () => {
    expect(getDebtDirectionLabel("RECEIVABLE")).toBe("مستحقات لنا")
  })

  it("keeps the i18n state copy identical to the shared contract phrases", () => {
    expect(ar.translation.debts.terminology.states).toEqual(DEBT_BALANCE_STATE_PHRASE)
  })

  it("keeps the i18n direction and button copy aligned with the shared terms", () => {
    const directions = ar.translation.debts.terminology.directions
    expect(directions.payable).toBe(getDebtDirectionLabel("PAYABLE"))
    expect(directions.receivable).toBe(getDebtDirectionLabel("RECEIVABLE"))
    expect(ar.translation.debts.terminology.buttons.recordPayment).toBe("تسجيل دفعة")
    expect(ar.translation.debts.terminology.buttons.recordDebt).toBe("تسجيل دين")
  })
})

describe("formatDebtAmount", () => {
  it("never renders a sign and groups thousands", () => {
    expect(formatDebtAmount(1500)).toBe("1,500")
    expect(formatDebtAmount(-50_000)).toBe("50,000")
    expect(formatDebtAmount(0)).toBe("0")
    expect(formatDebtAmount(-300)).not.toContain("-")
  })

  it("keeps a nonzero sub-dinar balance from rounding to a bare zero", () => {
    // roundMoney() works in centimes, so 0.4 DZD is a real balance. Rounding it
    // to "0" would pair a direction phrase with a zero amount.
    expect(formatDebtAmount(0.4)).toBe("0.4")
    expect(getDebtBalanceDisplay({ currentBalance: 0.4, direction: "PAYABLE" }).amountLabel).toBe("0.4 دج")
    expect(getDebtBalanceDisplay({ currentBalance: -0.4, direction: "RECEIVABLE" }).amountLabel).toBe("0.4 دج")
  })
})

describe("formatDebtMoney (signed movement formatter)", () => {
  it("formats entry deltas with an explicit sign (useGrouping is disabled)", () => {
    expect(formatDebtMoney(1500)).toBe("+1500")
    expect(formatDebtMoney(-300)).toBe("-300")
    expect(formatDebtMoney(0)).toBe("+0")
  })
})

describe("getDebtAccountBalance", () => {
  it("returns the account balance or 0 for missing", () => {
    expect(getDebtAccountBalance({ currentBalance: 999 } as never)).toBe(999)
    expect(getDebtAccountBalance(null)).toBe(0)
    expect(getDebtAccountBalance(undefined)).toBe(0)
  })
})

describe("sortDebtAccounts", () => {
  it("places OPEN before SETTLED, then orders by most-recently-updated", () => {
    const sorted = sortDebtAccounts([
      { id: "a", status: "OPEN", updatedAt: "2024-01-01T00:00:00Z", createdAt: "2024-01-01T00:00:00Z" } as never,
      { id: "b", status: "SETTLED", updatedAt: "2024-02-01T00:00:00Z", createdAt: "2024-02-01T00:00:00Z" } as never,
      { id: "c", status: "OPEN", updatedAt: "2024-03-01T00:00:00Z", createdAt: "2024-03-01T00:00:00Z" } as never,
    ])
    expect(sorted.map((s) => s.id)).toEqual(["c", "a", "b"])
  })
})
