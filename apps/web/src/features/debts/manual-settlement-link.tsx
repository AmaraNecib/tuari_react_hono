import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { AppDate } from "@/components/app-date"
import { useSessionQuery } from "@/features/session/use-session-query"
import { manualSettlementScope, type ManualSettlementClient } from "./manual-settlement-panel"

export function ManualSettlementLink({ client, accountId, entryId }: { client: ManualSettlementClient; accountId: string; entryId: string }) {
  const { t } = useTranslation()
  const owner = useSessionQuery().data?.user?.id
  const result = useQuery({ queryKey: ["manual-settlement", manualSettlementScope(client), owner, "account", accountId], enabled: Boolean(owner), retry: false, queryFn: () => client.accountHistory({ debtAccountId: accountId }) })
  if (result.isError) return <p role="alert">{t("manualSettlement.loadError")}</p>
  const rows = result.data?.items.filter(item => [item.payableOriginalEntryId, item.receivableOriginalEntryId, item.payableSettlementEntryId, item.receivableSettlementEntryId, item.reversal?.payableReversalEntryId, item.reversal?.receivableReversalEntryId].includes(entryId))
  return <>{rows?.map(item => <div key={item.id} data-manual-settlement-id={item.id} className="max-w-prose space-y-1 whitespace-normal break-words text-sm">
    <p>{t("manualSettlement.title")} · <bdi className="break-all" dir="ltr">{item.id}</bdi> · {t(item.reversal ? "manualSettlement.reversed" : "manualSettlement.live")}</p>
    <p>{t("manualSettlement.linked")}: <bdi className="break-all" dir="ltr">{item.payableOriginalEntryId} / {item.receivableOriginalEntryId}</bdi></p>
    <p><AppDate value={item.recordedAt} includeTime /> · {item.actorLabel} · {item.note}</p>
    {item.reversal && <p data-manual-reversal-id={item.reversal.id}><bdi className="break-all" dir="ltr">{item.reversal.id}</bdi> · <AppDate value={item.reversal.recordedAt} includeTime /> · {item.reversal.actorLabel} · {item.reversal.reason}</p>}
  </div>)}</>
}
