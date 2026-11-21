import { parseLocalizedUnitPriceInput } from "./exact-money-input"
import { formatExactMoney } from "./exact-money-display"

type SalaryReference = { period: "DAILY" | "WEEKLY" | "MONTHLY"; amount: string }

/** Formats read-only salary references without converting exact values to floating point. */
export function formatSalaryReferenceAmount(reference: SalaryReference, grouped: boolean): string {
  if (reference.period !== "DAILY") {
    return formatExactMoney(reference.amount, { grouped }).text
  }

  const formatted = parseLocalizedUnitPriceInput(reference.amount).format()
  if (!grouped) return formatted
  const [whole = "", fraction] = formatted.split(".")
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`
}
