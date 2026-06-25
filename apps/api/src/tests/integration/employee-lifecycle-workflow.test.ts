import { describe, it, expect, afterEach, beforeEach } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements as fullSchema } from "../../infrastructure/database/schema-definitions";
import { SqliteCompanyRepository } from "../../modules/company/company.repository";
import { CompanyService } from "../../modules/company/company.service";
import type { MutationAuditContext } from "../../modules/company/company.types";

// ---------------------------------------------------------------------------
// In-memory SQLite setup
// ---------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = MEMORY");
  db.pragma("foreign_keys = ON");

  for (const stmt of fullSchema) {
    db.exec(stmt);
  }

  // Seed the system roles
  const now = "2026-01-01T00:00:00.000Z";
  const roles = [
    { id: "role-worker", key: "worker", name: "Worker" },
    { id: "role-manager", key: "manager", name: "Manager" },
  ];
  const insertRole = db.prepare(
    `INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 1, ?, ?)`,
  );
  for (const r of roles) {
    insertRole.run(r.id, r.key, r.name, now, now);
  }

  return db;
}

const AUDIT: MutationAuditContext = {
  actorUserId: "user-1",
  actorLabel: "Test User",
  transactionId: "tx-1",
};

// ---------------------------------------------------------------------------
// Suite: Employee lifecycle
// ---------------------------------------------------------------------------

describe("Cross-domain: Employee lifecycle", () => {
  let db: Database.Database;
  let repo: SqliteCompanyRepository;
  let service: CompanyService;

  beforeEach(() => {
    db = createTestDb();
    repo = new SqliteCompanyRepository(db);
    service = new CompanyService(repo);
  });

  afterEach(() => {
    db.close();
  });

  it("creates employee → creates debt account → records salary → terminates", () => {
    // ---- 1. Create employee ----
    // Repository always generates its own id via crypto.randomUUID()
    const employee = repo.createEmployee(
      {
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
        status: "ACTIVE",
        salaryAmountDzd: null,
        salaryPeriod: null,
        notes: null,
      },
      AUDIT,
    );
    expect(employee).not.toBeNull();
    const employeeId = employee.id;

    // ---- 2. Create debt account for the worker ----
    const accountResult = service.createDebtAccount(
      {
        partyType: "INTERNAL_WORKER",
        workerId: employeeId,
        direction: "PAYABLE",
        note: "Worker salary account",
        openingBalanceDzd: 50000,
        openingEntryDate: "2026-02-01T00:00:00.000Z",
        openingEntryNote: "February 2026 salary",
        reasonCategory: "SALARY_ADVANCE",
      },
      AUDIT,
    );
    expect(accountResult).not.toBeNull();

    // ---- 3. Verify debt account and balance ----
    const accounts = repo.listDebtAccounts({ workerId: employeeId });
    expect(accounts.length).toBeGreaterThan(0);
    const workerAccount = accounts.find((a) => a.workerId === employeeId);
    expect(workerAccount).toBeDefined();
    expect(workerAccount!.currentBalance).toBe(50000);
    expect(workerAccount!.direction).toBe("PAYABLE");
    expect(workerAccount!.partyType).toBe("INTERNAL_WORKER");

    // ---- 4. Verify the OPENING entry exists ----
    const entries = repo.listDebtEntries({ debtAccountId: workerAccount!.id });
    expect(entries.length).toBe(1);
    expect(entries[0]!.entryType).toBe("OPENING");
    expect(entries[0]!.signedAmountDzd).toBe(50000);
    expect(entries[0]!.reasonCategory).toBe("SALARY_ADVANCE");

    // ---- 5. Record a payment against the opening entry ----
    const paymentResult = service.recordDebtPayment(
      {
        debtEntryId: entries[0]!.id,
        amountDzd: 20000,
        note: "Partial salary payment",
        paymentMethod: "CASH",
      },
      AUDIT,
    );
    expect(paymentResult).not.toBeNull();

    // ---- 6. Verify balance after payment ----
    const updatedAccount = repo.listDebtAccounts({ workerId: employeeId })[0]!;
    expect(updatedAccount.currentBalance).toBe(30000);

    // ---- 7. Terminate employee ----
    service.updateEmployee({ id: employeeId, status: "LEFT" }, AUDIT);
    const terminated = repo.getEmployeeById(employeeId);
    expect(terminated).not.toBeNull();
    expect(terminated!.status).toBe("LEFT");

    // ---- 8. Debt account should still exist after termination ----
    const postTermAccounts = repo.listDebtAccounts({ workerId: employeeId });
    expect(postTermAccounts.length).toBe(1);
    expect(postTermAccounts[0]!.currentBalance).toBe(30000);
  });

  it("creates multiple employees with separate debt accounts", () => {
    // Create two employees
    const emp1 = repo.createEmployee(
      { firstName: "Karim", lastName: "Mokhtar", phone: "0666123456", roleId: "role-worker", status: "ACTIVE", salaryAmountDzd: null, salaryPeriod: null, notes: null },
      AUDIT,
    );
    const emp2 = repo.createEmployee(
      { firstName: "Sami", lastName: "Bensalem", phone: "0777123456", roleId: "role-worker", status: "ACTIVE", salaryAmountDzd: null, salaryPeriod: null, notes: null },
      AUDIT,
    );

    // Create debt accounts
    service.createDebtAccount(
      { partyType: "INTERNAL_WORKER", workerId: emp1.id, direction: "PAYABLE", openingBalanceDzd: 30000, openingEntryDate: "2026-01-01T00:00:00.000Z", reasonCategory: "SALARY_ADVANCE" },
      AUDIT,
    );
    service.createDebtAccount(
      { partyType: "INTERNAL_WORKER", workerId: emp2.id, direction: "PAYABLE", openingBalanceDzd: 45000, openingEntryDate: "2026-01-01T00:00:00.000Z", reasonCategory: "SALARY_ADVANCE" },
      AUDIT,
    );

    // Verify each has its own account
    const accts1 = repo.listDebtAccounts({ workerId: emp1.id });
    const accts2 = repo.listDebtAccounts({ workerId: emp2.id });
    expect(accts1.length).toBe(1);
    expect(accts2.length).toBe(1);
    expect(accts1[0]!.currentBalance).toBe(30000);
    expect(accts2[0]!.currentBalance).toBe(45000);
  });

  it("rejects debt account creation for non-existent employee", () => {
    expect(() =>
      service.createDebtAccount({
        partyType: "INTERNAL_WORKER",
        workerId: "nonexistent",
        direction: "PAYABLE",
      }),
    ).toThrow(/العامل/);
  });

  it("rejects termination of non-existent employee", () => {
    expect(() =>
      service.updateEmployee({ id: "bad-id", status: "LEFT" }),
    ).toThrow(/العامل/);
  });
});
