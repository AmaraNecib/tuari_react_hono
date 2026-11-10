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
    <span
      className={cn(
        variant === "detail" ? "inline-flex items-baseline gap-1.5 font-mono" : "font-mono tabular-nums text-ink",
        toneClassName,
      )}
      dir="ltr"
    >
      {variant === "detail" ? <><span>{currencyLabel}</span><span>{formattedNumber}</span></> : <>{currencyLabel}{" "}{formattedNumber}</>}
    </span>
  )
}
