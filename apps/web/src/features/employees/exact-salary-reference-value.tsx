import { SalaryReference, type ExactSalaryReference } from "@tuari/contracts"
import { useMoneyGrouping } from "@/features/preferences/money-format-preference"
import { CurrencyRun } from "@/features/shared/money-value"

/** A reference can have four DAILY places; it is not a finalized cash amount. */
export function ExactSalaryReferenceValue({ reference }: { reference: ExactSalaryReference | null }) {
  const grouped = useMoneyGrouping()
  if (reference === null) return <span className="text-muted-foreground">غير محدد</span>
  const plain = SalaryReference.parse(reference.period, reference.amount).format()
  const [whole, fraction] = plain.split(".")
  const amount = (grouped ? whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole!) + (fraction ? `.${fraction}` : "")
  return <CurrencyRun amount={amount} currencyLabel="دج" className="font-mono tabular-nums text-ink" />
}
