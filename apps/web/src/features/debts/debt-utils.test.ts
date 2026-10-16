import { describe, expect, it } from "vitest"
import { DEBT_BALANCE_STATE_PHRASE } from "@tuari/contracts"

import { ar } from "@/i18n/resources/ar"
import {
  debtDirectionFromAlias,
  formatDebtAmount,
  formatDebtMoney,
  getConsolidationRemainder,
  getDebtAccountBalanceDisplay,
  getDebtDirectionLabel,
  getNetDebtBalanceDisplay,
  matchesDebtHubFilter,
  resolveDebtCasesFormAction,
  sortDebtAccounts,
} from "./debt-utils"

const ARABIC_STATES = {
  owedToUs: "مستحق لنا",
  owedByUs: "مستحق علينا",
  creditWithUs: "رصيد مستحق لنا",
  creditWithThem: "رصيد مستحق لهم",
  settled: "مسوّى",
} as const

describe("getDebtAccountBalanceDisplay (the direction-aware balance helper)", () => {
  it("shows a positive PAYABLE balance as 'مستحق علينا' with a positive amount", () => {
    const display = getDebtAccountBalanceDisplay({ currentBalance: 600, direction: "PAYABLE" })
    expect(display.state).toBe("owedByUs")
    expect(display.phrase).toBe(ARABIC_STATES.owedByUs)
    expect(display.amount).toBe(600)
    expect(formatDebtAmount(display.amount)).toBe("600")
    expect(display.amount).toBeGreaterThan(0)
  })

  it("shows an overpaid PAYABLE balance as 'رصيد مستحق لنا' with the magnitude", () => {
    const display = getDebtAccountBalanceDisplay({ currentBalance: -50_000, direction: "PAYABLE" })
    expect(display.state).toBe("creditWithUs")
    expect(display.phrase).toBe(ARABIC_STATES.creditWithUs)
    expect(display.amount).toBe(50_000)
    expect(formatDebtAmount(display.amount)).toBe("50,000")
  })

  it("shows a positive RECEIVABLE balance as 'مستحق لنا' with a positive amount", () => {
    const display = getDebtAccountBalanceDisplay({ currentBalance: 600, direction: "RECEIVABLE" })
    expect(display.state).toBe("owedToUs")
    expect(display.phrase).toBe(ARABIC_STATES.owedToUs)
    expect(display.amount).toBe(600)
  })

  it("shows an overpaid RECEIVABLE balance as 'رصيد مستحق لهم' with the magnitude", () => {
    const display = getDebtAccountBalanceDisplay({ currentBalance: -600, direction: "RECEIVABLE" })
    expect(display.state).toBe("creditWithThem")
    expect(display.phrase).toBe(ARABIC_STATES.creditWithThem)
    expect(display.amount).toBe(600)
  })

  it("shows zero as the settled phrase, never 'مستحق علينا 0'", () => {
    const display = getDebtAccountBalanceDisplay({ currentBalance: 0, direction: "PAYABLE" })
    expect(display.state).toBe("settled")
    expect(display.phrase).toBe(ARABIC_STATES.settled)
    expect(display.amount).toBe(0)
    expect(display.phrase).not.toContain("0")
  })

  it("refuses a direction-less account instead of falling back to the sign", () => {
    expect(() =>
      getDebtAccountBalanceDisplay({ currentBalance: 2500 } as unknown as { currentBalance: number; direction: "PAYABLE" }),
    ).toThrow()
  })
})

describe("getNetDebtBalanceDisplay (the sign-only net helper)", () => {
  it("phrases a positive net as owed to us", () => {
    expect(getNetDebtBalanceDisplay(2500).phrase).toBe(ARABIC_STATES.owedToUs)
  })

  it("phrases a negative net as owed by us with the magnitude", () => {
    const display = getNetDebtBalanceDisplay(-1500)
    expect(display.phrase).toBe(ARABIC_STATES.owedByUs)
    expect(display.amount).toBe(1500)
  })

  it("phrases zero as settled", () => {
    expect(getNetDebtBalanceDisplay(0).state).toBe("settled")
  })
})

describe("getConsolidationRemainder", () => {
  const base = {
    payableDirection: "PAYABLE" as const,
    receivableDirection: "RECEIVABLE" as const,
  }

  it("phrases a payable remainder as owed by us, never owed to us", () => {
    const preview = getConsolidationRemainder({
      ...base,
      payableAmount: 5000,
      receivableAmount: 2000,
    })
    expect(preview?.label).toBe("يبقى مستحق علينا 3,000 دج")
    expect(preview?.description).not.toContain("مستحق لنا")
  })

  it("phrases a receivable remainder as owed to us, never owed by us", () => {
    const preview = getConsolidationRemainder({
      ...base,
      payableAmount: 2000,
      receivableAmount: 5000,
    })
    expect(preview?.label).toBe("يبقى مستحق لنا 3,000 دج")
    expect(preview?.description).not.toContain("مستحق علينا")
  })

  it("returns the full-cancel preview when the openings are equal", () => {
    expect(
      getConsolidationRemainder({ ...base, payableAmount: 3000, receivableAmount: 3000 }),
    ).toEqual({
      description: "سيتم إلغاء الحركتين بالكامل. لا يبقى رصيد.",
      label: "إلغاء تام",
    })
  })

  it("returns null until both sides are selected", () => {
    expect(
      getConsolidationRemainder({ ...base, payableAmount: null, receivableAmount: 2000 }),
    ).toBeNull()
    expect(
      getConsolidationRemainder({ ...base, payableAmount: 2000, receivableAmount: null }),
    ).toBeNull()
  })
})

