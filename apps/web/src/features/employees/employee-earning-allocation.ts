import { parseLocalizedMoneyInput } from "@/features/shared/exact-money-input"

export type EarningAllocationRow = { id: string; daysText: string; amountText: string }
export type EarningAllocationSummary = {
  totalMinor: bigint | null
  allocatedMinor: bigint | null
  remainderMinor: bigint | null
}

function minorUnits(value: string): bigint | null {
  if (!value.trim()) return null
  try {
    return BigInt(parseLocalizedMoneyInput(value).toMinorUnits())
  } catch {
    return null
  }
}

function positiveSafeDays(value: string): bigint | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const days = Number(trimmed)
  return Number.isSafeInteger(days) && days > 0 ? BigInt(days) : null
}

export function formatEarningMinorUnits(value: bigint): string {
  const sign = value < 0n ? "-" : ""
  const absolute = value < 0n ? -value : value
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`
}

export function calculateEarningAllocation(totalText: string, rows: readonly EarningAllocationRow[]): EarningAllocationSummary {
  const totalMinor = totalText.trim() ? minorUnits(totalText) : null
  if (totalMinor === null) return { totalMinor: null, allocatedMinor: null, remainderMinor: null }

  let allocatedMinor = 0n
  for (const row of rows) {
    const amount = minorUnits(row.amountText)
    if (amount === null) return { totalMinor, allocatedMinor: null, remainderMinor: null }
    allocatedMinor += amount
  }

  return { totalMinor, allocatedMinor, remainderMinor: totalMinor - allocatedMinor }
}

/** Explicitly divide the positive remainder among blank rows by their day counts. */
export function suggestBlankEarningRowAmounts(
  totalText: string,
  rows: readonly EarningAllocationRow[],
): Array<{ id: string; amountText: string }> | null {
  // Blank rows are suggestion targets, not entered zero amounts in the live summary.
  const summary = calculateEarningAllocation(totalText, rows.filter(row => row.amountText.trim()))
  if (summary.totalMinor === null || summary.totalMinor <= 0n || summary.remainderMinor === null || summary.remainderMinor <= 0n) return null
  if (rows.some(row => {
    if (!row.amountText.trim()) return false
    const amount = minorUnits(row.amountText)
    return amount === null || amount < 0n
  })) return null

  const blankRows = rows.filter(row => !row.amountText.trim())
  if (blankRows.length === 0) return null

  const weightedRows = blankRows.map(row => ({ row, days: positiveSafeDays(row.daysText) }))
  if (weightedRows.some(entry => entry.days === null)) return null
  const totalDays = weightedRows.reduce((sum, entry) => sum + entry.days!, 0n)
  if (totalDays === 0n) return null

  const shares = weightedRows.map(({ days }, index) => {
    const exactNumerator = summary.remainderMinor! * days!
    return { index, amount: exactNumerator / totalDays, remainder: exactNumerator % totalDays }
  })
  const assigned = shares.reduce((sum, share) => sum + share.amount, 0n)
  const centsLeft = Number(summary.remainderMinor - assigned)
  shares.sort((left, right) => left.remainder === right.remainder
    ? left.index - right.index
    : left.remainder > right.remainder ? -1 : 1)
  for (let index = 0; index < centsLeft; index++) shares[index]!.amount += 1n
  shares.sort((left, right) => left.index - right.index)

  return shares.map(share => ({
    id: blankRows[share.index]!.id,
    amountText: formatEarningMinorUnits(share.amount),
  }))
}
