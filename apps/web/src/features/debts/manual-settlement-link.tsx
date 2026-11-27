import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import type { ExactDebtDetail } from "@tuari/contracts"
import { ManualSettlementSummary } from "./manual-settlement-summary"
import { useSessionQuery } from "@/features/session/use-session-query"
import { settlementClientPrefix, settlementUiClient, type SettlementClientInput } from "./settlement-client"

export function ManualSettlementLink({ client, accountId, entryId, entries }: { client: SettlementClientInput; accountId: string; entryId: string; entries?: ExactDebtDetail["entries"] }) {
  const { t } = useTranslation()
  const owner = useSessionQuery().data?.user?.id
  const source = settlementUiClient(client)
  const result = useQuery({ queryKey: [...settlementClientPrefix(source, owner ?? ""), "account", accountId], enabled: Boolean(owner), retry: false, queryFn: () => source.client.accountHistory({ debtAccountId: accountId }) })
  if (result.isError) {
    if ("code" in result.error && result.error.code === "SERVICE_UNAVAILABLE") return null
    return <p role="alert">{t("manualSettlement.loadError")}</p>
  }
  const rows = result.data?.items.filter(item => [item.payableOriginalEntryId, item.receivableOriginalEntryId, item.payableSettlementEntryId, item.receivableSettlementEntryId, item.reversal?.payableReversalEntryId, item.reversal?.receivableReversalEntryId].includes(entryId))
  return <>{rows?.map(item => <ManualSettlementSummary key={item.id} item={item} entries={entries} />)}</>
}