describe("movement tone follows the account direction", () => {
  it("a positive PAYABLE movement reads as a debt increase (rose)", () => {
    expect(
      getDebtAccountBalanceDisplay({ currentBalance: 5000, direction: "PAYABLE" }).textClassName,
    ).toContain("rose")
  })

  it("a positive RECEIVABLE movement reads as an increase for them (emerald)", () => {
    expect(
      getDebtAccountBalanceDisplay({ currentBalance: 5000, direction: "RECEIVABLE" }).textClassName,
    ).toContain("emerald")
  })
})

describe("debtDirectionFromAlias", () => {
  it("maps the UI alias to the domain direction", () => {
    expect(debtDirectionFromAlias("owed-to-us")).toBe("RECEIVABLE")
    expect(debtDirectionFromAlias("owed-by-us")).toBe("PAYABLE")
  })
})

describe("getDebtDirectionLabel", () => {
  it("returns the direction phrase for PAYABLE", () => {
    expect(getDebtDirectionLabel("PAYABLE")).toBe("مستحقات علينا")
  })

  it("returns the direction phrase for RECEIVABLE", () => {
    expect(getDebtDirectionLabel("RECEIVABLE")).toBe("مستحقات لنا")
  })

  it("renders the state phrase from the shared contract table (single source, no i18n copy)", () => {
    expect(getDebtAccountBalanceDisplay({ currentBalance: 600, direction: "PAYABLE" }).phrase).toBe(
      DEBT_BALANCE_STATE_PHRASE.owedByUs,
    )
    expect(getNetDebtBalanceDisplay(2500).phrase).toBe(DEBT_BALANCE_STATE_PHRASE.owedToUs)
  })

  it("keeps the i18n button copy aligned with the shared terms", () => {
    expect(ar.translation.debts.terminology.buttons.recordPayment).toBe("تسجيل دفعة")
    expect(ar.translation.debts.terminology.buttons.recordDebt).toBe("تسجيل دين")
  })
})

describe("matchesDebtHubFilter (the hub row predicate)", () => {
  const openOwedToUs = { status: "OPEN" as const, balanceDzd: 500 }
  const openOwedByUs = { status: "OPEN" as const, balanceDzd: -500 }
  const settled = { status: "SETTLED" as const, balanceDzd: 0 }

  it("all matches every row", () => {
    expect(matchesDebtHubFilter(openOwedToUs, "all")).toBe(true)
    expect(matchesDebtHubFilter(openOwedByUs, "all")).toBe(true)
    expect(matchesDebtHubFilter(settled, "all")).toBe(true)
  })

  it("owed-to-us matches an open positive balance only", () => {
    expect(matchesDebtHubFilter(openOwedToUs, "owed-to-us")).toBe(true)
    expect(matchesDebtHubFilter(openOwedByUs, "owed-to-us")).toBe(false)
    expect(matchesDebtHubFilter(settled, "owed-to-us")).toBe(false)
  })

  it("owed-by-us matches an open negative balance only", () => {
    expect(matchesDebtHubFilter(openOwedByUs, "owed-by-us")).toBe(true)
    expect(matchesDebtHubFilter(openOwedToUs, "owed-by-us")).toBe(false)
    expect(matchesDebtHubFilter(settled, "owed-by-us")).toBe(false)
  })

  it("settled matches the settled status regardless of sign", () => {
    expect(matchesDebtHubFilter(settled, "settled")).toBe(true)
    expect(matchesDebtHubFilter(openOwedToUs, "settled")).toBe(false)
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
    expect(formatDebtAmount(-0.4)).toBe("0.4")
  })
})

describe("formatDebtMoney (signed movement formatter)", () => {
  it("formats entry deltas with an explicit sign (useGrouping is disabled)", () => {
    expect(formatDebtMoney(1500)).toBe("+1500")
    expect(formatDebtMoney(-300)).toBe("-300")
    expect(formatDebtMoney(0)).toBe("+0")
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

describe("resolveDebtCasesFormAction (the label/action seam for #459)", () => {
  const account = (direction: "PAYABLE" | "RECEIVABLE", id: string) =>
    ({ direction, id }) as never

  it("posts a payment when the chosen ledger already has an account", () => {
    const payable = account("PAYABLE", "debt-payable")
    expect(resolveDebtCasesFormAction([payable], "PAYABLE")).toEqual({
      kind: "record-payment",
      account: payable,
    })
  })

  it("opens an account when the party has none", () => {
    expect(resolveDebtCasesFormAction([], "PAYABLE")).toEqual({ kind: "create-account" })
  })

  it("does not let a different-direction account satisfy the chosen ledger", () => {
    const payable = account("PAYABLE", "debt-payable")
    expect(resolveDebtCasesFormAction([payable], "RECEIVABLE")).toEqual({ kind: "create-account" })
  })

  it("picks the account on the chosen ledger when both exist", () => {
    const payable = account("PAYABLE", "debt-payable")
    const receivable = account("RECEIVABLE", "debt-receivable")
    expect(resolveDebtCasesFormAction([payable, receivable], "RECEIVABLE")).toEqual({
      kind: "record-payment",
      account: receivable,
    })
  })
})
