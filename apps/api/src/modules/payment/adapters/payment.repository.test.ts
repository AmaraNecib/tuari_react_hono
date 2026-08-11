/**
 * PaymentRepositoryImpl (sqlite) tests — transaction paths.
 *
 * The module tests exercise the payment module through the in-memory
 * adapter; these tests pin the sqlite adapter's own contracts against a
 * real better-sqlite3 connection with the full app schema:
 *   - commit / rollback of the runInTransaction flow,
 *   - joining an externally-opened transaction (outer owns COMMIT/ROLLBACK),
 *   - serialization of concurrent transactions on the shared connection,
 *   - cross-module serialization (account repo + payment adapter sharing
 *     ONE connection-wide lock — the #288 regression pin),
 *   - deletePayment atomicity.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import { schemaStatements } from "../../../infrastructure/database/schema-definitions";
import { createDrizzleFromSqlite } from "../../../infrastructure/database/drizzle";
import { createFifoLock, type FifoLock } from "../../../infrastructure/database/fifo-lock";
import { DrizzleAccountRepository } from "../../account/account.repository";
import { PaymentRepositoryImpl } from "./payment.repository";
import type { PaymentRepository } from "../payment.repository";

function createTestEnv() {
  const rawDb = new Database(":memory:");
  rawDb.pragma("foreign_keys = ON");
  for (const stmt of schemaStatements) {
    rawDb.exec(stmt);
  }
  const lock = createFifoLock();
  const paymentRepo = new PaymentRepositoryImpl(rawDb, lock);
  return { rawDb, lock, paymentRepo };
}

function insertUser(rawDb: Database.Database, id: string): void {
  const now = "2026-01-01T00:00:00.000Z";
  rawDb
    .prepare(
      `INSERT INTO "user" ("id", "name", "phoneNumber", "phoneNumberVerified", "created_at", "updated_at")
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .run(id, `User ${id}`, "0612345678", now, now);
}

/** Insert the invoice row that payment_allocation.invoice_id references. */
function insertInvoice(rawDb: Database.Database, id: string, totalAmount = 1000): void {
  const now = "2026-06-01T00:00:00.000Z";
  rawDb
    .prepare(
      `INSERT INTO "invoice" ("id", "invoice_number", "supplier_name", "supplier_phone", "warehouse_id", "project_id", "status", "direction", "invoice_date", "due_date", "currency", "total_amount", "paid_amount", "remaining_amount", "debt_account_id", "notes", "created_at", "updated_at")
       VALUES (?, NULL, ?, NULL, NULL, NULL, 'RECEIVED', 'PURCHASE', NULL, NULL, 'DZD', ?, 0, ?, NULL, NULL, ?, ?)`,
    )
    .run(id, "Acme Corp", totalAmount, totalAmount, now, now);
}

function paymentRows(rawDb: Database.Database) {
  return rawDb.prepare(`SELECT * FROM "payment" ORDER BY "id"`).all() as Array<Record<string, unknown>>;
}

function allocationRows(rawDb: Database.Database) {
  return rawDb.prepare(`SELECT * FROM "payment_allocation" ORDER BY "id"`).all() as Array<Record<string, unknown>>;
}

function paymentInput(id: string, amount = 1000) {
  return {
    id,
    counterpartyType: "EXTERNAL_COUNTERPARTY",
    counterpartyId: "cp-1",
    paymentDate: "2026-06-25T10:00:00.000Z",
    paymentMethod: "CASH",
    totalAmount: amount,
    notes: null,
    actorUserId: null,
    actorLabel: null,
    transactionId: null,
    createdAt: "2026-06-25T10:00:00.000Z",
    updatedAt: "2026-06-25T10:00:00.000Z",
  };
}

function insertPayment(repo: PaymentRepository, id: string): Promise<void> {
  return repo.runInTransaction(async () => {
    await repo.createPayment(paymentInput(id));
    await repo.createAllocation({
      id: `${id}-alloc-1`,
      paymentId: id,
      invoiceId: "inv-1",
      amount: 1000,
      createdAt: "2026-06-25T10:00:00.000Z",
    });
  });
}

