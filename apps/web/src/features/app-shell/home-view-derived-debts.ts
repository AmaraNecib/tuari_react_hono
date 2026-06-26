import { getCombinedDebtBalance, sortDebtAccounts } from "@/features/debts/debt-utils"

import type { DemoWorkspace } from "./workspace-queries"

/** Derives debt summary data from workspace. */
export function buildDebtDerivedCollections({
  employeeRows,
  workspace,
}: {
  employeeRows: Array<{ id: string; name: string; phone: string; roleKey: string }>
  workspace: DemoWorkspace
}) {
  const debtAccountById = new Map(workspace.debtAccounts.map((account) => [account.id, account]))
  const workerById = new Map(employeeRows.map((employee) => [employee.id, employee]))
  const counterpartyById = new Map(
    workspace.externalCounterparties.map((counterparty) => [counterparty.id, counterparty]),
  )

  const debtEntriesByAccountId = Object.fromEntries(
    workspace.debtAccounts.map((account) => [
      account.id,
      [...workspace.debtEntries]
        .filter((entry) => entry.debtAccountId === account.id)
        .sort((left, right) => {
          const byEntryDate = right.entryDate.localeCompare(left.entryDate)
          return byEntryDate !== 0 ? byEntryDate : right.createdAt.localeCompare(left.createdAt)
        }),
    ]),
  ) as Record<string, DemoWorkspace["debtEntries"]>

  const debtAccountsByWorkerId = new Map<string, DemoWorkspace["debtAccounts"]>()
  const debtAccountsByExternalCounterpartyId = new Map<string, DemoWorkspace["debtAccounts"]>()

  for (const account of workspace.debtAccounts) {
    if (account.workerId) {
      debtAccountsByWorkerId.set(account.workerId, [...(debtAccountsByWorkerId.get(account.workerId) ?? []), account])
    }

    if (account.externalCounterpartyId) {
      debtAccountsByExternalCounterpartyId.set(account.externalCounterpartyId, [
        ...(debtAccountsByExternalCounterpartyId.get(account.externalCounterpartyId) ?? []),
        account,
      ])
    }
  }

  const externalCounterparties = workspace.externalCounterparties
    .map((counterparty) => {
      const accounts = sortDebtAccounts(debtAccountsByExternalCounterpartyId.get(counterparty.id) ?? [])

      return {
        ...counterparty,
        phone: counterparty.phoneNumber,
        accounts,
        openCaseCount: accounts.filter((account) => account.status === "OPEN").length,
        totalBalanceDzd: getCombinedDebtBalance(accounts),
      }
    })
    .sort((left, right) => left.fullName.localeCompare(right.fullName, "ar"))

  const debtHubRows = [
    ...employeeRows
      .filter((employee) => employee.roleKey === "worker")
      .map((employee) => {
        const accounts = sortDebtAccounts(debtAccountsByWorkerId.get(employee.id) ?? [])
        const balanceDzd = getCombinedDebtBalance(accounts)

        return {
          accountId: accounts[0]?.id ?? `worker:${employee.id}`,
          balanceDzd,
          caseCount: accounts.length,
          name: employee.name,
          partyId: employee.id,
          phone: employee.phone,
          status: accounts.some((account) => account.status === "OPEN") ? ("OPEN" as const) : ("SETTLED" as const),
          type: "worker" as const,
        }
      })
      .filter((row) => row.caseCount > 0),
    ...externalCounterparties.map((counterparty) => ({
      accountId: counterparty.accounts[0]?.id ?? `external:${counterparty.id}`,
      balanceDzd: counterparty.totalBalanceDzd,
      caseCount: counterparty.accounts.length,
      name: counterparty.fullName,
      partyId: counterparty.id,
      phone: counterparty.phone,
      status: counterparty.accounts.some((account) => account.status === "OPEN") ? ("OPEN" as const) : ("SETTLED" as const),
      type: "external" as const,
    })),
  ].sort((left, right) => {
    if (left.balanceDzd !== right.balanceDzd) {
      return Math.abs(right.balanceDzd) - Math.abs(left.balanceDzd)
    }

    return left.name.localeCompare(right.name, "ar")
  })

  const totals = debtHubRows.reduce(
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

  return {
    debtAccountById,
    debtAccountsByExternalCounterpartyId,
    debtAccountsByWorkerId,
    debtEntriesByAccountId,
    debtHubRows,
    debtTotals: totals,
    externalCounterparties,
    externalCounterpartyById: counterpartyById,
    workerById,
  }
}
