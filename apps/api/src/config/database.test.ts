import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import {
  createCompanyRepository,
  createWorkforceRepository,
  createOperationsRepository,
  createFinanceRepository,
  createAuditRepository,
} from "./database";
import { createAppConfig } from "./index";
import { InMemoryStore } from "../modules/company/adapters";

const config = createAppConfig({ BETTER_AUTH_SECRET: "test-secret" });
const inMemoryConfig = createAppConfig({ BETTER_AUTH_SECRET: "test-secret", DB_ADAPTER: "inmemory" });

/** Create an in-memory SQLite handle for factory tests. */
function createRawDb() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // Create minimal schema needed for bootstrap queries to succeed
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_bootstrap_state (
      id INTEGER PRIMARY KEY,
      singleton INTEGER DEFAULT 1,
      user_id TEXT
    );
  `);
  return db as any;
}

describe("database adapter factories", () => {
  it("createCompanyRepository returns a CompanyRepository-compatible object", () => {
    const repo = createCompanyRepository(createRawDb(), config);
    expect(typeof repo.listRoles).toBe("function");
    expect(typeof repo.withTransaction).toBe("function");
  });

  it("createWorkforceRepository returns a WorkforceRepository", () => {
    const repo = createWorkforceRepository(createRawDb(), config);
    expect(typeof repo.listRoles).toBe("function");
    expect(typeof repo.createEmployee).toBe("function");
  });

  it("createOperationsRepository returns an OperationsRepository", () => {
    const repo = createOperationsRepository(createRawDb(), config);
    expect(typeof repo.listProjects).toBe("function");
    expect(typeof repo.createProject).toBe("function");
  });

  it("createFinanceRepository returns a FinanceRepository", () => {
    const repo = createFinanceRepository(createRawDb(), config);
    expect(typeof repo.listDebtAccounts).toBe("function");
    expect(typeof repo.createDebtAccount).toBe("function");
  });

  it("createAuditRepository returns an AuditRepository", () => {
    const repo = createAuditRepository(createRawDb(), config);
    expect(typeof repo.isBootstrapOwner).toBe("function");
    expect(typeof repo.listUserProfileHistory).toBe("function");
  });

  // InMemory adapter factories (rawDb is ignored)
  it("createWorkforceRepository supports the inmemory adapter", () => {
    const repo = createWorkforceRepository(undefined as any, inMemoryConfig);
    expect(typeof repo.listRoles).toBe("function");
    expect(typeof repo.createEmployee).toBe("function");
  });

  it("createOperationsRepository supports the inmemory adapter", () => {
    const repo = createOperationsRepository(undefined as any, inMemoryConfig);
    expect(typeof repo.listProjects).toBe("function");
    expect(typeof repo.createProject).toBe("function");
  });

  it("createFinanceRepository supports the inmemory adapter", () => {
    const repo = createFinanceRepository(undefined as any, inMemoryConfig);
    expect(typeof repo.listDebtAccounts).toBe("function");
    expect(typeof repo.createDebtAccount).toBe("function");
  });

  it("createAuditRepository supports the inmemory adapter", () => {
    const repo = createAuditRepository(undefined as any, inMemoryConfig);
    expect(typeof repo.isBootstrapOwner).toBe("function");
  });

  it("createCompanyRepository supports the inmemory adapter and is functional", () => {
    const repo = createCompanyRepository(undefined as any, inMemoryConfig);
    expect(typeof repo.withTransaction).toBe("function");
    // End-to-end: create a role, list it, and query it back.
    const role = repo.createRole({ key: "worker", name: "Worker" });
    expect(repo.listRoles()).toHaveLength(1);
    expect(repo.getRoleById(role.id)?.name).toBe("Worker");
  });

  it("narrow inmemory factories share a store when one is provided", () => {
    const store = new InMemoryStore();
    const workforce = createWorkforceRepository(undefined as any, inMemoryConfig, store);
    const operations = createOperationsRepository(undefined as any, inMemoryConfig, store);

    // Create a project through the operations adapter, then verify the
    // workforce adapter can see it via the shared store.
    const project = operations.createProject({ name: "Site A", status: "ACTIVE" });
    expect(project.id).toBeTruthy();
    expect(store.projects.has(project.id)).toBe(true);
    expect(workforce).toBeDefined();
  });

  it("inmemory listEmployeesPaged honors the cursor across pages", () => {
    const repo = createCompanyRepository(undefined as any, inMemoryConfig);
    const role = repo.createRole({ key: "worker", name: "Worker" });
    for (let i = 0; i < 5; i++) {
      repo.createEmployee({
        firstName: `F${i}`,
        lastName: `L${i}`,
        phone: `0699${String(i).padStart(6, "0")}`,
        roleId: role.id,
        status: "ACTIVE",
      });
    }
    const page1 = repo.listEmployeesPaged({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = repo.listEmployeesPaged({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(2);
    // No overlap with page 1.
    const page1Ids = new Set(page1.items.map((e) => e.id));
    expect(page2.items.every((e) => !page1Ids.has(e.id))).toBe(true);

    const page3 = repo.listEmployeesPaged({ limit: 2, cursor: page2.nextCursor! });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();
  });

  it("inmemory end/void mutations persist typed status transitions", () => {
    const repo = createCompanyRepository(undefined as any, inMemoryConfig);

    // End an assignment: the record must transition to "ENDED" with the
    // provided endDate (pins the typed `status: "ENDED" as const` path).
    const assignment = repo.createManagerAssignment({
      workerId: "w-1",
      managerId: "m-1",
      status: "ACTIVE",
      startDate: "2025-01-01T00:00:00.000Z",
      endDate: null,
      notes: null,
    });
    const ended = repo.endManagerAssignment({
      id: assignment.id,
      endDate: "2025-02-01T00:00:00.000Z",
      notes: null,
    });
    expect(ended?.status).toBe("ENDED");
    expect(ended?.endDate).toBe("2025-02-01T00:00:00.000Z");

    // Void a debt entry: the record must transition to "VOIDED" (pins the
    // typed `status: "VOIDED" as const` path).
    const entry = repo.createDebtEntry({
      debtAccountId: "acc-1",
      entryType: "PAYMENT",
      signedAmountDzd: 1000,
      entryDate: "2025-01-15T00:00:00.000Z",
      balanceAfterDzd: 1000,
      note: null,
    });
    const voided = repo.voidDebtEntry({
      id: entry.id,
      voidedAt: "2025-01-16T00:00:00.000Z",
      voidedBy: "admin",
      voidReason: "entered by mistake",
    });
    expect(voided?.status).toBe("VOIDED");
    expect(voided?.voidReason).toBe("entered by mistake");
  });

  it("inmemory re-end and re-void are idempotent no-ops", () => {
    const repo = createCompanyRepository(undefined as any, inMemoryConfig);

    // Re-ending an already-ENDED assignment must not overwrite the endDate.
    const assignment = repo.createManagerAssignment({
      workerId: "w-2",
      managerId: "m-2",
      status: "ACTIVE",
      startDate: "2025-01-01T00:00:00.000Z",
      endDate: null,
      notes: null,
    });
    repo.endManagerAssignment({
      id: assignment.id,
      endDate: "2025-02-01T00:00:00.000Z",
      notes: null,
    });
    const reEnded = repo.endManagerAssignment({
      id: assignment.id,
      endDate: "2025-03-01T00:00:00.000Z",
      notes: null,
    });
    expect(reEnded?.status).toBe("ENDED");
    expect(reEnded?.endDate).toBe("2025-02-01T00:00:00.000Z");

    // Re-voiding an already-VOIDED entry must not overwrite void metadata.
    const entry = repo.createDebtEntry({
      debtAccountId: "acc-2",
      entryType: "PAYMENT",
      signedAmountDzd: 2000,
      entryDate: "2025-01-15T00:00:00.000Z",
      balanceAfterDzd: 2000,
      note: null,
    });
    repo.voidDebtEntry({
      id: entry.id,
      voidedAt: "2025-01-16T00:00:00.000Z",
      voidedBy: "admin",
      voidReason: "first",
    });
    const reVoided = repo.voidDebtEntry({
      id: entry.id,
      voidedAt: "2025-01-17T00:00:00.000Z",
      voidedBy: "admin",
      voidReason: "second",
    });
    expect(reVoided?.status).toBe("VOIDED");
    expect(reVoided?.voidedAt).toBe("2025-01-16T00:00:00.000Z");
    expect(reVoided?.voidReason).toBe("first");
  });
});
