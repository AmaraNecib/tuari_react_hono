import { i18n as featureI18n } from "@/i18n"
/**
 * Debts feature queries.
 *
 * Feature-scoped data access for the debts domain (Plan 005 Phase 4, issue
 * #177). Legacy numeric query helpers remain for callers not yet moved off
 * the workspace-domain contract. The active externals list and party-detail
 * ledgers now use the exact financial debt summary and detail clients.
 *
 * The legacy numeric detail helper still uses `workspaceQueryKeys`; exact
 * query keys and invalidation live in `debts-exact-queries.ts`.
 */
import { Money, sumMoneyHistory } from "@tuari/contracts"
import type {
  AppError,
  DebtEntry,
  DebtPartyDetail,
  DebtPartySummaryItem,
  DebtsSummary,
  ExactDebtsClient,
  ExternalCounterparty,
} from "@tuari/contracts"

import { AppMutationError } from "@/features/app-shell/workspace-mutations"
import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import { workspaceQueryKeys } from "@/features/app-shell/workspace-keys"
import { rpcClient } from "@/lib/orpc-client"

import { sortDebtEntries } from "./debt-utils"

export type DebtPartyType = "INTERNAL_WORKER" | "EXTERNAL_COUNTERPARTY"

export type DebtsHubRow = {
  accountId: string
  balanceDzd: number
  caseCount: number
  name: string
  partyId: string
  phone: string
  status: "OPEN" | "SETTLED"
  type: "worker" | "external"
}

export type DebtsHubTotals = {
  openCount: number
  owedByUsDzd: number
  owedToUsDzd: number
}

export type ExactDebtSummary = Awaited<ReturnType<ExactDebtsClient["summary"]>>

export type ExternalCounterpartyRow = {
  id: string
  fullName: string
  note: string | null
  openAccountCount: number
  phone: string
  totalBalanceDzd: string
  totalAccountCount: number
}

function requireEntitySuccess<T>(result: {
  success: boolean
  message?: string
  item?: T
  error?: { message: string; code?: AppError["code"]; fieldErrors?: Array<{ field: string; message: string }> }
}) {
  if (!result.success || !result.item) {
    throw new AppMutationError({
      message: result.error?.message ?? featureI18n.t("featureCopy.debtsQueries.loadError"),
      code: result.error?.code,
      fieldErrors: result.error?.fieldErrors,
    })
  }

  return result.item
}

/**
 * Per-party debts detail query (employee debts tab / external detail page).
 *
 * Composes `debtPartyDetail` (the party's accounts and balance) with one
 * `debtEntriesList` call per account, so the ledger panels receive real
 * entries. The query key extends `workspaceQueryKeys.debtsDetail` —
 * every debts mutation invalidates that prefix, so the ledger refreshes
 * after payments, voids, settlements and consolidations.
 */
export function useDebtPartyDetailQuery(
  partyType: DebtPartyType,
  partyId: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useWorkspaceScopedQuery({
    key: (userId) => [...workspaceQueryKeys.debtsDetail(userId), partyType, partyId ?? "missing"],
    enabled: Boolean(partyId) && enabled,
    queryFn: async (): Promise<{
      party: DebtPartyDetail
      accounts: DebtPartyDetail["debtAccounts"]
      entriesByAccountId: Record<string, DebtEntry[]>
    }> => {
      const party = requireEntitySuccess(
        await rpcClient.debtPartyDetail({
          partyType,
          workerId: partyType === "INTERNAL_WORKER" ? partyId! : null,
          externalCounterpartyId: partyType === "EXTERNAL_COUNTERPARTY" ? partyId! : null,
        }),
      )

      const entriesByAccountId: Record<string, DebtEntry[]> = {}
      const entriesPerAccount = await Promise.all(
        party.debtAccounts.map(async (account) => {
          const entries = await rpcClient.debtEntriesList({ debtAccountId: account.id })
          // Deterministic ledger order (entryDate desc, then createdAt desc) —
          // matches the server's listDebtEntries order and the previous
          // composite-derived builder, so the ledger renders the same way
          // regardless of adapter.
          return [account.id, sortDebtEntries(entries.items)] as const
        }),
      )
      for (const [accountId, entries] of entriesPerAccount) {
        entriesByAccountId[accountId] = entries
      }

      return {
        party,
        accounts: party.debtAccounts,
        entriesByAccountId,
      }
    },
  })
}

