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
 * Per-counterparty ledger model (Issue #22 — bidirectional):
 *   - One `debt_account` per (external_counterparty, direction) pair,
 *     enforced by the composite unique index
 *     `debt_account_external_counterparty_direction_unique`. Purchase
 *     invoices always target the PAYABLE ledger; sale invoices (Issue
 *     #26) will target the RECEIVABLE ledger. A single counterparty
 *     can therefore have both ledgers, each accumulating running
 *     balance from its own stream of invoices.
 *   - One counterparty can have many invoices against the same ledger;
 *     each OPENING entry accumulates on top of the previous running
 *     balance.
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
    direction: "PAYABLE" | "RECEIVABLE",
    openingSignedAmount: number,
    note: string,
    audit: MutationAuditContext,
  ): { id: string; previousBalance: number } {
    // Issue #22: each counterparty can have one PAYABLE and one
    // RECEIVABLE account. Purchase invoices always write to the
    // PAYABLE ledger; sale invoices write to the RECEIVABLE ledger.
    const existing = repository.getDebtAccountByExternalCounterpartyIdAndDirection(
      counterpartyId,
      direction,
    );
    if (existing) {
      return { id: existing.id, previousBalance: existing.currentBalance };
    }

    const created = repository.createDebtAccount(
      {
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterpartyId,
        workerId: null,
        status: "OPEN",
        direction,
        currentBalance: openingSignedAmount,
        note,
        settledAt: null,
      },
      audit,
    );
    return { id: created.id, previousBalance: 0 };
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
    return account.currentBalance;
  }

  return {
    async createInvoiceDebt(input: CreateInvoiceDebtInput) {
      const audit: MutationAuditContext = {
        actorUserId: input.actorUserId,
        actorLabel: input.actorLabel,
        transactionId: input.transactionId,
      };

      // Atomic OPENING flow (within the inner db.transaction):
      // ensure debt account -> create OPENING entry with correct
      // running balance -> backfill invoice_id on that same entry ->
      // re-stamp the account. Either all four land or none do.
      //
      // Note: the counterparty lookup/insert runs OUTSIDE this
      // transaction (ensureCounterpartyId). Idempotent retries on the
      // same supplier will reuse the existing counterparty row, so
      // partial failures leave at most an orphan counterparty without
      // a debt account \u2014 not a financial inconsistency. If a future
      // change ever needs strict atomicity here, move
      // ensureCounterpartyId inside the db.transaction() block.
      const counterpartyId = ensureCounterpartyId(
        input.supplierName,
        input.supplierPhone,
      );

      const debtDirection: "PAYABLE" | "RECEIVABLE" =
        input.direction === "SALE" ? "RECEIVABLE" : "PAYABLE";

      const createOpening = db.transaction(() => {
        const account = ensureDebtAccountId(
          counterpartyId,
          debtDirection,
          input.amount,
          `Invoice ${input.invoiceId} opening balance`,
          audit,
        );
        const balanceAfter = account.previousBalance + input.amount;

        repository.createDebtEntry(
          {
            debtAccountId: account.id,
            entryType: "OPENING",
            signedAmountDzd: input.amount,
            entryDate: new Date().toISOString(),
            note: `Invoice ${input.invoiceId} opening balance`,
            balanceAfterDzd: balanceAfter,
          },
          audit,
        );
        backfillEntryInvoiceId(account.id, "OPENING", input.invoiceId);

        // Always re-stamp the debt account's running balance to
        // reflect the new OPENING entry. This is required even when
        // previousBalance === 0 (a previously-settled supplier): we
        // must move the account back to OPEN status with a non-zero
        // balance so subsequent payments settle against the right
        // running balance. createDebtAccount already handles the
        // brand-new account case (status=OPEN, currentBalance=
        // balanceAfter); this branch covers both re-opening a settled
        // account and adding onto an existing OPEN one.
        repository.updateDebtAccount(
          {
            id: account.id,
            status: "OPEN",
            currentBalance: balanceAfter,
            settledAt: null,
          },
          audit,
        );

        return account.id;
      });

      const debtAccountId = createOpening();
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

      const recordPayment = db.transaction(() => {
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
            paymentMethod: "CASH",
            reasonCategory: "INVOICE_DRIVEN",
          },
          audit,
        );
        backfillEntryInvoiceId(debtAccountId, "PAYMENT", input.invoiceId);

        repository.updateDebtAccount(
          {
            id: debtAccountId,
            status: settled ? "SETTLED" : "OPEN",
            currentBalance: nextBalance,
            settledAt: settled ? new Date().toISOString() : null,
          },
          audit,
        );

        return { settled, nextBalance };
      });

      const { settled, nextBalance } = recordPayment();
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
    direction: "PAYABLE" | "RECEIVABLE";
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

  function accountKey(counterpartyId: string, direction: "PAYABLE" | "RECEIVABLE"): string {
    return `${counterpartyId}::${direction}`;
  }

  function ensureDebtAccountId(
    counterpartyId: string,
    direction: "PAYABLE" | "RECEIVABLE",
    openingSignedAmount: number,
  ): { id: string; previousBalance: number } {
    // Issue #22: each counterparty can have one PAYABLE and one
    // RECEIVABLE account. Purchase invoices write to the PAYABLE
    // ledger; sale invoices write to the RECEIVABLE ledger.
    const key = accountKey(counterpartyId, direction);
    const existing = state.debtAccounts.get(key);
    if (existing) {
      return { id: existing.id, previousBalance: existing.balance };
    }
    const id = randomUUID();
    state.debtAccounts.set(key, {
      id,
      counterpartyId,
      direction,
      balance: openingSignedAmount,
      settled: false,
    });
    return { id, previousBalance: 0 };
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
      const debtDirection: "PAYABLE" | "RECEIVABLE" =
        input.direction === "SALE" ? "RECEIVABLE" : "PAYABLE";
      const account = ensureDebtAccountId(counterpartyId, debtDirection, input.amount);
      const balanceAfter = account.previousBalance + input.amount;
      // Stamp running balance onto the account so successive OPENING
      // entries from the same counterparty layer on top of each other.
      // Always re-open settled accounts (where previousBalance === 0
      // from a prior full settlement); otherwise subsequent payments
      // would settle against the stale zero balance and corrupt
      // financial tracking.
      const accountState = state.debtAccounts.get(accountKey(counterpartyId, debtDirection))!;
      accountState.balance = balanceAfter;
      accountState.settled = false;

      recordEntry(
        account.id,
        input.invoiceId,
        "OPENING",
        input.amount,
        balanceAfter,
      );

      return { debtAccountId: account.id };
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