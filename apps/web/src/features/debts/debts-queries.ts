/**
 * Debts feature queries.
 *
 * Feature-scoped data access for the debts domain (Plan 005 Phase 4, issue
 * #177). The debts consumers — the debts hub, the externals list, the
 * employee debts tab and the external-counterparty detail page — read from
 * these narrow queries instead of the cross-domain workspace composite, so
 * the debts mutations (which invalidate the `debtsSummary` / `debtsDetail`
 * workspace-domain keys) keep them fresh.
 *
 * Query keys are shared with `workspaceDomainQueryKeys` in
 * `@/features/app-shell/workspace-queries` — that map is the single source
 * of truth for mutation invalidation.
 */
import { useQuery } from "@tanstack/react-query"
import type {
  AppError,
  DebtEntry,
  DebtPartyDetail,
  DebtPartySummaryItem,
  DebtsSummary,
  ExternalCounterparty,
} from "@tuari/contracts"

import { AppMutationError } from "@/features/app-shell/mock-dashboard"
import { workspaceDomainQueryKeys } from "@/features/app-shell/workspace-queries"
import { useSessionQuery } from "@/features/session/use-session-query"
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

export type ExternalCounterpartyRow = {
  id: string
  fullName: string
  note: string | null
  openCaseCount: number
  phone: string
  totalBalanceDzd: number
  totalCaseCount: number
}

function requireEntitySuccess<T>(result: {
  success: boolean
  message?: string
  item?: T
  error?: { message: string; code?: AppError["code"]; fieldErrors?: Array<{ field: string; message: string }> }
}) {
  if (!result.success || !result.item) {
    throw new AppMutationError({
      message: result.error?.message ?? "تعذر تحميل بيانات الديون.",
      code: result.error?.code,
      fieldErrors: result.error?.fieldErrors,
    })
  }

  return result.item
}

/**
 * Debts summary query (hub + externals list data source).
 *
 * Reads `debtsSummary` — the same key the debts mutations invalidate, so the
 * hub always reflects newly created accounts, entries, payments and
 * settlements without a full workspace refetch.
 */
export function useDebtsSummaryQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.debtsSummary(userId),
    queryFn: async (): Promise<DebtsSummary> => rpcClient.debtsSummary(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

/**
 * Per-party debts detail query (employee debts tab / external detail page).
 *
 * Composes `debtPartyDetail` (the party's accounts and balance) with one
 * `debtEntriesList` call per account, so the ledger panels receive real
 * entries. The query key extends `workspaceDomainQueryKeys.debtsDetail` —
 * every debts mutation invalidates that prefix, so the ledger refreshes
 * after payments, voids, settlements and consolidations.
 */
export function useDebtPartyDetailQuery(
  partyType: DebtPartyType,
  partyId: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: [...workspaceDomainQueryKeys.debtsDetail(userId), partyType, partyId ?? "missing"],
    enabled: Boolean(partyId) && Boolean(sessionQuery.data?.user) && enabled,
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
  summary: DebtsSummary,
  externalCounterparties: ExternalCounterparty[],
): ExternalCounterpartyRow[] {
  const partyById = new Map<string, DebtPartySummaryItem>(
    summary.parties
      .filter((party) => party.partyType === "EXTERNAL_COUNTERPARTY")
      .map((party) => [party.externalCounterpartyId ?? "", party]),
  )

  return externalCounterparties
    .map((counterparty) => {
      const party = partyById.get(counterparty.id)
      return {
        id: counterparty.id,
        fullName: counterparty.fullName,
        note: counterparty.note,
        openCaseCount: party?.openDebtCasesCount ?? 0,
        phone: counterparty.phoneNumber,
        totalBalanceDzd: party?.totalBalanceDzd ?? 0,
        totalCaseCount: party ? party.openDebtCasesCount + party.settledDebtCasesCount : 0,
      }
    })
    .sort((left, right) => left.fullName.localeCompare(right.fullName, "ar"))
}
