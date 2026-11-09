import { useMoneyGrouping } from "@/features/preferences/money-format-preference"
import { cn } from "@/lib/utils"

/** Displays DZD with optional cents; grouping never changes the amount. */
export function MoneyValue({
  value,
  currencyLabel,
  variant = "table",
  signed = false,
  toneClassName,
  zeroAsDash = false,
}: {
  value: number
  currencyLabel: string
  variant?: "table" | "detail"
  signed?: boolean
  toneClassName?: string
  zeroAsDash?: boolean
}) {
  const useGrouping = useMoneyGrouping()
  if (zeroAsDash && value === 0) {
    return <span className={cn("text-muted-foreground", toneClassName)}>—</span>
  }

  const formattedNumber = new Intl.NumberFormat("en-US", {
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
