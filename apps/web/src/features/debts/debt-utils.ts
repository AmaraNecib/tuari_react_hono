import type { DebtAccount, DebtEntry } from "@tuari/contracts"

export function formatDebtMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    signDisplay: "always",
    useGrouping: false,
  }).format(value)
}

export function getDebtBalanceMeta(balanceDzd: number) {
  if (balanceDzd > 0) {
    return {
      badgeClassName: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      textClassName: "text-emerald-700 dark:text-emerald-300",
      shortLabel: "لنا عنده",
      description: "رصيد موجب — الطرف مدين لنا",
      statusLabel: "مفتوح",
    }
  }

  if (balanceDzd < 0) {
    return {
      badgeClassName: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      textClassName: "text-rose-700 dark:text-rose-300",
      shortLabel: "علينا له",
      description: "رصيد سالب — نحن مدينون له",
      statusLabel: "مفتوح",
    }
  }

  return {
    badgeClassName: "border-border/70 bg-muted/50 text-muted-foreground",
    textClassName: "text-muted-foreground",
    shortLabel: "مغلق",
    description: "لا يوجد رصيد مفتوح",
    statusLabel: "مسوّى",
  }
}

/**
 * Direction-aware balance meta. The sign convention is fixed per
 * direction: `+balance` on a PAYABLE account means "we owe them"
 * (rose); `+balance` on a RECEIVABLE account means "they owe us"
 * (emerald). The aggregated party summary uses the net (sign-only)
 * helper; per-account UIs use this one so the colors and labels stay
 * consistent with the underlying ledger direction.
 */
export function getDebtAccountBalanceMeta(account: Pick<DebtAccount, "currentBalance" | "direction">) {
  const { currentBalance, direction } = account

  if (currentBalance === 0) {
    return getDebtBalanceMeta(0)
  }

  const positiveDirectionMeaning: "RECEIVABLE" | "PAYABLE" = direction === "PAYABLE" ? "PAYABLE" : "RECEIVABLE"
  const effectiveSign = positiveDirectionMeaning === "RECEIVABLE" ? currentBalance : -currentBalance
  return getDebtBalanceMeta(effectiveSign)
}

export function getDebtDirectionLabel(direction: DebtAccount["direction"]) {
  return direction === "PAYABLE" ? "علينا له" : "لنا عنده"
}

export function getDebtAccountBalance(account: DebtAccount | null | undefined) {
  return account?.currentBalance ?? 0
}

/**
 * Aggregate balances across multiple accounts into a single net
 * figure, honoring the per-direction sign convention so PAYABLE and
 * RECEIVABLE ledgers cancel out instead of compounding.
 *
 * Sign convention (locked for Issue #22):
 *   - PAYABLE: +balance means "we owe them" → subtracts from net
 *   - RECEIVABLE: +balance means "they owe us" → adds to net
 *
 * Example: a counterparty owes us 500 (RECEIVABLE +500) but we also
 * owe them 2 000 (PAYABLE +2 000) → net = 500 - 2 000 = -1 500
 * ("we still owe them 1 500 DZD").
 */
export function getCombinedDebtBalance(accounts: Pick<DebtAccount, "currentBalance" | "direction">[]) {
  return accounts.reduce((net, account) => {
    const signedAmount = account.direction === "RECEIVABLE" ? account.currentBalance : -account.currentBalance
    return net + signedAmount
  }, 0)
}

export function sortDebtAccounts(accounts: DebtAccount[]) {
  return [...accounts].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "OPEN" ? -1 : 1
    }

    const byUpdatedAt = right.updatedAt.localeCompare(left.updatedAt)
    return byUpdatedAt !== 0 ? byUpdatedAt : right.createdAt.localeCompare(left.createdAt)
  })
}

export function formatDebtCaseLabel(account: DebtAccount, index: number) {
  const note = account.note?.trim()

  if (note) {
    return note
  }

  return `حالة الدين ${index + 1}`
}

export function sortDebtEntries(entries: DebtEntry[]) {
  return [...entries].sort((left, right) => {
    const byDate = right.entryDate.localeCompare(left.entryDate)
    return byDate !== 0 ? byDate : right.createdAt.localeCompare(left.createdAt)
  })
}

export function getDebtEntryTypeLabel(entryType: DebtEntry["entryType"]) {
  switch (entryType) {
    case "OPENING":
      return "رصيد افتتاحي"
    case "PAYMENT":
      return "دفعة"
    case "ADJUSTMENT":
      return "تعديل"
    case "SETTLEMENT":
      return "تسوية"
    default:
      return entryType
  }
}
