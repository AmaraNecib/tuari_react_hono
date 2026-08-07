import { CompanyError } from "./company.errors";
import type { DebtAccountRecord, MutationAuditContext } from "./company.types";

export function successResult<T>(message: string, item: T) {
  return {
    success: true as const,
    message,
    item,
  };
}

export function deleteResult(message: string) {
  return {
    success: true as const,
    message,
  };
}

export function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildBatchField(index: number, field: string) {
  return `employees.${index}.${field}`;
}

export function normalizeSalaryAmount(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return value;
}

export function normalizeSignedMoneyAmount(value: number) {
  if (!Number.isFinite(value) || value === 0) {
    throw new CompanyError("VALIDATION", "يجب إدخال مبلغ صالح وغير صفري.", [
      { field: "signedAmountDzd", message: "يجب إدخال مبلغ صالح وغير صفري." },
    ])
  }

  return value
}

export function getDebtAccountStatus(balance: number) {
  return balance === 0 ? "SETTLED" : "OPEN"
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
 * This is the same convention `getCombinedDebtBalance` uses on the
 * web side; keeping it centralized here means the API and web agree
 * on the meaning of `totalBalanceDzd`.
 */
export function getDebtAccountNetContribution(account: { currentBalance: number; direction: "PAYABLE" | "RECEIVABLE" }) {
  return account.direction === "RECEIVABLE" ? account.currentBalance : -account.currentBalance
}

/**
 * Aggregate multiple accounts (which may be a mix of PAYABLE and
 * RECEIVABLE ledgers for the same party) into a single net figure
 * honoring the per-direction sign convention. Returns the
 * counterparty's NET position relative to us: positive = they owe
 * us (aggregate RECEIVABLE > aggregate PAYABLE), negative = we owe
 * them.
 */
export function getNetDebtBalance(accounts: Array<{ currentBalance: number; direction: "PAYABLE" | "RECEIVABLE" }>) {
  return accounts.reduce((net, account) => net + getDebtAccountNetContribution(account), 0)
}

/**
 * Direction-aware label for a single debt account. Mirrors the
 * per-account sign convention: +PAYABLE = "علينا له", +RECEIVABLE =
 * "لنا عنده". Use this for per-account UIs; use
 * `getDebtBalanceLabel(getNetDebtBalance(...))` for party aggregates.
 */
export function getDebtAccountBalanceLabel(account: { currentBalance: number; direction: "PAYABLE" | "RECEIVABLE" }) {
  // Reuse the existing direction-agnostic helper by sign-flipping
  // PAYABLE balances into the unified "net perspective" so positive
  // maps to "لنا عنده" and negative maps to "علينا له".
  const net = getDebtAccountNetContribution(account)
  return getDebtBalanceLabel(net)
}

export function getDebtBalanceLabel(balance: number) {
  if (balance > 0) {
    return "لنا عنده" as const
  }

  if (balance < 0) {
    return "علينا له" as const
  }

  return "مغلق" as const
}

export function buildDebtPartyKey(account: Pick<DebtAccountRecord, "partyType" | "workerId" | "externalCounterpartyId">) {
  return account.partyType === "INTERNAL_WORKER"
    ? `INTERNAL_WORKER:${account.workerId}`
    : `EXTERNAL_COUNTERPARTY:${account.externalCounterpartyId}`
}

export function normalizeMutationAuditContext(auditContext?: MutationAuditContext): Required<MutationAuditContext> {
  return {
    actorUserId: auditContext?.actorUserId ?? null,
    actorLabel: auditContext?.actorLabel ?? null,
    transactionId: auditContext?.transactionId ?? crypto.randomUUID(),
  }
}

export function assertDebtEntryDateNotBackdated(entryDate: string, latestEntryDate: string | null | undefined, field: string) {
  if (latestEntryDate && Date.parse(entryDate) < Date.parse(latestEntryDate)) {
    throw new CompanyError("BUSINESS_RULE", "لا يمكن تسجيل قيد بتاريخ أقدم من آخر حركة موجودة على الحساب.", [
      { field, message: "لا يمكن تسجيل قيد بتاريخ أقدم من آخر حركة موجودة على الحساب." },
    ])
  }
}

export type WorkspaceAdminAuthorizer = {
  isBootstrapOwner(userId: string): boolean
}
