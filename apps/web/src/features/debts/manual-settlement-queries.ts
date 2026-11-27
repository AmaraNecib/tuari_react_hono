import type { QueryClient } from "@tanstack/react-query"
import type { ExactDebtsClient } from "@tuari/contracts"
import { exactCommercePrefix } from "@/features/shared/exact-commerce-queries"
import { invalidateExactDebtQueries } from "./debts-exact-queries"
import { invalidateExactInventoryDebtQueries } from "@/features/inventory/inventory-exact-queries"
import { settlementClientPrefix, settlementUiClient, type SettlementClientInput } from "./settlement-client"

export async function invalidateSettlementQueries({
  queries,
  client,
  debtClient,
  owner,
}: {
  queries: QueryClient
  client: SettlementClientInput
  debtClient: ExactDebtsClient
  owner: string
}) {
  const source = settlementUiClient(client)
  const tasks = [
    queries.invalidateQueries({ queryKey: settlementClientPrefix(source, owner) }),
    invalidateExactDebtQueries(queries, debtClient, owner),
    invalidateExactInventoryDebtQueries(queries, owner),
  ]
  if (source.kind === "experimental") {
    tasks.push(queries.invalidateQueries({
      queryKey: [...exactCommercePrefix(source.invoices), owner, "experimental-invoices"],
    }))
  }
  await Promise.all(tasks)
}
