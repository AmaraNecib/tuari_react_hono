import type { DebtAccount } from "./debts";

/**
 * The slice of a debt account the sign convention applies to.
 * `currentBalance` is always stored positive with `direction` carrying
 * the ledger orientation; the net-perspective helpers below re-sign it.
 */
export type DebtBalanceAccount = Pick<DebtAccount, "currentBalance" | "direction">;

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
