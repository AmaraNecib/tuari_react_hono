import { describe, it, expect, afterEach, beforeEach } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements as fullSchema } from "../../infrastructure/database/schema-definitions";
import { createFifoLock, FifoLockBusyError } from "../../infrastructure/database/fifo-lock";
import { SqliteCompanyRepository } from "../../modules/company/company.repository";
import { WorkspaceMutationContext } from "../../modules/company/workspace-mutation-context";
import { WorkforceService } from "../../modules/company/workforce.service";
import { createSqliteInvoiceDebtPort } from "../../modules/invoice/adapters/invoice-debt.port";
import type { MutationAuditContext } from "../../modules/company/company.types";

// ---------------------------------------------------------------------------
// In-memory SQLite setup (full schema + seeded system role)
// ---------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = MEMORY");
  db.pragma("foreign_keys = ON");

  for (const stmt of fullSchema) {
    db.exec(stmt);
  }

  const now = "2026-01-01T00:00:00.000Z";
  db.prepare(
    `INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 1, ?, ?)`,
  ).run("role-worker", "worker", "Worker", now, now);

  // Seed the bootstrap owner (the mutation context's admin authorizer checks
  // `isBootstrapOwner` — the first-seeded user wins by created_at).
  db.prepare(
    `INSERT INTO "user" ("id", "name", "phoneNumber", "phoneNumberVerified", "created_at", "updated_at")
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run("user-1", "Test User", "0612345678", 1, now, now);

  return db;
}

const AUDIT = {
  actorUserId: "user-1",
  actorLabel: "Test User",
  transactionId: "tx-1",
} as const;

// ---------------------------------------------------------------------------
// Suite: sync writers never join an open async transaction (issue #322)
// ---------------------------------------------------------------------------

describe("Transaction lock guard (issue #322)", () => {
  let db: Database.Database;
  let lock: ReturnType<typeof createFifoLock>;
  let repo: SqliteCompanyRepository;
  let workforce: WorkforceService;

  beforeEach(() => {
    db = createTestDb();
    lock = createFifoLock();
    repo = new SqliteCompanyRepository(db, lock);
    const mutation = new WorkspaceMutationContext(repo, repo);
    workforce = new WorkforceService(repo, repo, mutation);
  });

  afterEach(() => {
    db.close();
  });

  it("throws loudly instead of absorbing a sync service write into a foreign open transaction", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    // A foreign async flow holds the connection open across a real await
    // (the account bcrypt window, issue #322). The sync service write must
    // NOT be absorbed as a SAVEPOINT — it would be silently rolled back
    // with the outer transaction.
    const holder = lock.run(async () => {
      await gate;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(() =>
      workforce.createEmployee(
        {
          firstName: "Should",
          lastName: "Throw",
          phone: "0555123456",
          roleId: "role-worker",
          status: "ACTIVE",
          salaryAmountDzd: null,
          salaryPeriod: null,
          notes: null,
        },
        AUDIT,
      ),
    ).toThrow(FifoLockBusyError);

    release();
    await holder;

    // Once the connection is free, the same write succeeds and is durable.
    const result = workforce.createEmployee(
      {
        firstName: "Now",
        lastName: "Works",
        phone: "0555123456",
        roleId: "role-worker",
        status: "ACTIVE",
        salaryAmountDzd: null,
        salaryPeriod: null,
        notes: null,
      },
      AUDIT,
    );
    expect(result.success).toBe(true);
    expect(repo.getEmployeeByPhone("0555123456")?.firstName).toBe("Now");
  });

  it("joins our own open transaction through the real invoice-debt port across a real yield", async () => {
    const debtPort = createSqliteInvoiceDebtPort({ db, repository: repo, lock });

    // The invoice row must exist BEFORE createInvoiceDebt: the port's
    // backfillEntryInvoiceId UPDATEs debt_entry.invoice_id, which has an
    // FK to invoice(id). The debt_account_id FK is satisfied afterwards,
    // once the debt account exists.
    const now = "2026-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO "invoice" ("id", "invoice_number", "supplier_name", "supplier_phone", "warehouse_id", "project_id", "status", "direction", "invoice_date", "due_date", "currency", "total_amount", "paid_amount", "remaining_amount", "debt_account_id", "notes", "created_at", "updated_at")
       VALUES (?, NULL, ?, NULL, NULL, NULL, 'RECEIVED', 'PURCHASE', NULL, NULL, 'DZD', ?, 0, ?, NULL, NULL, ?, ?)`,
    ).run("inv-1", "Acme Corp", 1000, 1000, now, now);

    // Free lock: the OPENING transaction runs standalone and durably.
    const { debtAccountId } = await debtPort.createInvoiceDebt({
      supplierName: "Acme Corp",
      supplierPhone: "0555123456",
      direction: "PURCHASE",
      currency: "DZD",
      amount: 1000,
      invoiceId: "inv-1",
      actorUserId: AUDIT.actorUserId,
      actorLabel: AUDIT.actorLabel,
      transactionId: AUDIT.transactionId,
    });

    // Link the invoice to the debt account (recordInvoicePayment reads
    // debt_account_id + totals from the invoice row).
    db.prepare(`UPDATE "invoice" SET "debt_account_id" = ? WHERE "id" = ?`).run(
      debtAccountId,
      "inv-1",
    );

    // recordInvoicePayment inside a locked async flow (the payment
    // runInTransaction join-outer pattern): the port's sync transaction
    // must join OUR open transaction after a real yield and commit with it.
    const result = await lock.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return debtPort.recordInvoicePayment({
        invoiceId: "inv-1",
        amount: 400,
        direction: "PURCHASE",
        actorUserId: AUDIT.actorUserId,
        actorLabel: AUDIT.actorLabel,
        transactionId: AUDIT.transactionId,
      });
    });
    expect(result.settled).toBe(false);
    expect(result.newPaidAmount).toBe(400);

    // The payment entry committed together with the outer transaction.
    const account = db
      .prepare(`SELECT "current_balance" AS "balance", "status" FROM "debt_account" WHERE "id" = ?`)
      .get(debtAccountId) as { balance: number; status: string };
    expect(account.balance).toBe(600);
    expect(account.status).toBe("OPEN");
    const entries = db
      .prepare(`SELECT COUNT(*) AS n FROM "debt_entry" WHERE "debt_account_id" = ? AND "entry_type" = 'PAYMENT'`)
      .get(debtAccountId) as { n: number };
    expect(entries.n).toBe(1);
  });

  it("refuses a real invoice-debt port write while another flow holds the connection", async () => {
    const debtPort = createSqliteInvoiceDebtPort({ db, repository: repo, lock });
    const now = "2026-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO "invoice" ("id", "invoice_number", "supplier_name", "supplier_phone", "warehouse_id", "project_id", "status", "direction", "invoice_date", "due_date", "currency", "total_amount", "paid_amount", "remaining_amount", "debt_account_id", "notes", "created_at", "updated_at")
       VALUES (?, NULL, ?, NULL, NULL, NULL, 'RECEIVED', 'PURCHASE', NULL, NULL, 'DZD', ?, 0, ?, NULL, NULL, ?, ?)`,
    ).run("inv-2", "Acme Corp", 1000, 1000, now, now);
    const { debtAccountId } = await debtPort.createInvoiceDebt({
      supplierName: "Acme Corp",
      supplierPhone: "0555123456",
      direction: "PURCHASE",
      currency: "DZD",
      amount: 1000,
      invoiceId: "inv-2",
      actorUserId: AUDIT.actorUserId,
      actorLabel: AUDIT.actorLabel,
      transactionId: AUDIT.transactionId,
    });
    db.prepare(`UPDATE "invoice" SET "debt_account_id" = ? WHERE "id" = ?`).run(
      debtAccountId,
      "inv-2",
    );

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = lock.run(async () => {
      await gate;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The port's recordInvoicePayment is async: the sync busy throw inside
    // it surfaces as a rejection, not a synchronous throw.
    await expect(
      debtPort.recordInvoicePayment({
        invoiceId: "inv-2",
        amount: 400,
        direction: "PURCHASE",
        actorUserId: AUDIT.actorUserId,
        actorLabel: AUDIT.actorLabel,
        transactionId: AUDIT.transactionId,
      }),
    ).rejects.toThrow(FifoLockBusyError);

    release();
    await holder;

    // Once the connection is free the same write succeeds and is durable.
    const result = await debtPort.recordInvoicePayment({
      invoiceId: "inv-2",
      amount: 400,
      direction: "PURCHASE",
      actorUserId: AUDIT.actorUserId,
      actorLabel: AUDIT.actorLabel,
      transactionId: AUDIT.transactionId,
    });
    expect(result.newPaidAmount).toBe(400);
    const account = db
      .prepare(`SELECT "current_balance" AS "balance" FROM "debt_account" WHERE "id" = ?`)
      .get(debtAccountId) as { balance: number };
    expect(account.balance).toBe(600);
  });
});
