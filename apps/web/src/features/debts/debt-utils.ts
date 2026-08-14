import { getDebtAccountNetContribution } from "@tuari/contracts"
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
  if (account.currentBalance === 0) {
    return getDebtBalanceMeta(0)
  }

  // Delegate the per-direction sign flip to the shared contracts
  // helper (single source of truth, issue #277) so PAYABLE and
  // RECEIVABLE can never drift from the API's net perspective.
  return getDebtBalanceMeta(getDebtAccountNetContribution(account))
}

export function getDebtDirectionLabel(direction: DebtAccount["direction"]) {
  return direction === "PAYABLE" ? "علينا له" : "لنا عنده"
}

export function getDebtAccountBalance(account: DebtAccount | null | undefined) {
  return account?.currentBalance ?? 0
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
