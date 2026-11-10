import { useMoneyGrouping } from "@/features/preferences/money-format-preference"
import { cn } from "@/lib/utils"
import { formatExactMoney } from "./exact-money-display"

type MoneyValueProps = {
  currencyLabel: string
  variant?: "table" | "detail"
  signed?: boolean
  toneClassName?: string
  zeroAsDash?: boolean
} & ({ exact?: false; value: number; aggregate?: never } | { exact: true; value: string; aggregate?: boolean })

/** Physical currency placement is shared by formatted displays and amount buttons. */
export function CurrencyRun({ amount, currencyLabel, className }: { amount: string; currencyLabel: string; className?: string }) {
  return <span dir="ltr" className={cn("inline-flex items-baseline gap-1 whitespace-nowrap", className)}>
    <span dir="rtl">{currencyLabel}</span>{" "}<bdi dir="ltr">{amount}</bdi>
  </span>
}

/** Displays DZD with optional cents; grouping never changes the amount. */
export function MoneyValue({
  value,
  exact,
  aggregate,
  currencyLabel,
  variant = "table",
  signed = false,
  toneClassName,
  zeroAsDash = false,
}: MoneyValueProps) {
  const useGrouping = useMoneyGrouping()
  const exactDisplay = exact ? formatExactMoney(value, { aggregate, grouped: useGrouping, signed }) : null
  if (zeroAsDash && (exactDisplay ? exactDisplay.zero : value === 0)) {
    return <span className={cn("text-muted-foreground", toneClassName)}>—</span>
  }

  const formattedNumber = exact ? exactDisplay!.text : new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    signDisplay: signed ? "always" : "auto",
    useGrouping,
  }).format(value)

  return (
    <CurrencyRun amount={formattedNumber} currencyLabel={currencyLabel}
      className={cn(
        variant === "detail" ? "inline-flex items-baseline gap-1.5 font-mono" : "font-mono tabular-nums text-ink",
        toneClassName,
      )}
    />
  )
}
