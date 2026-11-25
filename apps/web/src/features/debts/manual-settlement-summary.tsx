import { useTranslation } from "react-i18next"
import type { ExactDebtDetail, AppClient } from "@tuari/contracts"
import { AppDate } from "@/components/app-date"
import { AmountDisplay } from "@/components/ui"

type Record = Awaited<ReturnType<AppClient["financial"]["manualSettlement"]["history"]>>["items"][number]
type Entries = ExactDebtDetail["entries"]

export function ManualSettlementSummary({ item, entries = [] }: { item: Record; entries?: Entries }) {
  const { t } = useTranslation()
  const money = (value: string) => <AmountDisplay exact value={value} currencyLabel={t("exactDebts.currency")} />
  return <div data-manual-settlement-id={item.id} className="min-w-0 space-y-3 whitespace-normal break-words text-sm">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><strong>{t(item.reversal ? "manualSettlement.reversed" : "manualSettlement.live")}</strong>{money(item.amountDzd)}<AppDate value={item.recordedAt} includeTime /></div>
    <p>{t("manualSettlement.actor")}: {item.actorLabel}{item.note ? ` · ${item.note}` : ""}</p>
    <p>{t("manualSettlement.linked")}</p>
    <div className="grid gap-3 sm:grid-cols-2">{(["payableSource", "receivableSource"] as const).map((key, index) => { const source=item[key]; const href=source.kind === "PURCHASE" ? `/invoices/${encodeURIComponent(source.id)}` : source.kind === "SALE" ? `/outbound-transfers?source=${encodeURIComponent(source.id)}&party=${encodeURIComponent(item.externalCounterpartyId)}` : null; const label = source.kind === "RESTRICTED" ? t("manualSettlement.restrictedSource") : source.label; return <p key={key}>{t(index===0 ? "manualSettlement.payable" : "manualSettlement.receivable")}: {href ? <a className="underline underline-offset-4" href={href}>{label}</a> : <span>{source.kind === "RESTRICTED" ? label : t("manualSettlement.manualFallback")}</span>}</p> })}</div>
    <details className="group">
      <summary className="w-fit cursor-pointer rounded-md border border-border px-3 py-2 font-medium underline underline-offset-4 focus-visible:outline-2">{t("manualSettlement.entryDetails")}</summary>
      <dl className="mt-3 grid gap-4 border-y border-border py-3 sm:grid-cols-2">
        {(["payable", "receivable"] as const).map(side => {
          const id = side === "payable" ? item.payableOriginalEntryId : item.receivableOriginalEntryId
          const entry = entries.find(row => row.id === id)
          const source = side === "payable" ? item.payableSource : item.receivableSource
          const entryLabel = t(source.kind === "MANUAL" ? "manualSettlement.manualEntry" : source.kind === "RESTRICTED" ? "manualSettlement.restrictedSource" : "manualSettlement.originalEntry")
          const missingLabel = t(source.kind === "MANUAL" ? "manualSettlement.manualFallback" : source.kind === "RESTRICTED" ? "manualSettlement.restrictedSource" : "manualSettlement.sourceUnavailable")
          return <div key={side}><dt className="font-semibold">{t(`manualSettlement.${side}`)}</dt><dd className="mt-1 space-y-1">{entry ? <><p>{entry.note || entryLabel} · {t("manualSettlement.entryNumber", { sequence: entry.postingSequence })}</p><p>{money(entry.signedAmountDzd)} · <AppDate value={entry.entryDate} /></p></> : <p>{missingLabel}</p>}</dd></div>
        })}
      </dl>
    </details>
    {item.reversal && <p data-manual-reversal-id={item.reversal.id} className="border-t border-border pt-3">{t("manualSettlement.reversalAction")} · <AppDate value={item.reversal.recordedAt} includeTime /> · {item.reversal.actorLabel} · {item.reversal.reason}</p>}
    <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer rounded-md py-2 focus-visible:outline-2">{t("manualSettlement.technicalDetails")}</summary><p className="break-all py-2"><bdi dir="ltr">{item.id}<br />{item.payableOriginalEntryId}<br />{item.receivableOriginalEntryId}{item.reversal && <><br />{item.reversal.id}</>}</bdi></p></details>
  </div>
}
