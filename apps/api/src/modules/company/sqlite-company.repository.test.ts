import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements as fullSchema } from "../../infrastructure/database/schema-definitions";
import { SqliteCompanyRepository } from "./adapters/sqlite-company.repository";

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
  let db: Database.Database;
  let repo: SqliteCompanyRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new SqliteCompanyRepository(db);
  });

  afterEach(() => {
    db.close();
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

  it("re-ending an already-ENDED project assignment is a no-op", () => {
    const worker = repo.createEmployee({
      firstName: "Yacine",
      lastName: "Merbah",
      phone: "0777123456",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const project = repo.createProject({ name: "Site B", status: "ACTIVE" });

    const assignment = repo.createProjectAssignment({
      employeeId: worker.id,
      projectId: project.id,
      status: "ACTIVE",
      startDate: "2026-02-01T00:00:00.000Z",
      endDate: null,
      notes: null,
    });

    repo.endProjectAssignment({
      id: assignment.id,
      endDate: "2026-03-01T00:00:00.000Z",
      notes: null,
    });
    const reEnded = repo.endProjectAssignment({
      id: assignment.id,
      endDate: "2026-04-01T00:00:00.000Z",
      notes: null,
    });

    expect(reEnded?.status).toBe("ENDED");
    expect(reEnded?.endDate).toBe("2026-03-01T00:00:00.000Z");
  });

  it("re-ending an already-ENDED warehouse assignment is a no-op", () => {
    const worker = repo.createEmployee({
      firstName: "Lina",
      lastName: "Hamdi",
      phone: "0888123456",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const warehouse = repo.createWarehouse({ name: "Depot B", status: "ACTIVE" });

    const assignment = repo.createWarehouseAssignment({
      employeeId: worker.id,
      warehouseId: warehouse.id,
      status: "ACTIVE",
      startDate: "2026-02-01T00:00:00.000Z",
      endDate: null,
      notes: null,
    });

    repo.endWarehouseAssignment({
      id: assignment.id,
      endDate: "2026-03-01T00:00:00.000Z",
      notes: null,
    });
    const reEnded = repo.endWarehouseAssignment({
      id: assignment.id,
      endDate: "2026-04-01T00:00:00.000Z",
      notes: null,
    });

    expect(reEnded?.status).toBe("ENDED");
    expect(reEnded?.endDate).toBe("2026-03-01T00:00:00.000Z");
  });

  it("end/void return null for unknown ids", () => {
    expect(
      repo.endManagerAssignment({ id: "nope", endDate: "2026-05-01T00:00:00.000Z", notes: null }),
    ).toBeNull();
    expect(
      repo.endProjectAssignment({ id: "nope", endDate: "2026-05-01T00:00:00.000Z", notes: null }),
    ).toBeNull();
    expect(
      repo.endWarehouseAssignment({ id: "nope", endDate: "2026-05-01T00:00:00.000Z", notes: null }),
    ).toBeNull();
    expect(
      repo.voidDebtEntry({ id: "nope", voidedAt: "2026-05-01T00:00:00.000Z", voidedBy: "admin", voidReason: "x" }),
    ).toBeNull();
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

describe("SqliteCompanyRepository.withTransaction", () => {
  let db: Database.Database;
  let repo: SqliteCompanyRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new SqliteCompanyRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("commits multi-table writes when the callback succeeds", () => {
    const { worker, manager, assignmentId } = repo.withTransaction(() => {
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
      });
      return { worker, manager, assignmentId: assignment.id };
    });

    // Everything written inside the transaction is durable afterwards.
    expect(repo.getEmployeeById(worker.id)?.firstName).toBe("Ahmed");
    expect(repo.getEmployeeById(manager.id)?.firstName).toBe("Sara");
    expect(repo.getManagerAssignmentById(assignmentId)?.status).toBe("ACTIVE");
  });

  it("rolls back all writes when the callback throws", () => {
    expect(() => {
      repo.withTransaction(() => {
        const worker = repo.createEmployee({
          firstName: "Rolled",
          lastName: "Back",
          phone: "0777123456",
          roleId: "role-worker",
          status: "ACTIVE",
        });
        const manager = repo.createEmployee({
          firstName: "Never",
          lastName: "Persisted",
          phone: "0888123456",
          roleId: "role-worker",
          status: "ACTIVE",
        });
        repo.createManagerAssignment({
          workerId: worker.id,
          managerId: manager.id,
          status: "ACTIVE",
          startDate: "2026-02-01T00:00:00.000Z",
        });
        throw new Error("boom");
      });
    }).toThrow("boom");

    // Nothing written inside the failed transaction may survive.
    expect(repo.listEmployees()).toHaveLength(0);
  });

  it("rethrows the original error instance", () => {
    const expected = new Error("boom");

    let thrown: unknown;
    try {
      repo.withTransaction(() => {
        throw expected;
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(expected);
  });

  it("rejects async callbacks loudly instead of committing early", () => {
    expect(() => {
      repo.withTransaction(async () => {
        repo.createEmployee({
          firstName: "Async",
          lastName: "Leak",
          phone: "0999123456",
          roleId: "role-worker",
          status: "ACTIVE",
        });
      });
    }).toThrow(/cannot return a promise/);

    expect(repo.listEmployees()).toHaveLength(0);
  });
});
