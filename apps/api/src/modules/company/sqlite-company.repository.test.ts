import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements as fullSchema } from "../../infrastructure/database/schema-definitions";
import { createFifoLock, FifoLockBusyError } from "../../infrastructure/database/fifo-lock";
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

  it("persists and updates the employee occupation field", () => {
    const created = repo.createEmployee({
      firstName: "Ahmed",
      lastName: "Ben Ali",
      phone: "0555123456",
      roleId: "role-worker",
      status: "ACTIVE",
      occupation: "عامل بناء",
    });
    expect(created.occupation).toBe("عامل بناء");

    const missing = repo.createEmployee({
      firstName: "Sara",
      lastName: "Bouzid",
      phone: "0666123456",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    expect(missing.occupation).toBeNull();

    const updated = repo.updateEmployee({ id: created.id, occupation: "نقاش" });
    expect(updated?.occupation).toBe("نقاش");
    expect(updated?.firstName).toBe("Ahmed");

    const cleared = repo.updateEmployee({ id: created.id, occupation: null });
    expect(cleared?.occupation).toBeNull();
  });

  it("persists occupation through the batch creation path", () => {
    const batch = repo.createEmployeesBatch([
      {
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
        status: "ACTIVE",
        occupation: "سائق",
        managerId: null,
        projectId: null,
      },
      {
        firstName: "Sara",
        lastName: "Bouzid",
        phone: "0666123456",
        roleId: "role-worker",
        status: "ACTIVE",
        managerId: null,
        projectId: null,
      },
    ]);

    expect(batch.employees[0]?.occupation).toBe("سائق");
    expect(batch.employees[1]?.occupation).toBeNull();
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

  it("leaves the connection usable after a rollback", () => {
    // A failed transaction must not leave the connection mid-transaction.
    expect(() => {
      repo.withTransaction(() => {
        repo.createEmployee({
          firstName: "Doomed",
          lastName: "Rollback",
          phone: "0555987654",
          roleId: "role-worker",
          status: "ACTIVE",
        });
        throw new Error("boom");
      });
    }).toThrow("boom");

    expect(repo.listEmployees()).toHaveLength(0);

    // The next transaction runs and commits durably — the rollback released
    // the connection instead of leaving it stuck inside the failed flow.
    const employee = repo.withTransaction(() =>
      repo.createEmployee({
        firstName: "After",
        lastName: "Rollback",
        phone: "0666987654",
        roleId: "role-worker",
        status: "ACTIVE",
      }),
    );
    expect(repo.getEmployeeById(employee.id)?.firstName).toBe("After");
  });

  it("rolls back and propagates non-Error throws unchanged", () => {
    let thrown: unknown;
    try {
      repo.withTransaction(() => {
        repo.createEmployee({
          firstName: "String",
          lastName: "Throw",
          phone: "0777987654",
          roleId: "role-worker",
          status: "ACTIVE",
        });
        throw "boom";
      });
    } catch (error) {
      thrown = error;
    }

    // Pin identity: better-sqlite3 rethrows the thrown value as-is.
    expect(thrown).toBe("boom");
    expect(repo.listEmployees()).toHaveLength(0);
  });

  it("propagates the callback's return value", () => {
    expect(repo.withTransaction(() => 42)).toBe(42);
  });

  it("commits a no-op transaction and leaves the connection usable", () => {
    expect(() => repo.withTransaction(() => {})).not.toThrow();
    expect(repo.withTransaction(() => 1)).toBe(1);
  });

  it("nested withTransaction: an inner commit is undone by the outer rollback", () => {
    expect(() => {
      repo.withTransaction(() => {
        // createEmployee wraps its own raw.transaction — inside the outer
        // transaction it becomes a savepoint. Its commit must not survive the
        // outer rollback.
        repo.withTransaction(() =>
          repo.createEmployee({
            firstName: "Inner",
            lastName: "Savepoint",
            phone: "0555123477",
            roleId: "role-worker",
            status: "ACTIVE",
          }),
        );
        throw new Error("outer boom");
      });
    }).toThrow("outer boom");

    expect(repo.listEmployees()).toHaveLength(0);
  });

  it("rolls back on a DB-originated error and leaves the connection usable", () => {
    repo.createEmployee({
      firstName: "Taken",
      lastName: "Phone",
      phone: "0555123456",
      roleId: "role-worker",
      status: "ACTIVE",
    });

    // The UNIQUE violation surfaces from inside the nested savepoint stack.
    expect(() => {
      repo.withTransaction(() =>
        repo.createEmployee({
          firstName: "Clash",
          lastName: "Phone",
          phone: "0555123456",
          roleId: "role-worker",
          status: "ACTIVE",
        }),
      );
    }).toThrow(/UNIQUE/);

    expect(repo.listEmployees()).toHaveLength(1);
    // The connection is usable after the constraint-driven rollback.
    expect(repo.withTransaction(() => 1)).toBe(1);
  });

  it("joins an externally-opened raw transaction via savepoint", () => {
    db.prepare("BEGIN").run();

    // better-sqlite3's transaction wrapper joins an open transaction with a
    // savepoint instead of failing — writes land inside the open transaction.
    const employee = repo.withTransaction(() =>
      repo.createEmployee({
        firstName: "Joiner",
        lastName: "OpenTx",
        phone: "0555123466",
        roleId: "role-worker",
        status: "ACTIVE",
      }),
    );
    expect(repo.getEmployeeById(employee.id)?.firstName).toBe("Joiner");

    // The outer raw transaction owns COMMIT/ROLLBACK: rolling it back undoes
    // the join's writes too.
    db.prepare("ROLLBACK").run();
    expect(repo.getEmployeeById(employee.id)).toBeNull();
  });
});

describe("SqliteCompanyRepository employee search (issue #183)", () => {
  let db: Database.Database;
  let repo: SqliteCompanyRepository;

  const seedEmployees = () => {
    repo.createEmployee({
      firstName: "Ahmed",
      lastName: "Ben Ali",
      phone: "0555123456",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    repo.createEmployee({
      firstName: "Sara",
      lastName: "Bouzid",
      phone: "0666123456",
      roleId: "role-worker",
      status: "INACTIVE",
    });
    repo.createEmployee({
      firstName: "Yacine",
      lastName: "Merbah",
      phone: "0777123456",
      roleId: "role-worker",
      status: "ACTIVE",
    });
  };

  beforeEach(() => {
    db = createTestDb();
    repo = new SqliteCompanyRepository(db);
    seedEmployees();
  });

  afterEach(() => {
    db.close();
  });

  it("filters the paged list by name/phone across all records (before pagination)", () => {
    const result = repo.listEmployeesPaged({
      filters: { search: "ben" },
      limit: 1,
    });

    // Only Ahmed Ben Ali matches "ben"; total is the WHOLE filtered set, not the page.
    expect(result.items.map((e) => e.firstName)).toEqual(["Ahmed"]);
    expect(result.total).toBe(1);
    expect(result.nextCursor).toBeNull();
  });

  it("matches phone numbers and is case-insensitive on ASCII names", () => {
    const byPhone = repo.listEmployees({ search: "0777123456" });
    expect(byPhone.map((e) => e.firstName)).toEqual(["Yacine"]);

    const byCase = repo.listEmployees({ search: "BEN ALI" });
    expect(byCase.map((e) => e.firstName)).toEqual(["Ahmed"]);
  });

  it("matches on both first and last name fields", () => {
    const byLastName = repo.listEmployees({ search: "Bouzid" });
    expect(byLastName.map((e) => e.firstName)).toEqual(["Sara"]);

    const byFirstName = repo.listEmployees({ search: "yac" });
    expect(byFirstName.map((e) => e.firstName)).toEqual(["Yacine"]);
  });

  it("matches a term spanning the first and last name (full-name search)", () => {
    const result = repo.listEmployees({ search: "Ahmed ben" });
    expect(result.map((e) => e.firstName)).toEqual(["Ahmed"]);

    const paged = repo.listEmployeesPaged({
      filters: { search: "sara bouzid" },
      limit: 50,
    });
    expect(paged.items.map((e) => e.firstName)).toEqual(["Sara"]);
    expect(paged.total).toBe(1);
  });

  it("treats LIKE wildcard characters in the term literally", () => {
    // No seeded name or phone contains a literal "%" or "_", so a search
    // for those characters must return nothing instead of matching every row
    // (i.e. they are escaped, not interpreted as LIKE wildcards).
    expect(repo.listEmployees({ search: "%" })).toEqual([]);
    expect(repo.listEmployees({ search: "_" })).toEqual([]);
    // The escape char itself is also matched literally.
    expect(repo.listEmployees({ search: "\\" })).toEqual([]);
  });

  it("combines search with the status filter", () => {
    const result = repo.listEmployeesPaged({
      filters: { search: "a", status: "ACTIVE" },
      limit: 50,
    });

    // "a" matches Ahmed (Ben Ali) and Yacine (Merbah) — not Sara (INACTIVE).
    expect(result.items.map((e) => e.firstName).sort()).toEqual(["Ahmed", "Yacine"]);
    expect(result.total).toBe(2);
  });

  it("combines search with the roleId filter", () => {
    const now = "2026-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 0, ?, ?)`,
    ).run("role-other", "other", "Other", now, now);
    repo.createEmployee({
      firstName: "Other",
      lastName: "Person",
      phone: "0888000001",
      roleId: "role-other",
      status: "ACTIVE",
    });

    const result = repo.listEmployeesPaged({
      filters: { search: "a", roleId: "role-worker" },
      limit: 50,
    });

    // "a" matches Ahmed, Sara, Yacine — all role-worker; the role-other row
    // (also matches "a") must be excluded by the roleId filter.
    expect(result.items.map((e) => e.firstName).sort()).toEqual(["Ahmed", "Sara", "Yacine"]);
    expect(result.total).toBe(3);
  });

  it("matches the displayed role label (regression: old local search matched row.role)", () => {
    const now = "2026-01-01T00:00:00.000Z";
    db.prepare(
      `INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 0, ?, ?)`,
    ).run("role-manager", "manager", "Manager", now, now);
    repo.createEmployee({
      firstName: "Boss",
      lastName: "Person",
      phone: "0777000001",
      roleId: "role-manager",
      status: "ACTIVE",
    });

    const byRoleLabel = repo.listEmployees({ search: "Manager" });
    expect(byRoleLabel.map((e) => e.firstName)).toEqual(["Boss"]);

    const paged = repo.listEmployeesPaged({
      filters: { search: "manager" },
      limit: 50,
    });
    // Case-insensitive role label: only the Manager-role employee matches
    // ("Boss"/"Person" do NOT contain "Manager", so the role-name EXISTS
    // clause is what discriminates here).
    expect(paged.items.map((e) => e.firstName)).toEqual(["Boss"]);
    expect(paged.total).toBe(1);
  });

  it("returns the unfiltered list for an empty search", () => {
    expect(repo.listEmployees({ search: "" })).toHaveLength(3);
    expect(repo.listEmployees({ search: "   " })).toHaveLength(3);
    expect(
      repo.listEmployeesPaged({ filters: { search: "" }, limit: 50 }).total,
    ).toBe(3);
  });

  it("counts employees with the same filter semantics as listEmployees", () => {
    // No filter: every row regardless of status.
    expect(repo.countEmployees()).toBe(3);
    // The seat check only cares about ACTIVE rows.
    expect(repo.countEmployees({ status: "ACTIVE" })).toBe(2);
    expect(repo.countEmployees({ status: "INACTIVE" })).toBe(1);
    expect(repo.countEmployees({ status: "LEFT" })).toBe(0);
    // Search/role filters mirror the list query.
    expect(repo.countEmployees({ search: "ben" })).toBe(1);
    expect(repo.countEmployees({ search: "a", status: "ACTIVE" })).toBe(2);
    expect(repo.countEmployees({ roleId: "missing-role" })).toBe(0);
    expect(repo.countEmployees({ search: "%" })).toBe(0);
  });
});

describe("SqliteCompanyRepository sync-writer lock guard (issue #322)", () => {
  let db: Database.Database;
  let lock: ReturnType<typeof createFifoLock>;
  let repo: SqliteCompanyRepository;

  beforeEach(() => {
    db = createTestDb();
    lock = createFifoLock();
    repo = new SqliteCompanyRepository(db, lock);
  });

  afterEach(() => {
    db.close();
  });

  it("runs sync writes normally when the connection lock is free", () => {
    const employee = repo.createEmployee({
      firstName: "Ahmed",
      lastName: "Ben Ali",
      phone: "0555123456",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    expect(repo.getEmployeeById(employee.id)?.firstName).toBe("Ahmed");
  });

  it("refuses to run a sync writer while another flow holds the connection open", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    // A foreign async flow holds the connection open across a real await
    // (the account bcrypt window). A sync writer must NOT silently join it
    // as a SAVEPOINT — it would be rolled back with the outer transaction.
    const holder = lock.run(async () => {
      await gate;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(() =>
      repo.createEmployee({
        firstName: "Should",
        lastName: "Throw",
        phone: "0666123456",
        roleId: "role-worker",
        status: "ACTIVE",
      }),
    ).toThrow(FifoLockBusyError);

    // The rejected writer must not have performed ANY write — a busy throw
    // followed by a partial absorb would be the worst of both worlds.
    const count = (
      db.prepare(`SELECT COUNT(*) AS n FROM "employee"`).get() as { n: number }
    ).n;
    expect(count).toBe(0);

    release();
    await holder;

    // Once the connection is free, the same write succeeds.
    const employee = repo.createEmployee({
      firstName: "Now",
      lastName: "Works",
      phone: "0666123456",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    expect(repo.getEmployeeById(employee.id)?.firstName).toBe("Now");
  });

  it("still nests sync writes inside withTransaction (SAVEPOINT join)", () => {
    // Nested writes inside the repository's own synchronous transaction
    // remain SAVEPOINTs (better-sqlite3) and must keep working.
    const employeeId = repo.withTransaction(() => {
      const employee = repo.createEmployee({
        firstName: "Nested",
        lastName: "Write",
        phone: "0777123456",
        roleId: "role-worker",
        status: "ACTIVE",
      });
      repo.updateEmployee({ id: employee.id, firstName: "Nested-Updated" });
      return employee.id;
    });
    expect(repo.getEmployeeById(employeeId)?.firstName).toBe("Nested-Updated");
  });
});

describe("SqliteCompanyRepository salary payment splits (issue #412)", () => {
  let db: Database.Database;
  let repo: SqliteCompanyRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new SqliteCompanyRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function seedPaidWorkerAndProject(): { workerId: string; projectId: string } {
    const manager = repo.createEmployee({
      firstName: "Manager",
      lastName: "Salary",
      phone: "0555000001",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const worker = repo.createEmployee({
      firstName: "Worker",
      lastName: "Salary",
      phone: "0555000002",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    const project = repo.createProject({
      name: "Project Salary",
      status: "ACTIVE",
      managerId: manager.id,
    });
    return { workerId: worker.id, projectId: project.id };
  }

  it("round-trips a saved project split through the sqlite insert and read paths", () => {
    const { workerId, projectId } = seedPaidWorkerAndProject();

    const created = repo.createSalaryPayment({
      employeeId: workerId,
      periodType: "MONTHLY",
      days: 30,
      expectedAmountDzd: 30000,
      actualAmountDzd: 30000,
      paymentDate: "2026-03-31T00:00:00.000Z",
      note: null,
      projectSplits: [{ projectId, days: 12 }],
    });

    expect(created.projectSplits).toEqual([{ projectId, days: 12 }]);
    const [listed] = repo.listSalaryPayments({ employeeId: workerId });
    expect(listed?.projectSplits).toEqual([{ projectId, days: 12 }]);
    // The persisted row, not just the mapper's in-memory view.
    expect(
      db.prepare(`SELECT project_id AS projectId, days FROM "employee_salary_payment_split"`).all(),
    ).toEqual([{ projectId, days: 12 }]);
  });

  it("still reads every payment and split when the window exceeds SQLite's bound-variable limit", () => {
    const { workerId, projectId } = seedPaidWorkerAndProject();
    // Bind one parameter per payment and this read dies at the limit; the join
    // reads the same rows with a fixed parameter count.
    const limitRow = db
      .prepare(
        "SELECT compile_options AS option FROM pragma_compile_options WHERE compile_options LIKE 'MAX_VARIABLE_NUMBER=%'",
      )
      .get() as { option: string } | undefined;
    const variableLimit = limitRow ? Number(limitRow.option.split("=")[1]) : 999;
    const paymentCount = variableLimit + 2;

    const insertPayment = db.prepare(
      `INSERT INTO "employee_salary_payment"
         (id, employee_id, period_type, days, expected_amount_dzd, actual_amount_dzd,
          payment_date, note, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, ?, 'MONTHLY', 30, 30000, 30000, ?, NULL, NULL, NULL, NULL, ?, ?)`,
    );
    const insertSplit = db.prepare(
      `INSERT INTO "employee_salary_payment_split" (id, payment_id, project_id, days, created_at)
       VALUES (?, ?, ?, 1, ?)`,
    );
    const ts = "2026-03-31T00:00:00.000Z";
    db.exec("BEGIN");
    try {
      for (let index = 0; index < paymentCount; index += 1) {
        const paymentId = `salary-payment-${index}`;
        insertPayment.run(paymentId, workerId, ts, ts, ts);
        if (index === 0) {
          insertSplit.run(`salary-split-${index}`, paymentId, projectId, ts);
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const payments = repo.listSalaryPayments({ employeeId: workerId });
    expect(payments).toHaveLength(paymentCount);
    expect(payments.find((payment) => payment.id === "salary-payment-0")?.projectSplits).toEqual([
      { projectId, days: 1 },
    ]);
    expect(
      payments.find((payment) => payment.id === `salary-payment-${paymentCount - 1}`)?.projectSplits,
    ).toEqual([]);
  });
});