describe("PaymentRepositoryImpl (sqlite)", () => {
  let env: ReturnType<typeof createTestEnv>;
  let rawDb: Database.Database;
  let repo: PaymentRepository;

  beforeEach(() => {
    env = createTestEnv();
    rawDb = env.rawDb;
    repo = env.paymentRepo;
    insertInvoice(rawDb, "inv-1");
  });

  afterEach(() => {
    rawDb.close();
  });

  it("commits writes performed inside the transaction", async () => {
    await insertPayment(repo, "pmt-1");

    expect(paymentRows(rawDb)).toHaveLength(1);
    expect(allocationRows(rawDb)).toHaveLength(1);

    const saved = await repo.findById("pmt-1");
    expect(saved).not.toBeNull();
    expect(saved!.allocations).toHaveLength(1);
    expect(saved!.allocations[0]!.amount).toBe(1000);
  });

  it("rolls back all writes when the transaction callback throws", async () => {
    await expect(
      repo.runInTransaction(async () => {
        await repo.createPayment(paymentInput("pmt-bad"));
        await repo.createAllocation({
          id: "pmt-bad-alloc-1",
          paymentId: "pmt-bad",
          invoiceId: "inv-1",
          amount: 1000,
          createdAt: "2026-06-25T10:00:00.000Z",
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // All-or-nothing: neither the payment nor its allocation landed.
    expect(paymentRows(rawDb)).toHaveLength(0);
    expect(allocationRows(rawDb)).toHaveLength(0);
    expect(await repo.findById("pmt-bad")).toBeNull();
  });

  it("joins an already-open outer transaction instead of BEGINning a second one", async () => {
    // Simulate an external flow that opened the transaction on the shared
    // connection (e.g. a bootstrap flow, or a future caller).
    rawDb.exec("BEGIN IMMEDIATE");
    await insertPayment(repo, "pmt-join");
    // The repository must NOT have committed — the outer flow owns COMMIT.
    rawDb.exec("COMMIT");

    expect(await repo.findById("pmt-join")).not.toBeNull();
  });

  it("lets the outer transaction own the rollback when a nested run fails", async () => {
    rawDb.exec("BEGIN IMMEDIATE");
    await expect(
      repo.runInTransaction(async () => {
        await repo.createPayment(paymentInput("pmt-join-bad"));
        throw new Error("outer flow aborts");
      }),
    ).rejects.toThrow("outer flow aborts");

    // The outer flow rolls back, undoing the joined write too.
    rawDb.exec("ROLLBACK");
    expect(paymentRows(rawDb)).toHaveLength(0);
  });

  it("releases the lock after a failing transaction", async () => {
    await expect(
      repo.runInTransaction(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // The connection-wide lock was released: the next transaction runs.
    await insertPayment(repo, "pmt-after-fail");
    expect(paymentRows(rawDb)).toHaveLength(1);
  });

  it("serializes concurrent transactions instead of colliding at BEGIN", async () => {
    const results = await Promise.all([
      repo.runInTransaction(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "a";
      }),
      repo.runInTransaction(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return "b";
      }),
    ]);

    // FIFO: no "cannot start a transaction within a transaction" — both
    // transactions queued behind the connection-wide lock.
    expect(results).toEqual(["a", "b"]);
  });

  it("serializes transactions across modules sharing the connection lock (#288)", async () => {
    // Same connection-wide lock wired into BOTH the account repo and the
    // payment adapter — exactly like the composition root (dependencies.ts).
    const db = createDrizzleFromSqlite(rawDb);
    const accountRepo = new DrizzleAccountRepository(db, env.lock);
    insertUser(rawDb, "user-1");

    // The account transaction stays OPEN across an await (the #249 bcrypt
    // window) and then ABORTS. Before the connection-wide lock, a concurrent
    // payment runInTransaction would exec("BEGIN") inside it and throw
    // "cannot start a transaction within a transaction" → spurious 500;
    // with a broken lock it would join the account transaction and its write
    // would be silently rolled back. With the shared lock it must queue,
    // run cleanly after the rollback, and COMMIT its own write.
    const accountTx = accountRepo.withTransaction(async (tx) => {
      await tx.updateUserProfile({
        id: "user-1",
        name: "بلال",
        updatedAt: new Date("2026-06-25T10:00:00.000Z"),
      });
      await new Promise((r) => setTimeout(r, 20)); // simulate slow bcrypt verify
      throw new Error("acct aborts");
    });

    const paymentTx = repo.runInTransaction(async () => {
      await repo.createPayment(paymentInput("pmt-xmodule"));
      return "pmt-done";
    });

    await expect(paymentTx).resolves.toBe("pmt-done");
    await expect(accountTx).rejects.toThrow("acct aborts");

    // The account's own write was rolled back...
    const name = rawDb
      .prepare(`SELECT "name" FROM "user" WHERE "id" = ?`)
      .get("user-1") as { name: string };
    expect(name.name).toBe("User user-1");

    // ...but the payment's write was NOT absorbed by the rolled-back account
    // transaction — it committed in its own transaction.
    expect(paymentRows(rawDb)).toHaveLength(1);
    expect(await repo.findById("pmt-xmodule")).not.toBeNull();
  });

  it("queues a payment transaction behind a COMMITTING account transaction (#288)", async () => {
    const db = createDrizzleFromSqlite(rawDb);
    const accountRepo = new DrizzleAccountRepository(db, env.lock);
    insertUser(rawDb, "user-1");

    // The account transaction stays open across an await, then COMMITS.
    const accountTx = accountRepo.withTransaction(async (tx) => {
      await tx.updateUserProfile({
        id: "user-1",
        name: "بلال",
        updatedAt: new Date("2026-06-25T10:00:00.000Z"),
      });
      await new Promise((r) => setTimeout(r, 20));
    });

    // The payment must queue, then run cleanly after the account COMMIT —
    // both writes persist, in their own transactions.
    const paymentTx = repo.runInTransaction(async () => {
      await repo.createPayment(paymentInput("pmt-xmodule-commit"));
    });

    await expect(accountTx).resolves.toBeUndefined();
    await expect(paymentTx).resolves.toBeUndefined();

    const name = rawDb
      .prepare(`SELECT "name" FROM "user" WHERE "id" = ?`)
      .get("user-1") as { name: string };
    expect(name.name).toBe("بلال"); // account write committed
    expect(paymentRows(rawDb)).toHaveLength(1); // payment write committed
  });

  it("deleteIfUnallocated returns NOT_FOUND for a missing id", async () => {
    const result = await repo.deleteIfUnallocated("nope");
    expect(result).toEqual({ status: "NOT_FOUND" });
    expect(paymentRows(rawDb)).toHaveLength(0);
  });

  it("deleteIfUnallocated refuses when allocations exist and deletes nothing", async () => {
    await insertPayment(repo, "pmt-del");
    expect(paymentRows(rawDb)).toHaveLength(1);

    const result = await repo.deleteIfUnallocated("pmt-del");

    expect(result).toEqual({ status: "HAS_ALLOCATIONS", count: 1 });
    // Guarded delete: the payment AND its allocation survive untouched.
    expect(paymentRows(rawDb)).toHaveLength(1);
    expect(allocationRows(rawDb)).toHaveLength(1);
  });

  it("deleteIfUnallocated reports the exact allocation count", async () => {
    await repo.runInTransaction(async () => {
      await repo.createPayment(paymentInput("pmt-multi"));
      await repo.createAllocation({
        id: "pmt-multi-alloc-1",
        paymentId: "pmt-multi",
        invoiceId: "inv-1",
        amount: 500,
        createdAt: "2026-06-25T10:00:00.000Z",
      });
      await repo.createAllocation({
        id: "pmt-multi-alloc-2",
        paymentId: "pmt-multi",
        invoiceId: "inv-1",
        amount: 500,
        createdAt: "2026-06-25T10:00:00.000Z",
      });
    });

    const result = await repo.deleteIfUnallocated("pmt-multi");

    expect(result).toEqual({ status: "HAS_ALLOCATIONS", count: 2 });
    expect(paymentRows(rawDb)).toHaveLength(1);
    expect(allocationRows(rawDb)).toHaveLength(2);
  });

  it("deleteIfUnallocated deletes an unallocated payment", async () => {
    await repo.createPayment(paymentInput("pmt-empty"));

    const result = await repo.deleteIfUnallocated("pmt-empty");

    expect(result).toEqual({ status: "DELETED" });
    expect(paymentRows(rawDb)).toHaveLength(0);
    expect(allocationRows(rawDb)).toHaveLength(0);
  });

  it("BEGIN IMMEDIATE holds the SQLite write reservation against a second connection", async () => {
    // Two connections to the same file: the write reservation is acquired
    // at BEGIN, so a second connection cannot BEGIN IMMEDIATE until the
    // first releases — the cross-process double-allocation protection.
    const dbDir = mkdtempSync(join(tmpdir(), "payment-busy-"));
    const dbPath = join(dbDir, "test.sqlite");
    const connA = new Database(dbPath, { timeout: 0 });
    const connB = new Database(dbPath, { timeout: 0 });
    try {
      connA.exec("BEGIN IMMEDIATE");
      // No busy_timeout on these test connections: fails immediately.
      expect(() => connB.exec("BEGIN IMMEDIATE")).toThrow(/locked|busy/i);

      connA.exec("ROLLBACK");
      connB.exec("BEGIN IMMEDIATE"); // unblocked once the reservation releases
      connB.exec("ROLLBACK");
    } finally {
      connA.close();
      connB.close();
      rmSync(dbDir, { recursive: true, force: true });
    }
  });

  it("round-trips CRUD reads (findById / findPaged / findAllocationsByPaymentId)", async () => {
    await insertPayment(repo, "pmt-crud");

    const saved = await repo.findById("pmt-crud");
    expect(saved).not.toBeNull();
    expect(saved!.counterpartyType).toBe("EXTERNAL_COUNTERPARTY");
    expect(saved!.totalAmount).toBe(1000);

    const paged = await repo.findPaged({ limit: 10 });
    expect(paged.totalCount).toBe(1);
    expect(paged.items).toHaveLength(1);
    expect(paged.nextCursor).toBeNull();

    const allocs = await repo.findAllocationsByPaymentId("pmt-crud");
    expect(allocs).toHaveLength(1);
    expect(allocs[0]!.invoiceId).toBe("inv-1");
  });
});
