import { describe, expect, it } from "vitest"
import type { DebtPartySummaryItem, DebtsSummary, ExternalCounterparty } from "@tuari/contracts"

import {
  buildDebtsHubRows,
  buildExternalCounterpartyRows,
} from "./debts-queries"

const workerParty: DebtPartySummaryItem = {
  partyType: "INTERNAL_WORKER",
  workerId: "worker-1",
  externalCounterpartyId: null,
  displayName: "علي بن حميد",
  phoneNumber: "0555200120",
  totalBalanceDzd: 1500,
  balanceLabel: "لنا عنده",
  openDebtCasesCount: 1,
  settledDebtCasesCount: 0,
  latestActivityAt: "2026-03-28T10:00:00.000Z",
}

const externalParty: DebtPartySummaryItem = {
  partyType: "EXTERNAL_COUNTERPARTY",
  workerId: null,
  externalCounterpartyId: "external-1",
  displayName: "شركة المورد",
  phoneNumber: "0555000000",
  totalBalanceDzd: -700,
  balanceLabel: "علينا له",
  openDebtCasesCount: 1,
  settledDebtCasesCount: 1,
  latestActivityAt: "2026-03-28T10:00:00.000Z",
}

const counterparties: ExternalCounterparty[] = [
  {
    id: "external-1",
    fullName: "شركة المورد",
    phoneNumber: "0555000000",
    note: "ملاحظة",
    createdAt: "2026-03-27T10:00:00.000Z",
    updatedAt: "2026-03-27T10:00:00.000Z",
  },
  {
    id: "external-2",
    fullName: "مورد بدون ديون",
    phoneNumber: "0555111111",
    note: null,
    createdAt: "2026-03-27T10:00:00.000Z",
    updatedAt: "2026-03-27T10:00:00.000Z",
  },
]

function makeSummary(parties: DebtPartySummaryItem[]): DebtsSummary {
  return { parties, debtAccounts: [] }
}

describe("buildDebtsHubRows", () => {
  it("builds worker rows from summary parties with totals", () => {
    const { rows, totals } = buildDebtsHubRows(
      makeSummary([workerParty]),
      [],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      balanceDzd: 1500,
      caseCount: 1,
      name: "علي بن حميد",
      partyId: "worker-1",
      phone: "0555200120",
      status: "OPEN",
      type: "worker",
    })
    expect(totals).toEqual({ openCount: 1, owedByUsDzd: 0, owedToUsDzd: 1500 })
  })

  it("keeps zero-account externals visible with a zero balance (behavior preservation)", () => {
    const { rows, totals } = buildDebtsHubRows(
      makeSummary([externalParty]),
      counterparties,
    )

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      accountId: "external:external-1",
      balanceDzd: -700,
      caseCount: 2,
      name: "شركة المورد",
      partyId: "external-1",
      status: "OPEN",
      type: "external",
    })
    // Zero-account external still listed, settled, zero balance
    expect(rows[1]).toMatchObject({
      accountId: "external:external-2",
      balanceDzd: 0,
      caseCount: 0,
      name: "مورد بدون ديون",
      status: "SETTLED",
      type: "external",
    })
    expect(totals).toEqual({ openCount: 1, owedByUsDzd: 700, owedToUsDzd: 0 })
  })

  it("sorts by |balance| descending then Arabic name", () => {
    const bigExternal: DebtPartySummaryItem = {
      ...externalParty,
      externalCounterpartyId: "external-1",
      totalBalanceDzd: 3000,
    }
    const { rows } = buildDebtsHubRows(makeSummary([workerParty, bigExternal]), counterparties)

    expect(rows[0]!.name).toBe("شركة المورد")
    expect(rows[1]!.name).toBe("علي بن حميد")
    // zero-account external sinks to the bottom
    expect(rows[2]!.name).toBe("مورد بدون ديون")
  })

  it("marks settled parties SETTLED and excludes them from openCount", () => {
    const settled: DebtPartySummaryItem = {
      ...workerParty,
      workerId: "worker-2",
      openDebtCasesCount: 0,
      settledDebtCasesCount: 1,
      totalBalanceDzd: 0,
      displayName: "عامل مسوى",
    }
    const { rows, totals } = buildDebtsHubRows(makeSummary([settled]), [])

    expect(rows[0]!.status).toBe("SETTLED")
    expect(totals.openCount).toBe(0)
  })

  it("handles an empty summary and empty counterparties", () => {
    const { rows, totals } = buildDebtsHubRows(makeSummary([]), [])
    expect(rows).toEqual([])
    expect(totals).toEqual({ openCount: 0, owedByUsDzd: 0, owedToUsDzd: 0 })
  })
})

describe("buildExternalCounterpartyRows", () => {
  it("joins summary balances with base counterparty data", () => {
    const rows = buildExternalCounterpartyRows(makeSummary([externalParty]), counterparties)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      id: "external-1",
      fullName: "شركة المورد",
      note: "ملاحظة",
      openCaseCount: 1,
      phone: "0555000000",
      totalBalanceDzd: -700,
      totalCaseCount: 2,
    })
    expect(rows[1]).toMatchObject({
      id: "external-2",
      fullName: "مورد بدون ديون",
      openCaseCount: 0,
      totalBalanceDzd: 0,
      totalCaseCount: 0,
    })
  })

  it("sorts by Arabic name", () => {
    const rows = buildExternalCounterpartyRows(makeSummary([]), counterparties)
    expect(rows.map((row) => row.id)).toEqual(["external-1", "external-2"])
  })

  it("handles an empty summary", () => {
    const rows = buildExternalCounterpartyRows(makeSummary([]), counterparties)
    expect(rows.every((row) => row.totalBalanceDzd === 0 && row.openCaseCount === 0)).toBe(true)
  })
})
