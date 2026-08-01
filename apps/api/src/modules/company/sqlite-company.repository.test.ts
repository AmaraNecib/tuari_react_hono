import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements as fullSchema } from "../../infrastructure/database/schema-definitions";
import { SqliteCompanyRepository } from "./sqlite-company.repository";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = MEMORY");
  db.pragma("foreign_keys = ON");

  for (const stmt of fullSchema) {
    db.exec(stmt);
  }

  // Seed the system roles.
  const now = "2026-01-01T00:00:00.000Z";
  const insertRole = db.prepare(
    `INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 1, ?, ?)`,
  );
  insertRole.run("role-worker", "worker", "Worker", now, now);

  return db;
}

describe("SqliteCompanyRepository end/void idempotency", () => {
  let repo: SqliteCompanyRepository;

  beforeEach(() => {
    repo = new SqliteCompanyRepository(createTestDb());
  });

  it("re-ending an already-ENDED manager assignment is a no-op", () => {
    const worker = repo.createEmployee({
      firstName: "Ahmed",
      lastName: "Ben Ali",
      phone: "0555123456",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const manager = repo.createEmployee({
      firstName: "Sara",
      lastName: "Bouzid",
      phone: "0666123456",
      roleId: "role-worker",
      status: "ACTIVE",
    });

    const assignment = repo.createManagerAssignment({
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE",
      startDate: "2026-02-01T00:00:00.000Z",
      endDate: null,
      notes: null,
    });

    repo.endManagerAssignment({
      id: assignment.id,
      endDate: "2026-03-01T00:00:00.000Z",
      notes: null,
    });
    const reEnded = repo.endManagerAssignment({
      id: assignment.id,
      endDate: "2026-04-01T00:00:00.000Z",
      notes: null,
    });

    expect(reEnded?.status).toBe("ENDED");
    expect(reEnded?.endDate).toBe("2026-03-01T00:00:00.000Z");
  });

  it("re-voiding an already-VOIDED debt entry is a no-op", () => {
    const counterparty = repo.createExternalCounterparty({
      fullName: "Algiers Materials SARL",
      phoneNumber: "021123456",
      note: null,
    });
    const account = repo.createDebtAccount({
      partyType: "EXTERNAL_COUNTERPARTY",
      externalCounterpartyId: counterparty.id,
      status: "OPEN",
      direction: "PAYABLE",
      currentBalance: 0,
      note: null,
    });

    const entry = repo.createDebtEntry({
      debtAccountId: account.id,
      entryType: "PAYMENT",
      signedAmountDzd: 1000,
      entryDate: "2026-02-15T00:00:00.000Z",
      balanceAfterDzd: 1000,
      note: null,
    });

    repo.voidDebtEntry({
      id: entry.id,
      voidedAt: "2026-02-16T00:00:00.000Z",
      voidedBy: "admin",
      voidReason: "first",
    });
    const reVoided = repo.voidDebtEntry({
      id: entry.id,
      voidedAt: "2026-02-17T00:00:00.000Z",
      voidedBy: "admin",
      voidReason: "second",
    });

    expect(reVoided?.status).toBe("VOIDED");
    expect(reVoided?.voidedAt).toBe("2026-02-16T00:00:00.000Z");
    expect(reVoided?.voidReason).toBe("first");
  });
});