/**
 * Builds the debts hub rows + totals.
 *
 * Behavior-preserving port of the hub derivation that used to live in
 * `buildDebtDerivedCollections`: worker rows come from the summary parties
 * (only parties with accounts exist there, and INTERNAL_WORKER accounts are
 * worker-only server-side), external rows come from **all** base
 * counterparties enriched with their party summary — zero-account externals
 * stay visible exactly as before.
 */
export function buildDebtsHubRows(
  summary: DebtsSummary,
  externalCounterparties: ExternalCounterparty[],
): { rows: DebtsHubRow[]; totals: DebtsHubTotals } {
  const externalPartyById = new Map<string, DebtPartySummaryItem>(
    summary.parties
      .filter((party) => party.partyType === "EXTERNAL_COUNTERPARTY")
      .map((party) => [party.externalCounterpartyId ?? "", party]),
  )

  const rows: DebtsHubRow[] = [
    ...summary.parties
      .filter((party) => party.partyType === "INTERNAL_WORKER")
      .map((party) => ({
        accountId: `worker:${party.workerId ?? ""}`,
        balanceDzd: party.totalBalanceDzd,
        caseCount: party.openDebtCasesCount + party.settledDebtCasesCount,
        name: party.displayName,
        partyId: party.workerId ?? "",
        phone: party.phoneNumber ?? "",
        status: party.openDebtCasesCount > 0 ? ("OPEN" as const) : ("SETTLED" as const),
        type: "worker" as const,
      })),
    ...externalCounterparties.map((counterparty) => {
      const party = externalPartyById.get(counterparty.id)
      return {
        accountId: `external:${counterparty.id}`,
        balanceDzd: party?.totalBalanceDzd ?? 0,
        caseCount: party ? party.openDebtCasesCount + party.settledDebtCasesCount : 0,
        name: counterparty.fullName,
        partyId: counterparty.id,
        phone: counterparty.phoneNumber,
        status: party && party.openDebtCasesCount > 0 ? ("OPEN" as const) : ("SETTLED" as const),
        type: "external" as const,
      }
    }),
  ].sort((left, right) => {
    if (left.balanceDzd !== right.balanceDzd) {
      return Math.abs(right.balanceDzd) - Math.abs(left.balanceDzd)
    }

    return left.name.localeCompare(right.name, "ar")
  })

  const totals = rows.reduce(
    (accumulator, row) => {
      if (row.balanceDzd > 0) {
        accumulator.owedToUsDzd += row.balanceDzd
      } else if (row.balanceDzd < 0) {
        accumulator.owedByUsDzd += Math.abs(row.balanceDzd)
      }

      if (row.balanceDzd !== 0) {
        accumulator.openCount += 1
      }

      return accumulator
    },
    { openCount: 0, owedByUsDzd: 0, owedToUsDzd: 0 },
  )

  return { rows, totals }
}

/**
 * Builds the externals list rows: base counterparty data joined with the
 * debts summary's per-party balance/case counts (if the party has accounts).
 */
export function buildExternalCounterpartyRows(
  summary: ExactDebtSummary,
  externalCounterparties: ExternalCounterparty[],
): ExternalCounterpartyRow[] {
  const accountsByParty = new Map<string, ExactDebtSummary["accounts"]>()
  for (const account of summary.accounts) {
    if (account.partyType !== "EXTERNAL_COUNTERPARTY" || !account.externalCounterpartyId) continue
    const accounts = accountsByParty.get(account.externalCounterpartyId) ?? []
    accounts.push(account)
    accountsByParty.set(account.externalCounterpartyId, accounts)
  }

  return externalCounterparties
    .map((counterparty) => {
      const accounts = accountsByParty.get(counterparty.id) ?? []
      const totalBalance = sumMoneyHistory(accounts.map(account => {
        const balance = Money.parse(account.currentBalance)
        return account.direction === "PAYABLE" ? balance.negate() : balance
      }))
      return {
        id: counterparty.id,
        fullName: counterparty.fullName,
        note: counterparty.note,
        openAccountCount: accounts.filter(account => account.status === "OPEN").length,
        phone: counterparty.phoneNumber,
        totalBalanceDzd: totalBalance,
        totalAccountCount: accounts.length,
      }
    })
    .sort((left, right) => left.fullName.localeCompare(right.fullName, "ar"))
}
