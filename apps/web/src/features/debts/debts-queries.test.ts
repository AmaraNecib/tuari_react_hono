import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  DebtPartySummaryItem,
  DebtsSummary,
  ExternalCounterparty,
} from "@tuari/contracts"

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useSessionQuery: vi.fn(),
  debtsSummary: vi.fn(),
  debtPartyDetail: vi.fn(),
  debtEntriesList: vi.fn(),
}))

vi.mock("@tanstack/react-query", async () => ({
  ...(await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query")),
  useQuery: mocks.useQuery,
}))

vi.mock("@/features/session/use-session-query", () => ({
  useSessionQuery: mocks.useSessionQuery,
}))

vi.mock("@/lib/orpc-client", () => ({
  rpcClient: {
    debtsSummary: mocks.debtsSummary,
    debtPartyDetail: mocks.debtPartyDetail,
    debtEntriesList: mocks.debtEntriesList,
  },
}))

vi.mock("@/features/app-shell/mock-dashboard", () => {
  class AppMutationError extends Error {
    code: string
    fieldErrors: Array<{ field: string; message: string }>
    constructor(error: { message: string; code?: string; fieldErrors?: Array<{ field: string; message: string }> }) {
      super(error.message)
      this.name = "AppMutationError"
      this.code = error.code ?? "BUSINESS_RULE"
      this.fieldErrors = error.fieldErrors ?? []
    }
  }
  return { AppMutationError }
})

import {
  buildDebtsHubRows,
  buildExternalCounterpartyRows,
  useDebtPartyDetailQuery,
  useDebtsSummaryQuery,
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

/** Reads the useQuery options for the single hook call in the test. */
function readQueryOptions<
  TOptions extends Record<string, unknown> = {
    queryKey: readonly unknown[]
    queryFn: () => Promise<unknown>
    enabled: boolean
  },
>() {
  return mocks.useQuery.mock.calls[0]?.[0] as TOptions
}

describe("buildDebtsHubRows", () => {
  it("builds worker rows from summary parties with totals", () => {
    const { rows, totals } = buildDebtsHubRows(makeSummary([workerParty]), [])

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

  it("aggregates multi-account parties into caseCount and status", () => {
    const multiAccount: DebtPartySummaryItem = {
      ...externalParty,
      externalCounterpartyId: "external-1",
      openDebtCasesCount: 2,
      settledDebtCasesCount: 1,
      totalBalanceDzd: 900,
    }
    const { rows } = buildDebtsHubRows(makeSummary([multiAccount]), counterparties)

    expect(rows[0]).toMatchObject({ caseCount: 3, status: "OPEN" })
  })

  it("keeps zero-balance OPEN parties listed as OPEN but out of openCount totals", () => {
    // A party with an OPEN account whose net balance is exactly 0: the old
    // derived totals only counted non-zero balances, so openCount stays 0
    // while the row still renders as OPEN.
    const zeroBalanceOpen: DebtPartySummaryItem = {
      ...workerParty,
      workerId: "worker-2",
      displayName: "عامل متوازن",
      openDebtCasesCount: 2,
      settledDebtCasesCount: 0,
      totalBalanceDzd: 0,
    }
    const { rows, totals } = buildDebtsHubRows(makeSummary([zeroBalanceOpen]), [])

    expect(rows[0]).toMatchObject({ status: "OPEN", balanceDzd: 0 })
    expect(totals).toEqual({ openCount: 0, owedByUsDzd: 0, owedToUsDzd: 0 })
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

  it("breaks |balance| ties by Arabic name", () => {
    // Worker rows take the party displayName; external rows take the
    // counterparty fullName. All three tie at |balance| = 100, so the sort
    // falls through to Arabic name order (أحمد < شركة المورد < مورد بدون ديون).
    const tieWorker: DebtPartySummaryItem = {
      ...workerParty,
      workerId: "worker-1",
      displayName: "أحمد",
      totalBalanceDzd: 100,
    }
    const tieExternal: DebtPartySummaryItem = {
      ...externalParty,
      externalCounterpartyId: "external-1",
      totalBalanceDzd: 100,
    }
    // Feed the rows in deliberately non-sorted order so a no-op sort would
    // fail the assertion.
    const { rows } = buildDebtsHubRows(
      makeSummary([tieExternal, tieWorker]),
      counterparties,
    )

    expect(rows.map((row) => row.name)).toEqual(["أحمد", "شركة المورد", "مورد بدون ديون"])
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

  it("splits negative worker balances into owedByUsDzd", () => {
    const negativeWorker: DebtPartySummaryItem = {
      ...workerParty,
      workerId: "worker-2",
      displayName: "عامل مدين لنا",
      totalBalanceDzd: -250,
    }
    const { totals } = buildDebtsHubRows(makeSummary([negativeWorker]), [])

    expect(totals).toEqual({ openCount: 1, owedByUsDzd: 250, owedToUsDzd: 0 })
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

  it("aggregates multi-account counts per counterparty", () => {
    const multi: DebtPartySummaryItem = {
      ...externalParty,
      externalCounterpartyId: "external-1",
      openDebtCasesCount: 3,
      settledDebtCasesCount: 2,
    }
    const rows = buildExternalCounterpartyRows(makeSummary([multi]), counterparties)

    expect(rows[0]).toMatchObject({ openCaseCount: 3, totalCaseCount: 5 })
  })

  it("sorts by Arabic name", () => {
    const rows = buildExternalCounterpartyRows(makeSummary([]), counterparties)
    expect(rows.map((row) => row.id)).toEqual(["external-1", "external-2"])
  })

  it("handles an empty counterparties list", () => {
    const rows = buildExternalCounterpartyRows(makeSummary([externalParty]), [])
    expect(rows).toEqual([])
  })

  it("handles an empty summary", () => {
    const rows = buildExternalCounterpartyRows(makeSummary([]), counterparties)
    expect(
      rows.every(
        (row) =>
          row.totalBalanceDzd === 0 && row.openCaseCount === 0 && row.totalCaseCount === 0,
      ),
    ).toBe(true)
  })
})

describe("useDebtsSummaryQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useSessionQuery.mockReturnValue({ data: { user: { id: "user-1" } } })
    mocks.useQuery.mockImplementation((options) => options)
  })

  it("reads the debtsSummary RPC with the invalidated workspace-domain key", () => {
    useDebtsSummaryQuery()

    const options = readQueryOptions<{
      queryKey: readonly unknown[]
      queryFn: () => Promise<DebtsSummary>
      enabled: boolean
    }>()
    expect(options.queryKey).toEqual(["phase1", "workspace-domain", "debts-summary", "user-1"])
    expect(options.enabled).toBe(true)
  })

  it("returns the summary payload", async () => {
    const summary = { parties: [workerParty], debtAccounts: [] }
    mocks.debtsSummary.mockResolvedValue(summary)
    useDebtsSummaryQuery()

    await expect(readQueryOptions().queryFn()).resolves.toEqual(summary)
  })

  it("propagates RPC failures instead of swallowing them", async () => {
    const error = new Error("network down")
    mocks.debtsSummary.mockRejectedValue(error)
    useDebtsSummaryQuery()

    await expect(readQueryOptions().queryFn()).rejects.toBe(error)
  })

  it("disables the query while no session user is present", () => {
    mocks.useSessionQuery.mockReturnValue({ data: { user: null } })
    useDebtsSummaryQuery()

    expect(readQueryOptions().enabled).toBe(false)
  })
  it("honours an explicit enabled: false override", () => {
    useDebtsSummaryQuery({ enabled: false })
    expect(readQueryOptions().enabled).toBe(false)
  })
})

describe("useDebtPartyDetailQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useSessionQuery.mockReturnValue({ data: { user: { id: "user-1" } } })
    mocks.useQuery.mockImplementation((options) => options)
  })

  it("scopes the query key under the debtsDetail domain with the party", () => {
    useDebtPartyDetailQuery("INTERNAL_WORKER", "worker-1")

    const options = readQueryOptions<{ queryKey: readonly unknown[]; enabled: boolean }>()
    expect(options.queryKey).toEqual([
      "phase1",
      "workspace-domain",
      "debts-detail",
      "user-1",
      "INTERNAL_WORKER",
      "worker-1",
    ])
    expect(options.enabled).toBe(true)
  })

  it("passes the workerId for internal workers", async () => {
    const item = {
      partyType: "INTERNAL_WORKER",
      workerId: "worker-1",
      externalCounterpartyId: null,
      displayName: "علي بن حميد",
      phoneNumber: "0555200120",
      note: null,
      totalBalanceDzd: 1500,
      balanceLabel: "لنا عنده",
      debtAccounts: [],
    }
    mocks.debtPartyDetail.mockResolvedValue({ success: true, message: "ok", item })
    useDebtPartyDetailQuery("INTERNAL_WORKER", "worker-1")

    await readQueryOptions().queryFn()
    expect(mocks.debtPartyDetail).toHaveBeenCalledWith({
      partyType: "INTERNAL_WORKER",
      workerId: "worker-1",
      externalCounterpartyId: null,
    })
  })

  it("passes the externalCounterpartyId for external counterparties", async () => {
    const item = {
      partyType: "EXTERNAL_COUNTERPARTY",
      workerId: null,
      externalCounterpartyId: "external-1",
      displayName: "شركة المورد",
      phoneNumber: "0555000000",
      note: null,
      totalBalanceDzd: -700,
      balanceLabel: "علينا له",
      debtAccounts: [],
    }
    mocks.debtPartyDetail.mockResolvedValue({ success: true, message: "ok", item })
    useDebtPartyDetailQuery("EXTERNAL_COUNTERPARTY", "external-1")

    await readQueryOptions().queryFn()
    expect(mocks.debtPartyDetail).toHaveBeenCalledWith({
      partyType: "EXTERNAL_COUNTERPARTY",
      workerId: null,
      externalCounterpartyId: "external-1",
    })
  })

  it("composes debtEntriesList per account into entriesByAccountId", async () => {
    const item = {
      partyType: "EXTERNAL_COUNTERPARTY",
      workerId: null,
      externalCounterpartyId: "external-1",
      displayName: "شركة المورد",
      phoneNumber: "0555000000",
      note: null,
      totalBalanceDzd: -700,
      balanceLabel: "علينا له",
      debtAccounts: [
        { id: "debt-1", currentBalance: -700 },
        { id: "debt-2", currentBalance: 0 },
      ],
    }
    mocks.debtPartyDetail.mockResolvedValue({ success: true, message: "ok", item })
    mocks.debtEntriesList
      .mockResolvedValueOnce({ items: [{ id: "entry-1" }, { id: "entry-2" }] })
      .mockResolvedValueOnce({ items: [] })
    useDebtPartyDetailQuery("EXTERNAL_COUNTERPARTY", "external-1")

    const result = await readQueryOptions().queryFn()

    expect(mocks.debtEntriesList).toHaveBeenNthCalledWith(1, { debtAccountId: "debt-1" })
    expect(mocks.debtEntriesList).toHaveBeenNthCalledWith(2, { debtAccountId: "debt-2" })
    expect(result).toEqual({
      party: item,
      accounts: item.debtAccounts,
      entriesByAccountId: {
        "debt-1": [{ id: "entry-1" }, { id: "entry-2" }],
        "debt-2": [],
      },
    })
  })

  it("throws an AppMutationError when the party detail fails", async () => {
    mocks.debtPartyDetail.mockResolvedValue({
      success: false,
      error: { message: "تعذر العثور على الطرف", code: "NOT_FOUND" },
    })
    useDebtPartyDetailQuery("INTERNAL_WORKER", "worker-1")

    await expect(readQueryOptions().queryFn()).rejects.toMatchObject({
      name: "AppMutationError",
      code: "NOT_FOUND",
      message: "تعذر العثور على الطرف",
    })
  })

  it("uses a stable placeholder key when partyId is missing", () => {
    mocks.useSessionQuery.mockReturnValue({ data: { user: { id: "user-1" } } })
    useDebtPartyDetailQuery("INTERNAL_WORKER", undefined)

    expect(readQueryOptions().queryKey).toEqual([
      "phase1",
      "workspace-domain",
      "debts-detail",
      "user-1",
      "INTERNAL_WORKER",
      "missing",
    ])
  })

  it("throws an AppMutationError when the party detail is missing its item", async () => {
    mocks.debtPartyDetail.mockResolvedValue({ success: true, message: "ok" })
    useDebtPartyDetailQuery("INTERNAL_WORKER", "worker-1")

    await expect(readQueryOptions().queryFn()).rejects.toMatchObject({
      name: "AppMutationError",
      code: "BUSINESS_RULE",
    })
  })

  it("propagates a debtEntriesList failure instead of discarding the party", async () => {
    const item = {
      partyType: "EXTERNAL_COUNTERPARTY",
      workerId: null,
      externalCounterpartyId: "external-1",
      displayName: "شركة المورد",
      phoneNumber: "0555000000",
      note: null,
      totalBalanceDzd: -700,
      balanceLabel: "علينا له",
      debtAccounts: [{ id: "debt-1", currentBalance: -700 }],
    }
    const error = new Error("entries boom")
    mocks.debtPartyDetail.mockResolvedValue({ success: true, message: "ok", item })
    mocks.debtEntriesList.mockRejectedValue(error)
    useDebtPartyDetailQuery("EXTERNAL_COUNTERPARTY", "external-1")

    await expect(readQueryOptions().queryFn()).rejects.toBe(error)
    // The query errors as a whole (react-query surfaces isError) rather than
    // silently rendering a partial party.
    expect(mocks.debtEntriesList).toHaveBeenCalledWith({ debtAccountId: "debt-1" })
  })

  it("disables the query when partyId is missing", () => {
    useDebtPartyDetailQuery("INTERNAL_WORKER", undefined)
    expect(readQueryOptions().enabled).toBe(false)
  })

  it("disables the query when no session user is present", () => {
    mocks.useSessionQuery.mockReturnValue({ data: { user: null } })
    useDebtPartyDetailQuery("INTERNAL_WORKER", "worker-1")
    expect(readQueryOptions().enabled).toBe(false)
  })

  it("honours an explicit enabled: false override", () => {
    useDebtPartyDetailQuery("INTERNAL_WORKER", "worker-1", { enabled: false })
    expect(readQueryOptions().enabled).toBe(false)
  })
})
