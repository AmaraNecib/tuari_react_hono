import { z } from "zod";

import type { DebtAccount } from "./debts";

/**
 * The slice of a debt account the sign convention applies to.
 * `currentBalance` is the account's signed running balance; `direction`
 * carries the ledger orientation (a positive PAYABLE balance means we owe
 * them, a positive RECEIVABLE balance means they owe us).
 */
export type DebtBalanceAccount = Pick<DebtAccount, "currentBalance" | "direction">;

/**
 * Raised when a helper that must interpret a signed balance by its ledger
 * direction is handed a figure without one. The split (issue #458) removes
 * the optional `direction` overload on purpose: a caller must say whether it
 * is asking about an account (which has a direction) or a net figure (which
 * does not). A direction-less account balance used to fall back to the sign,
 * which is how a payable remainder came to be phrased as "owed to us".
 */
export const DEBT_ACCOUNT_DIRECTION_REQUIRED_MESSAGE =
  "يجب تحديد اتجاه الحساب: مستحقات لنا أو مستحقات علينا.";

function requireLedgerDirection(direction: DebtBalanceAccount["direction"]) {
  if (direction !== "PAYABLE" && direction !== "RECEIVABLE") {
    throw new Error(DEBT_ACCOUNT_DIRECTION_REQUIRED_MESSAGE);
  }
}

/**
 * Sign-flips a single account's balance into the unified "net
 * perspective" used by party-level aggregations. With the
 * bidirectional counterparty ledger (Issue #22):
 *   - PAYABLE: +balance means "we owe them" → contributes negatively
 *     to the net
 *   - RECEIVABLE: +balance means "they owe us" → contributes
 *     positively to the net
 *
 * Single source of truth for the debt sign convention (Issue #277):
 * both the API finance service and the web debt UI route every sign
 * flip through this function so the two sides can never drift.
 */
export function getDebtAccountNetContribution(account: DebtBalanceAccount) {
  requireLedgerDirection(account.direction);
  const signed = account.direction === "RECEIVABLE" ? account.currentBalance : -account.currentBalance;
  // Normalize -0 to 0 so a zero-balance PAYABLE account can never leak
  // a signed zero into aggregates, labels, or wire values.
  return signed === 0 ? 0 : signed;
}

/**
 * Aggregate multiple accounts (which may be a mix of PAYABLE and
 * RECEIVABLE ledgers for the same party) into a single net figure
 * honoring the per-direction sign convention. Returns the
 * counterparty's NET position relative to us: positive = they owe
 * us (aggregate RECEIVABLE > aggregate PAYABLE), negative = we owe
 * them. An empty list nets to 0.
 */
export function getNetDebtBalance(accounts: DebtBalanceAccount[]) {
  return accounts.reduce((net, account) => net + getDebtAccountNetContribution(account), 0);
}

/**
 * The five display states of a debt balance. The state is what the UI
 * translates; the signed number never reaches the screen.
 *
 *  - owedToUs:       they owe us (unpaid receivable / positive net)
 *  - owedByUs:       we owe them (unpaid payable / negative net)
 *  - creditWithUs:   we overpaid a PAYABLE ledger — the credit is ours
 *  - creditWithThem: they overpaid a RECEIVABLE ledger — the credit is theirs
 *  - settled:        the balance is zero
 */
export const DEBT_BALANCE_STATES = [
  "owedToUs",
  "owedByUs",
  "creditWithUs",
  "creditWithThem",
  "settled",
] as const;

export type DebtBalanceState = (typeof DEBT_BALANCE_STATES)[number];

/**
 * Canonical Arabic phrase per state. The wire `balanceLabel` and the web
 * i18n copy both derive from this table so the API and the UI cannot
 * disagree about the words.
 */
export const DEBT_BALANCE_STATE_PHRASE = {
  owedToUs: "مستحق لنا",
  owedByUs: "مستحق علينا",
  creditWithUs: "رصيد مستحق لنا",
  creditWithThem: "رصيد مستحق لهم",
  settled: "مسوّى",
} as const;

export type DebtBalanceLabel = (typeof DEBT_BALANCE_STATE_PHRASE)[DebtBalanceState];

export const debtBalanceLabelSchema = z.enum([
  DEBT_BALANCE_STATE_PHRASE.owedToUs,
  DEBT_BALANCE_STATE_PHRASE.owedByUs,
  DEBT_BALANCE_STATE_PHRASE.creditWithUs,
  DEBT_BALANCE_STATE_PHRASE.creditWithThem,
  DEBT_BALANCE_STATE_PHRASE.settled,
]);

/**
 * Maps a **directional** account figure `(direction, signed balance)` to a
 * display state. Use this for an account's balance or a per-account entry;
 * use `getNetDebtBalanceState(netBalance)` for an already-netted figure.
 *
 * The direction is required, not optional: a missing/unknown direction is a
 * programming error, not a signal to fall back to the sign. Zero is always
 * `settled`, regardless of direction.
 */
export function getDebtAccountBalanceState(account: DebtBalanceAccount): DebtBalanceState {
  const { currentBalance, direction } = account;

  requireLedgerDirection(direction);

  if (currentBalance === 0) {
    return "settled";
  }

  if (direction === "RECEIVABLE") {
    return currentBalance > 0 ? "owedToUs" : "creditWithThem";
  }

  return currentBalance > 0 ? "owedByUs" : "creditWithUs";
}

/**
 * Maps a **net** figure to a display state: the net has no direction, so
 * positive means they owe us and negative means we owe them. Zero is
 * `settled`. The credit states (`creditWithUs`/`creditWithThem`) are
 * directional-only and unreachable here.
 */
export function getNetDebtBalanceState(netBalance: number): DebtBalanceState {
  if (netBalance === 0) {
    return "settled";
  }

  return netBalance > 0 ? "owedToUs" : "owedByUs";
}

/**
 * The magnitude that pairs with the phrase. Always nonnegative so a signed
 * balance can never render as a negative number.
 */
export function getDebtBalanceAmount(currentBalance: number) {
  return Math.abs(currentBalance);
}

/** The canonical Arabic phrase for a directional `(direction, balance)` pair. */
export function getDebtAccountBalancePhrase(account: DebtBalanceAccount): DebtBalanceLabel {
  return DEBT_BALANCE_STATE_PHRASE[getDebtAccountBalanceState(account)];
}

/** The canonical Arabic phrase for a net figure (no direction). */
export function getNetDebtBalancePhrase(netBalance: number): DebtBalanceLabel {
  return DEBT_BALANCE_STATE_PHRASE[getNetDebtBalanceState(netBalance)];
}
