import type { ExactInventoryCharge, ExactInventoryClient } from "@tuari/contracts"
import { useTranslation } from "react-i18next"
import { AppDate } from "@/components/app-date"
import { Button } from "@/components/ui/button"
import { MoneyValue } from "@/features/shared/money-value"
import { useExactAssetHistory } from "./inventory-exact-queries"

export function ExactAssetHistory({ client, assetUnitId }: { client: ExactInventoryClient; assetUnitId: string }) {
  const { t } = useTranslation()
  const history = useExactAssetHistory(client, assetUnitId)
  if (history.isPending) return <p role="status">{t("inventory.chargeHistory.loading")}</p>
  if (history.isError || history.data?.assetUnitId !== assetUnitId) return (
    <div role="alert">{t("inventory.chargeHistory.loadError")} <Button variant="outline" onClick={() => void history.refetch()}>{t("common.retry")}</Button></div>
  )
  if (!history.data.items.length) return <p>{t("inventory.chargeHistory.empty")}</p>
  return <div className="space-y-3">{history.data.items.map(charge => <Placement key={charge.id} charge={charge} />)}</div>
}

function Placement({ charge }: { charge: ExactInventoryCharge }) {
  const { t } = useTranslation()
  const money = (value: string) => <MoneyValue exact value={value} currencyLabel={t("common.currency")} />
  return (
    <article className="min-w-0 space-y-2 rounded-md border border-line p-3 text-sm [overflow-wrap:anywhere]">
      <h3 className="font-medium">{charge.projectName ?? t("inventory.chargeHistory.project")} · {t("inventory.chargeHistory.placement")} <bdi>{charge.placementSequence}</bdi></h3>
      <p>{t(charge.status === "LIVE" ? "inventory.chargeHistory.live" : "inventory.chargeHistory.voided")} · {money(charge.amountDzd)}</p>
      <p><AppDate value={charge.createdAt} includeTime timeStyle="medium" /> · <AppDate value={charge.updatedAt} includeTime timeStyle="medium" /></p>
      <p><bdi>{charge.projectId}</bdi> · <bdi>{charge.id}</bdi>{charge.movementId && <> · <bdi>{charge.movementId}</bdi></>}</p>
      {charge.voidedAt && <p>{t("inventory.chargeHistory.voided")} · <AppDate value={charge.voidedAt} includeTime timeStyle="medium" /> · <bdi>{charge.voidedBy ?? t("inventory.chargeHistory.unknownActor")}</bdi>{charge.voidReason && <> · {charge.voidReason}</>}</p>}
      {!!charge.revisions.length && <ol aria-label={t("inventory.chargeHistory.revisions")} className="space-y-2 border-t border-line pt-2">
        {charge.revisions.map(revision => <li key={revision.id}>
          <p><bdi>{revision.revisionSequence}</bdi> · {money(revision.previousAmountDzd)} → {revision.newAmountDzd === null ? t("inventory.chargeHistory.voided") : money(revision.newAmountDzd)}</p>
          <p>{revision.actorLabel ?? t("inventory.chargeHistory.unknownActor")} · <AppDate value={revision.createdAt} includeTime timeStyle="medium" />{revision.reason && <> · {revision.reason}</>}</p>
          <p><bdi>{revision.id}</bdi>{revision.actorUserId && <> · <bdi>{revision.actorUserId}</bdi></>}{revision.transactionId && <> · <bdi>{revision.transactionId}</bdi></>}</p>
        </li>)}
      </ol>}
    </article>
  )
}
