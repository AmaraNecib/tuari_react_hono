import { describe, it, expect, afterEach, beforeEach } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements as fullSchema } from "../../infrastructure/database/schema-definitions";
import { createFifoLock, FifoLockBusyError } from "../../infrastructure/database/fifo-lock";
import { SqliteCompanyRepository } from "../../modules/company/company.repository";
import { WorkspaceMutationContext } from "../../modules/company/workspace-mutation-context";
import { WorkforceService } from "../../modules/company/workforce.service";
import { createSqliteInvoiceDebtPort } from "../../modules/invoice/adapters/invoice-debt.port";
import { InvoiceRepository } from "../../modules/invoice/adapters/invoice.repository";
import { createInventoryRepository } from "../../modules/inventory/adapters/sqlite-inventory.repository";
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

// ---------------------------------------------------------------------------
// Suite: plain sync writers run under the tripwire (issue #348)
//
// #322 wrapped every explicit db.transaction() writer; the deferred D1 finding
// covered the remaining plain sync .run() writers (createRole, upsertEmployee,
// debt writers, assignment/history writers, inventory item/group writers,
// invoice updateStatus/markReceivedWithDebtAccount). Each must now throw
// FifoLockBusyError while a foreign flow holds the connection instead of
// silently joining that flow's open transaction — and succeed once it is free.
// ---------------------------------------------------------------------------

