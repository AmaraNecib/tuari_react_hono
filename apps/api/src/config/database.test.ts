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
});
