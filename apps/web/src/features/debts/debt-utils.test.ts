import { describe, expect, it } from "vitest"

import {
  formatDebtMoney,
  getDebtAccountBalance,
  getDebtAccountBalanceMeta,
  getDebtBalanceMeta,
  getDebtDirectionLabel,
  sortDebtAccounts,
} from "./debt-utils"

describe("getDebtBalanceMeta (sign-only, for aggregated net)", () => {
  it("positive balance is a receivable (emerald)", () => {
    const meta = getDebtBalanceMeta(500)
    expect(meta.shortLabel).toBe("لنا عنده")
    expect(meta.textClassName).toContain("emerald")
  })

  it("negative balance is a payable (rose)", () => {
    const meta = getDebtBalanceMeta(-500)
    expect(meta.shortLabel).toBe("علينا له")
    expect(meta.textClassName).toContain("rose")
  })

  it("zero balance is closed (muted)", () => {
    const meta = getDebtBalanceMeta(0)
    expect(meta.shortLabel).toBe("مغلق")
    expect(meta.textClassName).toContain("muted")
  })
})

describe("getDebtAccountBalanceMeta (direction-aware)", () => {
  it("positive balance on a PAYABLE account means we owe them (rose)", () => {
    // Issue #22: the sign convention is balance-based. A positive
    // balance on a PAYABLE ledger is the amount the counterparty is
    // owed — we owe them.
    const meta = getDebtAccountBalanceMeta({ currentBalance: 1500, direction: "PAYABLE" })
    expect(meta.shortLabel).toBe("علينا له")
    expect(meta.textClassName).toContain("rose")
  })

  it("positive balance on a RECEIVABLE account means they owe us (emerald)", () => {
    const meta = getDebtAccountBalanceMeta({ currentBalance: 500, direction: "RECEIVABLE" })
    expect(meta.shortLabel).toBe("لنا عنده")
    expect(meta.textClassName).toContain("emerald")
  })

  it("negative balance on a PAYABLE account flips the meaning (emerald)", () => {
    // We overpaid: the supplier now owes us.
    const meta = getDebtAccountBalanceMeta({ currentBalance: -300, direction: "PAYABLE" })
    expect(meta.shortLabel).toBe("لنا عنده")
    expect(meta.textClassName).toContain("emerald")
  })

  it("negative balance on a RECEIVABLE account flips the meaning (rose)", () => {
    // The customer overpaid us: we now owe them.
    const meta = getDebtAccountBalanceMeta({ currentBalance: -200, direction: "RECEIVABLE" })
    expect(meta.shortLabel).toBe("علينا له")
    expect(meta.textClassName).toContain("rose")
  })

  it("zero balance is closed regardless of direction", () => {
    expect(getDebtAccountBalanceMeta({ currentBalance: 0, direction: "PAYABLE" }).shortLabel).toBe("مغلق")
    expect(getDebtAccountBalanceMeta({ currentBalance: 0, direction: "RECEIVABLE" }).shortLabel).toBe("مغلق")
  })
})

describe("getDebtDirectionLabel", () => {
  it("returns the Arabic label for PAYABLE", () => {
    expect(getDebtDirectionLabel("PAYABLE")).toBe("علينا له")
  })

  it("returns the Arabic label for RECEIVABLE", () => {
    expect(getDebtDirectionLabel("RECEIVABLE")).toBe("لنا عنده")
  })
})

describe("formatDebtMoney", () => {
  it("formats integers with explicit sign (useGrouping is disabled)", () => {
    // The formatter is intentionally configured without grouping
    // separators so the number stays compact in tables and side-by-side
    // comparisons. Test that the sign is always present.
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