describe("Plain sync writers tripwire (issue #348)", () => {
  let db: Database.Database;
  let lock: ReturnType<typeof createFifoLock>;
  let repo: SqliteCompanyRepository;
  let inventory: ReturnType<typeof createInventoryRepository>;
  let invoiceRepo: InvoiceRepository;

  beforeEach(() => {
    db = createTestDb();
    lock = createFifoLock();
    repo = new SqliteCompanyRepository(db, lock);
    inventory = createInventoryRepository(db, lock);
    invoiceRepo = new InvoiceRepository(db, lock);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Hold the connection with a foreign async flow (the account bcrypt
   * window, issue #322), assert `action` throws {@link FifoLockBusyError},
   * then release the holder so the same write can succeed afterwards.
   * The release always runs (finally) so a failed assertion never dangles
   * the holder.
   */
  async function expectBusyWhileHeld(action: () => unknown): Promise<void> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = lock.run(async () => {
      await gate;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    try {
      expect(action).toThrow(FifoLockBusyError);
    } finally {
      release();
      await holder;
    }
  }

  /**
   * Same as {@link expectBusyWhileHeld} for async writers: the busy throw
   * surfaces as a rejection, so the caller awaits `rejects.toThrow`.
   */
  async function expectRejectsBusyWhileHeld(action: () => Promise<unknown>): Promise<void> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = lock.run(async () => {
      await gate;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    try {
      await expect(action()).rejects.toThrow(FifoLockBusyError);
    } finally {
      release();
      await holder;
    }
  }

  /** Insert a minimal invoice row so invoice writers have a target row. */
  function seedInvoice(id: string, supplierName: string) {
    const now = "2026-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO "invoice" ("id", "invoice_number", "supplier_name", "supplier_phone", "warehouse_id", "project_id", "status", "direction", "invoice_date", "due_date", "currency", "total_amount", "paid_amount", "remaining_amount", "debt_account_id", "notes", "created_at", "updated_at")
       VALUES (?, NULL, ?, NULL, NULL, NULL, 'DRAFT', 'PURCHASE', NULL, NULL, 'DZD', ?, 0, ?, NULL, NULL, ?, ?)`,
    ).run(id, supplierName, 1000, 1000, now, now);
  }

  // ── Company writers (sync → synchronous throw) ───────────────────────

  it("createRole throws busy while another flow holds the connection", async () => {
    await expectBusyWhileHeld(() => repo.createRole({ key: "manager", name: "Manager" }));
    const role = repo.createRole({ key: "manager", name: "Manager" });
    expect(role.key).toBe("manager");
  });

  it("upsertEmployee throws busy while another flow holds the connection", async () => {
    const employee = {
      id: "emp-348-upsert",
      firstName: "Karim",
      lastName: "Haddad",
      phone: "0777123456",
      roleId: "role-worker",
      status: "ACTIVE" as const,
    };
    await expectBusyWhileHeld(() => repo.upsertEmployee(employee));
    const created = repo.upsertEmployee(employee);
    expect(created.firstName).toBe("Karim");
    expect(repo.getEmployeeByPhone("0777123456")?.id).toBe("emp-348-upsert");
    // The nested insertStateHistory wrap (private helper) also committed:
    // exactly one CREATED history row, no SAVEPOINT regression.
    const history = db
      .prepare(`SELECT COUNT(*) AS n FROM "employee_state_history" WHERE "employee_id" = ?`)
      .get("emp-348-upsert") as { n: number };
    expect(history.n).toBe(1);
  });

  it("a busy upsert attempt leaves no trace once the holder releases", async () => {
    const employee = {
      id: "emp-348-no-trace",
      firstName: "No",
      lastName: "Trace",
      phone: "0777999999",
      roleId: "role-worker",
      status: "ACTIVE" as const,
    };
    await expectBusyWhileHeld(() => repo.upsertEmployee(employee));
    // The busy throw fired before any statement executed: no employee and
    // no state-history row were absorbed into (or autocommitted behind)
    // the foreign flow.
    expect(repo.getEmployeeByPhone("0777999999")).toBeNull();
    const history = db.prepare(`SELECT COUNT(*) AS n FROM "employee_state_history"`).get() as {
      n: number;
    };
    expect(history.n).toBe(0);
  });

  it("createDebtAccount throws busy while another flow holds the connection", async () => {
    const worker = repo.createEmployee({
      firstName: "Debt",
      lastName: "Worker",
      phone: "0555000001",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const account = {
      partyType: "INTERNAL_WORKER" as const,
      workerId: worker.id,
      status: "OPEN" as const,
      direction: "PAYABLE" as const,
      currentBalance: 0,
    };
    await expectBusyWhileHeld(() => repo.createDebtAccount(account));
    const created = repo.createDebtAccount(account);
    expect(created.direction).toBe("PAYABLE");
    expect(created.currentBalance).toBe(0);
  });

  it("createDebtEntry throws busy while another flow holds the connection", async () => {
    const worker = repo.createEmployee({
      firstName: "Entry",
      lastName: "Worker",
      phone: "0555000002",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const account = repo.createDebtAccount({
      partyType: "INTERNAL_WORKER",
      workerId: worker.id,
      status: "OPEN",
      direction: "PAYABLE",
      currentBalance: 0,
    });
    const entry = {
      debtAccountId: account.id,
      entryType: "ADJUSTMENT" as const,
      signedAmountDzd: 100,
      entryDate: "2026-03-01T00:00:00.000Z",
      balanceAfterDzd: 100,
    };
    await expectBusyWhileHeld(() => repo.createDebtEntry(entry));
    const created = repo.createDebtEntry(entry);
    expect(created.balanceAfterDzd).toBe(100);
  });

  it("voidDebtEntry throws busy while another flow holds the connection", async () => {
    const worker = repo.createEmployee({
      firstName: "Void",
      lastName: "Worker",
      phone: "0555000003",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const account = repo.createDebtAccount({
      partyType: "INTERNAL_WORKER",
      workerId: worker.id,
      status: "OPEN",
      direction: "PAYABLE",
      currentBalance: 100,
    });
    const entry = repo.createDebtEntry({
      debtAccountId: account.id,
      entryType: "ADJUSTMENT",
      signedAmountDzd: 100,
      entryDate: "2026-03-01T00:00:00.000Z",
      balanceAfterDzd: 100,
    });
    await expectBusyWhileHeld(() =>
      repo.voidDebtEntry({ id: entry.id, voidedAt: "2026-03-02T00:00:00.000Z", voidReason: "test" }),
    );
    const voided = repo.voidDebtEntry({ id: entry.id, voidedAt: "2026-03-02T00:00:00.000Z", voidReason: "test" });
    expect(voided?.status).toBe("VOIDED");
  });

  it("createManagerAssignment throws busy while another flow holds the connection", async () => {
    const worker = repo.createEmployee({
      firstName: "Assign",
      lastName: "Worker",
      phone: "0555000004",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const manager = repo.createEmployee({
      firstName: "Assign",
      lastName: "Manager",
      phone: "0555000005",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const assignment = {
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE" as const,
      startDate: "2026-03-01T00:00:00.000Z",
      endDate: null,
      notes: null,
    };
    await expectBusyWhileHeld(() => repo.createManagerAssignment(assignment));
    const created = repo.createManagerAssignment(assignment);
    expect(created.managerId).toBe(manager.id);
  });

  it("createExternalCounterparty throws busy while another flow holds the connection", async () => {
    await expectBusyWhileHeld(() =>
      repo.createExternalCounterparty({ fullName: "External Co", phoneNumber: "0555111222" }),
    );
    const counterparty = repo.createExternalCounterparty({
      fullName: "External Co",
      phoneNumber: "0555111222",
    });
    expect(counterparty.fullName).toBe("External Co");
  });

  it("updateDebtAccount throws busy while another flow holds the connection", async () => {
    const worker = repo.createEmployee({
      firstName: "Update",
      lastName: "Debt",
      phone: "0555000008",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const account = repo.createDebtAccount({
      partyType: "INTERNAL_WORKER",
      workerId: worker.id,
      status: "OPEN",
      direction: "PAYABLE",
      currentBalance: 0,
    });
    await expectBusyWhileHeld(() =>
      repo.updateDebtAccount({ id: account.id, status: "OPEN", currentBalance: 50 }),
    );
    const updated = repo.updateDebtAccount({ id: account.id, status: "OPEN", currentBalance: 50 });
    expect(updated?.currentBalance).toBe(50);
  });

  it("updateDebtEntryBalanceAfter throws busy while another flow holds the connection", async () => {
    const worker = repo.createEmployee({
      firstName: "Balance",
      lastName: "After",
      phone: "0555000009",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const account = repo.createDebtAccount({
      partyType: "INTERNAL_WORKER",
      workerId: worker.id,
      status: "OPEN",
      direction: "PAYABLE",
      currentBalance: 0,
    });
    const entry = repo.createDebtEntry({
      debtAccountId: account.id,
      entryType: "ADJUSTMENT",
      signedAmountDzd: 100,
      entryDate: "2026-03-01T00:00:00.000Z",
      balanceAfterDzd: 100,
    });
    await expectBusyWhileHeld(() => repo.updateDebtEntryBalanceAfter(entry.id, 200));
    repo.updateDebtEntryBalanceAfter(entry.id, 200);
    expect(repo.getDebtEntryById(entry.id)?.balanceAfterDzd).toBe(200);
  });

  it("endManagerAssignment throws busy while another flow holds the connection", async () => {
    const worker = repo.createEmployee({
      firstName: "End",
      lastName: "Assign",
      phone: "0555000010",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const manager = repo.createEmployee({
      firstName: "End",
      lastName: "Manager",
      phone: "0555000011",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const assignment = repo.createManagerAssignment({
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE",
      startDate: "2026-03-01T00:00:00.000Z",
      endDate: null,
      notes: null,
    });
    await expectBusyWhileHeld(() =>
      repo.endManagerAssignment({
        id: assignment.id,
        endDate: "2026-04-01T00:00:00.000Z",
        notes: null,
      }),
    );
    const ended = repo.endManagerAssignment({
      id: assignment.id,
      endDate: "2026-04-01T00:00:00.000Z",
      notes: null,
    });
    expect(ended?.status).toBe("ENDED");
  });

  it("a newly-wrapped writer still joins our own open run across a real yield", async () => {
    // The join-outer half of the tripwire: inside lock.run (the payment /
    // invoice-debt pattern), a wrapped sync writer must execute immediately
    // and commit with the outer flow — not throw busy.
    const role = await lock.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return repo.createRole({ key: "joiner", name: "Joiner" });
    });
    expect(role.key).toBe("joiner");
    expect(repo.getRoleByKey("joiner")?.id).toBe(role.id);
  });

  it("createSalaryPayment throws busy while another flow holds the connection", async () => {
    const worker = repo.createEmployee({
      firstName: "Salary",
      lastName: "Worker",
      phone: "0555000006",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const payment = {
      employeeId: worker.id,
      periodType: "MONTHLY" as const,
      days: 30,
      expectedAmountDzd: 50000,
      actualAmountDzd: 50000,
      projectSplits: [],
      paymentDate: "2026-03-01T00:00:00.000Z",
    };
    await expectBusyWhileHeld(() => repo.createSalaryPayment(payment));
    const created = repo.createSalaryPayment(payment);
    expect(created.employeeId).toBe(worker.id);
  });

  // ── Inventory writers (sync → synchronous throw) ─────────────────────

  it("inventory createItemDefinition throws busy while another flow holds the connection", async () => {
    await expectBusyWhileHeld(() =>
      inventory.createItemDefinition({ name: "Cement", itemType: "CONSUMABLE", unit: "bag" }),
    );
    const item = inventory.createItemDefinition({ name: "Cement", itemType: "CONSUMABLE", unit: "bag" });
    expect(item.name).toBe("Cement");
  });

  it("inventory createInvoiceGroup throws busy while another flow holds the connection", async () => {
    await expectBusyWhileHeld(() => inventory.createInvoiceGroup({ supplierName: "Supplier X" }));
    const group = inventory.createInvoiceGroup({ supplierName: "Supplier X" });
    expect(group.supplierName).toBe("Supplier X");
  });

  it("inventory updateInvoiceGroupPayment throws busy while another flow holds the connection", async () => {
    const group = inventory.createInvoiceGroup({ supplierName: "Supplier Y" });
    await expectBusyWhileHeld(() => inventory.updateInvoiceGroupPayment(group.id, 200, 800));
    const updated = inventory.updateInvoiceGroupPayment(group.id, 200, 800);
    expect(updated?.paidAmountDzd).toBe(200);
    expect(updated?.remainingDebtDzd).toBe(800);
  });

  // ── Invoice writers (async → the busy throw surfaces as a rejection) ──

  it("invoice updateStatus rejects busy while another flow holds the connection", async () => {
    seedInvoice("inv-348-1", "Acme Corp");

    await expectRejectsBusyWhileHeld(() => invoiceRepo.updateStatus("inv-348-1", "RECEIVED"));

    const updated = await invoiceRepo.updateStatus("inv-348-1", "RECEIVED");
    expect(updated.status).toBe("RECEIVED");
  });

  it("invoice markReceivedWithDebtAccount rejects busy while another flow holds the connection", async () => {
    const worker = repo.createEmployee({
      firstName: "Invoice",
      lastName: "Debtor",
      phone: "0555000007",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const account = repo.createDebtAccount({
      partyType: "INTERNAL_WORKER",
      workerId: worker.id,
      status: "OPEN",
      direction: "PAYABLE",
      currentBalance: 1000,
    });
    seedInvoice("inv-348-2", "Acme Corp");

    await expectRejectsBusyWhileHeld(() =>
      invoiceRepo.markReceivedWithDebtAccount("inv-348-2", account.id),
    );

    const updated = await invoiceRepo.markReceivedWithDebtAccount("inv-348-2", account.id);
    expect(updated.status).toBe("RECEIVED");
    expect(updated.debtAccountId).toBe(account.id);
  });
});
