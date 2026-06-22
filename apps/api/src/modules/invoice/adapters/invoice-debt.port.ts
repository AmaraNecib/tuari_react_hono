import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

import type { CompanyRepository } from "../../company/company.repository";
import type { MutationAuditContext } from "../../company/company.types";
import type {
  CreateInvoiceDebtInput,
  InvoiceDebtPort,
  RecordInvoicePaymentInput,
  RecordInvoicePaymentResult,
} from "../invoice.types";

/**
 * Production implementation of the invoice debt port. Talks to the
 * existing debt tables directly (not the CompanyService god-object) so
 * the InvoiceModule stays decoupled and testable.
 *
 * Per-counterparty ledger model:
 *   - One `debt_account` per `external_counterparty` (find-or-create on
 *     supplier name + phone). One counterparty can have many invoices;
 *     the OPENING entries accumulate the running balance.
 *   - Each `OPENING` debt entry is linked back to the source invoice
 *     via `debt_entry.invoice_id` so accountants can trace which
 *     invoices created which balance.
 *
 * Sign convention (matches existing debt ledger):
 *   - OPENING on a purchase invoice: signed_amount = +totalAmount
 *     (positive ⇒ counterparty is creditor ⇒ we owe them)
 *   - PAYMENT: signed_amount = -amount
 *
 * Phase 5 (Payment Processing) will add multi-invoice allocation on
 * top of this single-invoice flow.
 */
export interface SqliteInvoiceDebtPortDeps {
  db: Database.Database;
  repository: CompanyRepository;
}

export function createSqliteInvoiceDebtPort(
  deps: SqliteInvoiceDebtPortDeps,
): InvoiceDebtPort {
  const { db, repository } = deps;

  function ensureCounterpartyId(
    supplierName: string,
    supplierPhone: string | null,
  ): string {
    const trimmedPhone = (supplierPhone ?? "").trim();
    const matches = repository.listExternalCounterparties({ fullName: supplierName });
    const existing = matches.find(
      (c) => (c.phoneNumber ?? "").trim() === trimmedPhone,
    );
    if (existing) return existing.id;

    return repository
      .createExternalCounterparty({
        fullName: supplierName,
        phoneNumber: trimmedPhone,
        note: null,
      })
      .id;
  }

  function ensureDebtAccountId(
    counterpartyId: string,
    openingSignedAmount: number,
    note: string,
    audit: MutationAuditContext,
  ): string {
    const existing = repository.getDebtAccountByExternalCounterpartyId(counterpartyId);
    if (existing) return existing.id;

    const created = repository.createDebtAccount(
      {
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterpartyId,
        workerId: null,
        status: "OPEN",
        currentBalanceDzd: openingSignedAmount,
        note,
        settledAt: null,
      },
      audit,
    );
    return created.id;
  }

  function backfillEntryInvoiceId(
    debtAccountId: string,
    entryType: "OPENING" | "PAYMENT",
    invoiceId: string,
  ): void {
    db.prepare(
      `UPDATE "debt_entry"
         SET "invoice_id" = ?
       WHERE "debt_account_id" = ?
         AND "entry_type" = ?
         AND "invoice_id" IS NULL
       ORDER BY "created_at" DESC
       LIMIT 1`,
    ).run(invoiceId, debtAccountId, entryType);
  }

  function getCounterpartyIdForDebtAccount(debtAccountId: string): string {
    const row = db
      .prepare(
        `SELECT "external_counterparty_id" FROM "debt_account" WHERE "id" = ?`,
      )
      .get(debtAccountId) as { external_counterparty_id: string } | undefined;
    if (!row) throw new Error(`Debt account ${debtAccountId} not found`);
    return row.external_counterparty_id;
  }

  function getInvoiceTotals(invoiceId: string): {
    debtAccountId: string;
    totalAmount: number;
    paidAmount: number;
  } {
    const row = db
      .prepare(
        `SELECT "debt_account_id", "total_amount", "paid_amount"
           FROM "invoice" WHERE "id" = ?`,
      )
      .get(invoiceId) as
      | { debt_account_id: string | null; total_amount: number; paid_amount: number }
      | undefined;
    if (!row || !row.debt_account_id) {
      throw new Error("Invoice or its debt account not found");
    }
    return {
      debtAccountId: row.debt_account_id,
      totalAmount: row.total_amount,
      paidAmount: row.paid_amount,
    };
  }

  function getCurrentDebtAccountBalance(debtAccountId: string): number {
    const accounts = repository.listDebtAccounts({
      externalCounterpartyId: getCounterpartyIdForDebtAccount(debtAccountId),
    });
    const account = accounts.find((a) => a.id === debtAccountId);
    if (!account) throw new Error(`Debt account ${debtAccountId} not found`);
    return account.currentBalanceDzd;
  }

  return {
    async createInvoiceDebt(input: CreateInvoiceDebtInput) {
      const audit: MutationAuditContext = {
        actorUserId: input.actorUserId,
        actorLabel: input.actorLabel,
        transactionId: input.transactionId,
      };

      const counterpartyId = ensureCounterpartyId(
        input.supplierName,
        input.supplierPhone,
      );

      const debtAccountId = ensureDebtAccountId(
        counterpartyId,
        input.amount,
        `Invoice ${input.invoiceId} opening balance`,
        audit,
      );

      repository.createDebtEntry(
        {
          debtAccountId,
          entryType: "OPENING",
          signedAmountDzd: input.amount,
          entryDate: new Date().toISOString(),
          note: `Invoice ${input.invoiceId} opening balance`,
          balanceAfterDzd: input.amount,
        },
        audit,
      );
      backfillEntryInvoiceId(debtAccountId, "OPENING", input.invoiceId);

      return { debtAccountId };
    },

    async recordInvoicePayment(input: RecordInvoicePaymentInput): Promise<RecordInvoicePaymentResult> {
      const audit: MutationAuditContext = {
        actorUserId: input.actorUserId,
        actorLabel: input.actorLabel,
        transactionId: input.transactionId,
      };

      const { debtAccountId, totalAmount, paidAmount } =
        getInvoiceTotals(input.invoiceId);

      const currentBalance = getCurrentDebtAccountBalance(debtAccountId);
      const nextBalance = currentBalance - input.amount;
      const settled = nextBalance <= 0;

      repository.createDebtEntry(
        {
          debtAccountId,
          entryType: "PAYMENT",
          signedAmountDzd: -input.amount,
          entryDate: new Date().toISOString(),
          note: `Invoice ${input.invoiceId} payment`,
          balanceAfterDzd: nextBalance,
        },
        audit,
      );
      backfillEntryInvoiceId(debtAccountId, "PAYMENT", input.invoiceId);

      repository.updateDebtAccount(
        {
          id: debtAccountId,
          status: settled ? "SETTLED" : "OPEN",
          currentBalanceDzd: nextBalance,
          settledAt: settled ? new Date().toISOString() : null,
        },
        audit,
      );

      const newPaidAmount = paidAmount + input.amount;
      const newRemainingAmount = Math.max(0, totalAmount - newPaidAmount);

      return {
        settled,
        newPaidAmount,
        newRemainingAmount,
        debtAccountCurrentBalance: nextBalance,
        debtAccountId,
      };
    },
  };
}

