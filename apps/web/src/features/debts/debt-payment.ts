import type { DebtAccount, DebtEntryCreateInput } from "@tuari/contracts"

/** Parse DZD centimes without guessing malformed grouping or rounding input. */
export function parseDebtAmount(raw: string): number | null {
  const normalized = raw.trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/[\u00a0\u202f]/g, " ")

  // A grouped integer must use one separator and exactly three digits per group.
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?: \d{3})+)(?:\.\d{1,2})?$/.test(normalized)) {
    return null
  }

  const ungrouped = normalized.replace(/[, ]/g, "")
  const [integer, fraction = ""] = ungrouped.replace(/^[+-]/, "").split(".")
  const centimes = BigInt(integer + fraction.padEnd(2, "0"))
  if (centimes > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return Number(ungrouped)
}

/** Payment sign is independent of ledger direction and existing credit. */
export function resolveDebtPaymentAction(
  account: Pick<DebtAccount, "id" | "currentBalance">,
  rawAmount: string,
): { input: DebtEntryCreateInput; amountDzd: number; balanceAfterDzd: number } | null {
  const parsed = parseDebtAmount(rawAmount)
  if (parsed === null || parsed === 0) return null
  const amountDzd = Math.abs(parsed)
  const signedAmountDzd = -amountDzd
  return {
    input: { debtAccountId: account.id, entryType: "PAYMENT", signedAmountDzd },
    amountDzd,
    balanceAfterDzd: account.currentBalance + signedAmountDzd,
  }
}
