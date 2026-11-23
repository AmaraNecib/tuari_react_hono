import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { CurrencyInput } from "@/components/ui/form-controls"
import { parseLocalizedUnitPriceInput } from "./exact-money-input"

/** Entered price4 shares the existing fixed-left currency geometry. */
export function ExactPriceInput({ label, value, onChange, disabled = false }: { label: string; value: string; onChange(value: string): void; disabled?: boolean }) {
  const { t } = useTranslation()
  const id = useId()
  const [touched, setTouched] = useState(false)
  let invalid = false
  try { invalid = parseLocalizedUnitPriceInput(value).toWire().startsWith("-") } catch { invalid = true }
  return <div className="space-y-2"><label htmlFor={id} className="text-sm font-medium">{label}</label>
    <CurrencyInput id={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} onBlur={() => setTouched(true)}
      aria-invalid={touched && invalid} aria-describedby={touched && invalid ? `${id}-error` : undefined} />
    {touched && invalid && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{t("exactCommerce.invalidPrice")}</p>}
  </div>
}
