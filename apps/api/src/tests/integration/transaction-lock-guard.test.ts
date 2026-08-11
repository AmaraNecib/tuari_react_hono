import { describe, it, expect, afterEach, beforeEach } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements as fullSchema } from "../../infrastructure/database/schema-definitions";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { SqliteCompanyRepository } from "../../modules/company/company.repository";
import { WorkspaceMutationContext } from "../../modules/company/workspace-mutation-context";
import { WorkforceService } from "../../modules/company/workforce.service";
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

const AUDIT: MutationAuditContext = {
  actorUserId: "user-1",
  actorLabel: "Test User",
  transactionId: "tx-1",
};

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
    ).toThrow(/busy|transaction/i);

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
});
