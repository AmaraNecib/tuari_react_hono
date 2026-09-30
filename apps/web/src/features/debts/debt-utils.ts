import {
  DEBT_BALANCE_STATE_PHRASE,
  getDebtAccountBalanceState,
  getDebtBalanceAmount,
  getNetDebtBalanceState,
} from "@tuari/contracts"
import type { DebtAccount, DebtBalanceAccount, DebtBalanceState, DebtEntry } from "@tuari/contracts"

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

function buildDebtBalanceDisplay(state: DebtBalanceState, currentBalance: number) {
  const tone = DEBT_BALANCE_STATE_TONE[state]

  return {
    state,
    // The shared contract table is the single source of the wording; the UI
    // does not keep a second i18n copy that a test has to hold in sync.
    phrase: DEBT_BALANCE_STATE_PHRASE[state],
    amount: getDebtBalanceAmount(currentBalance),
    ...tone,
  }
}

/**
 * The display helper for a figure that **has** a direction (an account
 * balance or a per-account entry). The direction is required, so a signed
 * number can never reach the UI on its own and a direction phrase can never
 * be rendered on a figure that has no direction.
 */
export function getDebtAccountBalanceDisplay(account: DebtBalanceAccount) {
  return buildDebtBalanceDisplay(
    getDebtAccountBalanceState(account),
    account.currentBalance,
  )
}

/**
 * The display helper for a **net** figure (a party aggregate): the sign
 * alone carries the meaning, so it is phrased without a direction.
 */
export function getNetDebtBalanceDisplay(netBalance: number) {
  return buildDebtBalanceDisplay(getNetDebtBalanceState(netBalance), netBalance)
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
    const remaining = getDebtAccountBalanceDisplay({ currentBalance: netAmount, direction: payableDirection })
    return {
      description: `يبقى رصيد ${formatDebtAmount(netAmount)} دج على حساب ${getDebtDirectionLabel(payableDirection)} (${remaining.phrase}).`,
      label: `يبقى ${remaining.phrase} ${formatDebtAmount(netAmount)} دج`,
    }
  }

  const remaining = getDebtAccountBalanceDisplay({ currentBalance: -netAmount, direction: receivableDirection })
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

/**
 * The hub's row filter, extracted from the render so the rule is testable
 * through its interface. It is the net state (the row balance has no ledger
 * direction) plus the row status.
 */
export type DebtHubFilter = "all" | "owed-to-us" | "owed-by-us" | "settled"

export function matchesDebtHubFilter(
  row: { status: "OPEN" | "SETTLED"; balanceDzd: number },
  filter: DebtHubFilter,
) {
  if (filter === "all") {
    return true
  }

  if (filter === "settled") {
    return row.status === "SETTLED"
  }

  if (row.status !== "OPEN") {
    return false
  }

  const state = getNetDebtBalanceState(row.balanceDzd)
  return state === (filter === "owed-to-us" ? "owedToUs" : "owedByUs")
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
