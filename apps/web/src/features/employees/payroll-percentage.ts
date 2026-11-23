import { Money } from "@tuari/contracts"
import { parseLocalizedMoneyInput } from "@/features/shared/exact-money-input"

const minor = (value: string) => BigInt(parseLocalizedMoneyInput(value).toMinorUnits())
const wire = (value: bigint) => Money.fromMinorUnits(value.toString()).toWire()

/** Percentages are draft aids. Only the resulting bounded money is submitted. */
export function paymentFromPercentage(total: string, input: string): string {
  if (input.length > 32) throw new TypeError("INVALID_PERCENTAGE")
  const digits = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹"
  const value = input.trim().replace(/[٠-٩۰-۹]/g, digit => String(digits.indexOf(digit) % 10)).replace("٫", ".")
  const match = /^(\d{1,3})(?:\.(\d{1,6}))?$/.exec(value)
  if (!match) throw new TypeError("INVALID_PERCENTAGE")
  const scale = 10n ** BigInt(match[2]?.length ?? 0)
  const numerator = BigInt(match[1]!) * scale + BigInt(match[2] ?? "0")
  if (numerator <= 0n || numerator > 100n * scale) throw new TypeError("INVALID_PERCENTAGE")
  const basis = minor(total)
  if (basis <= 0n) throw new TypeError("INVALID_AMOUNT")
  const denominator = 100n * scale
  const product = basis * numerator
  const result = product / denominator + (2n * (product % denominator) >= denominator ? 1n : 0n)
  if (result <= 0n) throw new TypeError("INVALID_AMOUNT")
  return wire(result)
}

/** Two display decimals, with an explicit marker when the ratio is rounded. */
export function paymentPercentage(amount: string, total: string): { value: string; approximate: boolean } {
  const basis = minor(total)
  const paid = minor(amount)
  if (basis <= 0n || paid < 0n || paid > basis) throw new TypeError("INVALID_AMOUNT")
  const scaled = paid * 10000n
  const hundredths = scaled / basis + (2n * (scaled % basis) >= basis ? 1n : 0n)
  return {
    value: `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, "0")}`.replace(/\.?0+$/, ""),
    approximate: scaled % basis !== 0n,
  }
}

export function previewPayrollPayment(total: string, remaining: string, amount: string) {
  const basis = minor(total)
  const owed = minor(remaining)
  const payment = minor(amount)
  if (basis <= 0n || owed < 0n || owed > basis || payment <= 0n || payment > owed) throw new TypeError("AMOUNT_EXCEEDS_BALANCE")
  return {
    amount: wire(payment), remaining: wire(owed - payment),
    cumulative: paymentPercentage(wire(basis - owed + payment), total),
    outstanding: paymentPercentage(wire(owed - payment), total),
  }
}
