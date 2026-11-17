import { SalaryReference, type ExactSalaryReference } from "@tuari/contracts"
import { useTranslation } from "react-i18next"
import { useMoneyGrouping } from "@/features/preferences/money-format-preference"
import { CurrencyRun } from "@/features/shared/money-value"

/** A reference can have four DAILY places; it is not a finalized cash amount. */
export function ExactSalaryReferenceValue({ reference }: { reference: ExactSalaryReference | null }) {
  const grouped = useMoneyGrouping()
  const { t } = useTranslation()
  if (reference === null) return <span className="text-muted-foreground">{t("common.none")}</span>
  const plain = SalaryReference.parse(reference.period, reference.amount).format()
  const [whole, fraction] = plain.split(".")
  const amount = (grouped ? whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole!) + (fraction ? `.${fraction}` : "")
  return <CurrencyRun amount={amount} currencyLabel={t("common.currency")} className="font-mono tabular-nums text-ink" />
}
