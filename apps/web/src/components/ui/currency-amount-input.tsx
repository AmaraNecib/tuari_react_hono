/**
 * Currency amount input with optional "Pay Full" button.
 * Used for payment and financial forms.
 */
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/form-controls"

export function CurrencyAmountInput({
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
        <div className="flex-1">
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
            {maxAmount.toFixed(2)} دج
          </Button>
        )}
      </div>
    </div>
  )
}
