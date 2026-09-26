import { describe, expect, it } from "vitest"

import type { DebtsSummary } from "@tuari/contracts"

import { buildDashboardBusinessCounters } from "./dashboard-metrics"

function makeDebtsSummary(
  accounts: Array<{ status: "OPEN" | "SETTLED"; currentBalance: number }>,
): DebtsSummary {
  return {
    parties: [],
    debtAccounts: accounts.map((account, index) => ({
      accountId: `debt-${index}`,
      partyType: "EXTERNAL_COUNTERPARTY",
      workerId: null,
      externalCounterpartyId: `external-${index}`,
      displayName: `طرف ${index}`,
      phoneNumber: null,
      status: account.status,
      direction: "PAYABLE" as const,
      currentBalance: account.currentBalance,
      balanceLabel: "علينا له" as const,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    })),
  }
}

describe("buildDashboardBusinessCounters (issue #23)", () => {
  it("sums only OPEN debt accounts into the outstanding balance", () => {
    const result = buildDashboardBusinessCounters({
      debtsSummary: makeDebtsSummary([
        { status: "OPEN", currentBalance: 1500 },
        { status: "OPEN", currentBalance: 700 },
        { status: "SETTLED", currentBalance: 4000 },
      ]),
      invoiceGroups: [],
      itemDefinitions: [],
    })

    expect(result.outstandingDebtsDzd).toBe(2200)
  })

  it("counts only invoice groups with a remaining (unpaid) debt", () => {
    const result = buildDashboardBusinessCounters({
      debtsSummary: undefined,
      invoiceGroups: [
        {
          id: "inv-1",
          invoiceNumber: "F-001",
          supplierName: "مورد 1",
          invoiceDate: null,
          warehouseId: null,
          projectId: null,
          externalCounterpartyId: null,
          grossTotalDzd: 1000,
          paidAmountDzd: 1000,
          remainingDebtDzd: 0,
          debtAccountId: null,
          note: null,
          createdAt: "2026-03-13T10:00:00.000Z",
          updatedAt: "2026-03-13T10:00:00.000Z",
        },
        {
          id: "inv-2",
          invoiceNumber: "F-002",
          supplierName: "مورد 2",
          invoiceDate: null,
          warehouseId: null,
          projectId: null,
          externalCounterpartyId: null,
          grossTotalDzd: 2500,
          paidAmountDzd: 0,
          remainingDebtDzd: 2500,
          debtAccountId: null,
          note: null,
          createdAt: "2026-03-13T10:00:00.000Z",
          updatedAt: "2026-03-13T10:00:00.000Z",
        },
        {
          id: "inv-3",
          invoiceNumber: "F-003",
          supplierName: "مورد 3",
          invoiceDate: null,
          warehouseId: null,
          projectId: null,
          externalCounterpartyId: null,
          grossTotalDzd: 100,
          paidAmountDzd: 0,
          remainingDebtDzd: 100,
          debtAccountId: null,
          note: null,
          createdAt: "2026-03-13T10:00:00.000Z",
          updatedAt: "2026-03-13T10:00:00.000Z",
        },
      ],
      itemDefinitions: [],
    })

    expect(result.openInvoices).toBe(2)
  })

  it("counts all item definitions as the item total", () => {
    const result = buildDashboardBusinessCounters({
      debtsSummary: undefined,
      invoiceGroups: [],
      itemDefinitions: [
        { id: "item-1", name: "مادة 1", itemType: "CONSUMABLE", unit: "قطعة", description: null, isActive: true, createdAt: "2026-03-13T10:00:00.000Z", updatedAt: "2026-03-13T10:00:00.000Z" },
        { id: "item-2", name: "مادة 2", itemType: "ASSET", unit: null, description: null, isActive: true, createdAt: "2026-03-13T10:00:00.000Z", updatedAt: "2026-03-13T10:00:00.000Z" },
        { id: "item-3", name: "مادة 3", itemType: "CONSUMABLE", unit: "لتر", description: null, isActive: false, createdAt: "2026-03-13T10:00:00.000Z", updatedAt: "2026-03-13T10:00:00.000Z" },
      ],
    })

    expect(result.items).toBe(3)
  })

  it("returns zeros for absent query data (loading / empty account)", () => {
    const result = buildDashboardBusinessCounters({
      debtsSummary: undefined,
      invoiceGroups: undefined,
      itemDefinitions: undefined,
    })

    expect(result).toEqual({ openInvoices: 0, outstandingDebtsDzd: 0, items: 0 })
  })

  it("keeps OPEN zero-balance accounts out of the outstanding total", () => {
    const result = buildDashboardBusinessCounters({
      debtsSummary: makeDebtsSummary([
        { status: "OPEN", currentBalance: 0 },
        { status: "OPEN", currentBalance: 500 },
      ]),
      invoiceGroups: [],
      itemDefinitions: [],
    })

    expect(result.outstandingDebtsDzd).toBe(500)
  })
})