/**
 * In-memory implementation of the invoice debt port for tests.
 * The full state lives in a single object so tests can assert on
 * counterparty creation, account balances, and entry sequencing
 * directly.
 */
export interface InMemoryInvoiceDebtPortState {
  counterparties: Map<string, { id: string; phone: string }>;
  debtAccounts: Map<string, {
    id: string;
    counterpartyId: string;
    balance: number;
    settled: boolean;
  }>;
  entries: Array<{
    id: string;
    debtAccountId: string;
    invoiceId: string;
    entryType: "OPENING" | "PAYMENT" | "ADJUSTMENT" | "SETTLEMENT";
    signedAmount: number;
    balanceAfter: number;
  }>;
}

export function createInMemoryInvoiceDebtPort(): InvoiceDebtPort & {
  state: InMemoryInvoiceDebtPortState;
} {
  const state: InMemoryInvoiceDebtPortState = {
    counterparties: new Map(),
    debtAccounts: new Map(),
    entries: [],
  };

  function ensureCounterpartyId(name: string, phone: string | null): string {
    const phoneKey = (phone ?? "").trim();
    const key = `${name}::${phoneKey}`;
    const existing = state.counterparties.get(key);
    if (existing) return existing.id;
    const id = randomUUID();
    state.counterparties.set(key, { id, phone: phoneKey });
    return id;
  }

  function ensureDebtAccountId(
    counterpartyId: string,
    openingSignedAmount: number,
  ): string {
    const existing = state.debtAccounts.get(counterpartyId);
    if (existing) return existing.id;
    const id = randomUUID();
    state.debtAccounts.set(counterpartyId, {
      id,
      counterpartyId,
      balance: openingSignedAmount,
      settled: false,
    });
    return id;
  }

  function findAccountForInvoice(invoiceId: string) {
    const openingEntry = state.entries.find(
      (e) => e.invoiceId === invoiceId && e.entryType === "OPENING",
    );
    if (!openingEntry) {
      throw new Error("Invoice has no debt account");
    }
    const accountEntry = Array.from(state.debtAccounts.entries()).find(
      ([, acct]) => acct.id === openingEntry.debtAccountId,
    );
    if (!accountEntry) {
      throw new Error("Debt account missing");
    }
    return { account: accountEntry[1], debtAccountId: openingEntry.debtAccountId };
  }

  function recordEntry(
    debtAccountId: string,
    invoiceId: string,
    entryType: "OPENING" | "PAYMENT",
    signedAmount: number,
    balanceAfter: number,
  ): void {
    state.entries.push({
      id: randomUUID(),
      debtAccountId,
      invoiceId,
      entryType,
      signedAmount,
      balanceAfter,
    });
  }

  return {
    state,

    async createInvoiceDebt(input) {
      const counterpartyId = ensureCounterpartyId(
        input.supplierName,
        input.supplierPhone,
      );
      const debtAccountId = ensureDebtAccountId(counterpartyId, input.amount);
      const account = state.debtAccounts.get(counterpartyId)!;

      recordEntry(
        debtAccountId,
        input.invoiceId,
        "OPENING",
        input.amount,
        account.balance,
      );

      return { debtAccountId };
    },

    async recordInvoicePayment(input) {
      const { account, debtAccountId } = findAccountForInvoice(input.invoiceId);
      const newBalance = account.balance - input.amount;
      account.balance = newBalance;
      account.settled = newBalance <= 0;

      recordEntry(
        debtAccountId,
        input.invoiceId,
        "PAYMENT",
        -input.amount,
        newBalance,
      );

      const totalOpening = state.entries
        .filter((e) => e.invoiceId === input.invoiceId && e.entryType === "OPENING")
        .reduce((sum, e) => sum + e.signedAmount, 0);
      const totalPaid = state.entries
        .filter((e) => e.invoiceId === input.invoiceId && e.entryType === "PAYMENT")
        .reduce((sum, e) => sum + Math.abs(e.signedAmount), 0);

      return {
        settled: account.settled,
        newPaidAmount: totalPaid,
        newRemainingAmount: Math.max(0, totalOpening - totalPaid),
        debtAccountCurrentBalance: newBalance,
        debtAccountId,
      };
    },
  };
}