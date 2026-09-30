import {
  DEBT_BALANCE_STATE_PHRASE,
  getDebtBalanceAmount,
  getDebtBalanceState,
} from "@tuari/contracts"
import type { DebtAccount, DebtBalanceState, DebtEntry } from "@tuari/contracts"

/**
 * Signed movement/amount formatter (entry deltas, settlement amounts).
 * Balances never use this directly — they use `formatDebtAmount` plus a
 * direction phrase so the sign can never contradict the words.
 */
export function formatDebtMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    signDisplay: "always",
    useGrouping: false,
  }).format(value)
}

/**
 * Absolute money formatter for balance displays. Always nonnegative and
 * grouped, so `-50_000` renders as `50,000` next to its phrase. Keeps up to
 * two centimes so a nonzero sub-dinar balance can never round to a bare `0`
 * beside a direction phrase (the settled state owns `0`).
 */
export function formatDebtAmount(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(getDebtBalanceAmount(value))
}

type DebtBalanceTone = {
  badgeClassName: string
  textClassName: string
  /** Explanatory sentence; must make the direction explicit. */
  description: string
}

const DEBT_BALANCE_STATE_TONE: Record<DebtBalanceState, DebtBalanceTone> = {
  owedToUs: {
    badgeClassName: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    textClassName: "text-emerald-700 dark:text-emerald-300",
    description: `رصيد لنا — ${DEBT_BALANCE_STATE_PHRASE.owedToUs}.`,
  },
  owedByUs: {
    badgeClassName: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    textClassName: "text-rose-700 dark:text-rose-300",
    description: `رصيد علينا — ${DEBT_BALANCE_STATE_PHRASE.owedByUs}.`,
  },
  creditWithUs: {
    badgeClassName: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    textClassName: "text-emerald-700 dark:text-emerald-300",
    description: `دفعنا أكثر مما علينا — ${DEBT_BALANCE_STATE_PHRASE.creditWithUs}.`,
  },
  creditWithThem: {
    badgeClassName: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    textClassName: "text-rose-700 dark:text-rose-300",
    description: `دفعوا أكثر مما علينا — ${DEBT_BALANCE_STATE_PHRASE.creditWithThem}.`,
  },
  settled: {
    badgeClassName: "border-border/70 bg-muted/50 text-muted-foreground",
    textClassName: "text-muted-foreground",
    description: "لا يوجد رصيد مفتوح — الحساب مسوّى.",
  },
}

type DebtBalanceInput = {
  currentBalance: number
  direction?: DebtAccount["direction"] | null
}

/**
 * The one display helper for a debt balance: `(direction, signed balance)`
 * → `(phrase key, absolute amount)`. Every screen that renders a balance
 * goes through this so a signed number can never reach the UI on its own.
 */
export function getDebtBalanceDisplay(input: DebtBalanceInput) {
  const state = getDebtBalanceState(input)
  const amount = getDebtBalanceAmount(input.currentBalance)
  const tone = DEBT_BALANCE_STATE_TONE[state]

  return {
    state,
    phraseKey: `debts.terminology.states.${state}` as const,
    phrase: DEBT_BALANCE_STATE_PHRASE[state],
    amount,
    ...tone,
  }
}

/**
 * The phrasing rule for the balance left after netting one payable and one
 * receivable opening. Both amounts are magnitudes (the caller takes the
 * absolute opening); the remainder lands on the side whose opening is larger,
 * so its phrase follows that account's direction — a positive payable
 * remainder is owed BY us, never to us. Returns null until both sides are
 * chosen. This is a domain rule, so it lives here next to the other debt
 * display rules rather than inside the dialog component.
 */
export function getConsolidationRemainder(input: {
  payableAmount: number | null
  receivableAmount: number | null
  payableDirection: DebtAccount["direction"]
  receivableDirection: DebtAccount["direction"]
}): { description: string; label: string } | null {
  const { payableAmount, receivableAmount, payableDirection, receivableDirection } = input
  if (payableAmount === null || receivableAmount === null) {
    return null
  }

  const netAmount = payableAmount - receivableAmount
  if (netAmount === 0) {
    return { description: "سيتم إلغاء الحركتين بالكامل. لا يبقى رصيد.", label: "إلغاء تام" }
  }

  if (netAmount > 0) {
    const remaining = getDebtBalanceDisplay({ currentBalance: netAmount, direction: payableDirection })
    return {
      description: `يبقى رصيد ${formatDebtAmount(netAmount)} دج على حساب ${getDebtDirectionLabel(payableDirection)} (${remaining.phrase}).`,
      label: `يبقى ${remaining.phrase} ${formatDebtAmount(netAmount)} دج`,
    }
  }

  const remaining = getDebtBalanceDisplay({ currentBalance: -netAmount, direction: receivableDirection })
  return {
    description: `يبقى رصيد ${formatDebtAmount(-netAmount)} دج على حساب ${getDebtDirectionLabel(receivableDirection)} (${remaining.phrase}).`,
    label: `يبقى ${remaining.phrase} ${formatDebtAmount(-netAmount)} دج`,
  }
}

/**
 * The create page and hub use "owed-to-us"/"owed-by-us" as a UI alias; the
 * domain and the wire use PAYABLE/RECEIVABLE. This is the one place the alias
 * is translated, so the form and the label cannot disagree about the account
 * direction.
 */
export type DebtDirectionAlias = "owed-to-us" | "owed-by-us"

export function debtDirectionFromAlias(alias: DebtDirectionAlias): DebtAccount["direction"] {
  return alias === "owed-to-us" ? "RECEIVABLE" : "PAYABLE"
}

/**
 * Direction label (the account's orientation), not a balance phrase.
 */
export function getDebtDirectionLabel(direction: DebtAccount["direction"]) {
  return direction === "PAYABLE" ? "مستحقات علينا" : "مستحقات لنا"
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
