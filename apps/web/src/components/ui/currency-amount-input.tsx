/**
 * Currency amount input with optional "Pay Full" button.
 * Used for payment and financial forms.
 */
import { useId, useState } from "react"
import { Money } from "@tuari/contracts"
import { parseLocalizedMoneyInput } from "@/features/shared/exact-money-input"
import { useMoneyGrouping } from "@/features/preferences/money-format-preference"
import { CurrencyRun } from "@/features/shared/money-value"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/form-controls"

/**
 * @description Component
 */
function LegacyCurrencyAmountInput({
  label,
  value,
  onChange,
  onPayFull,
  maxAmount,
  placeholder = "0.00",
  disabled = false,
  error,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  onPayFull?: () => void
  maxAmount?: number
  placeholder?: string
  disabled?: boolean
  error?: string | boolean
}) {
  const normalized = value.trim()
  const amountValue = normalized.length > 0 ? Number(normalized) : null
  const exceedsMax = maxAmount !== undefined && amountValue !== null && amountValue > maxAmount

  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-sm font-medium text-foreground">{label}</span>}
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <CurrencyInput
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
          {exceedsMax && <p className="mt-1 text-xs text-red-600 dark:text-red-400">لا يمكن دفع أكثر من {maxAmount?.toFixed(2)}</p>}
          {typeof error === "string" && error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        {onPayFull && maxAmount !== undefined && (
          <Button size="sm" variant="outline" onClick={onPayFull} disabled={disabled} className="whitespace-nowrap">
            <CurrencyRun amount={maxAmount.toFixed(2)} currencyLabel="دج" />
          </Button>
        )}
      </div>
    </div>
  )
}

type CommonProps = {
  label?: string
  value: string
  onChange: (value: string) => void
  onPayFull?: () => void
  placeholder?: string
  disabled?: boolean
  error?: string | boolean
}
type ExactProps = CommonProps & { exact: true; maxAmount?: string }
type Props = ExactProps | (CommonProps & { exact?: false; maxAmount?: number })

/** Exact mode is opt-in; existing numeric consumers retain their current behavior. */
export function CurrencyAmountInput(props: Props) {
  return props.exact ? <ExactCurrencyAmountInput {...props} /> : <LegacyCurrencyAmountInput {...props} />
}

function ExactCurrencyAmountInput({ label, value, onChange, onPayFull, maxAmount, placeholder = "0.00", disabled = false, error }: ExactProps) {
  const id = useId()
  const [touched, setTouched] = useState(false)
  const grouped = useMoneyGrouping()
  const maximum = maxAmount === undefined ? undefined : Money.parse(maxAmount)
  const maxLabel = maximum?.format({ grouped })
  let exceedsMax = false
  let invalid = false
  try {
    const amount = parseLocalizedMoneyInput(value)
    exceedsMax = maximum !== undefined && amount.compare(maximum) > 0
  } catch {
    invalid = true
  }
  const message = typeof error === "string" && error ? error
    : exceedsMax ? `لا يمكن دفع أكثر من ${maxLabel}`
    : touched && invalid ? "أدخل مبلغاً صحيحاً بدقة لا تتجاوز منزلتين عشريتين." : undefined
  const invalidState = Boolean(error || exceedsMax || (touched && invalid))
  return (
    <div className="flex flex-col gap-2">
      {label && <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>}
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <CurrencyInput id={id} aria-label={label ? undefined : "المبلغ"} aria-invalid={invalidState} aria-describedby={message ? `${id}-error` : undefined}
            placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} onBlur={() => setTouched(true)} disabled={disabled} />
          {message && <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{message}</p>}
        </div>
        {onPayFull && maximum !== undefined && (
          <Button type="button" size="sm" variant="outline" onClick={onPayFull} disabled={disabled} className="whitespace-nowrap"><CurrencyRun amount={maxLabel!} currencyLabel="دج" /></Button>
        )}
      </div>
    </div>
  )
}
