import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { createDatabaseConnection } from "../../../infrastructure/database/factory";
import { createFifoLock } from "../../../infrastructure/database/fifo-lock";
import { schemaStatements } from "../../../infrastructure/database/schema-definitions";
import { exactDebtSchemaStatements } from "../../company/adapters/exact-finance-schema";
import { SqliteExactFinanceRepository } from "../../company/adapters/sqlite-exact-finance.repository";
import { ExactFinanceService } from "../../company/exact-finance.service";
import { SqliteProjectCostRepository } from "../../project-cost/adapters/sqlite-project-cost.repository";
import { SqliteEmployeeEarningRepository } from "../adapters/sqlite-employee-earning.repository";
import { payrollCashSchemaStatements } from "../adapters/payroll-cash-schema";
import { SqlitePayrollCashRepository } from "../adapters/sqlite-payroll-cash.repository";
import { SqlitePayrollSourceRepository } from "../adapters/sqlite-payroll-source.repository";
import { PayrollService } from "../payroll.service";

export const now = "2026-11-19T10:00:00.000Z";
export const paidAt = "2026-11-18T09:00:00.000Z";
export const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0)) close(); });

/** Real current earning/segment identities with an isolated exact finance ledger. */
export function payrollFixture(key: string) {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-558-offset-")), "payroll.sqlite");
  const db = createDatabaseConnection(path, key);
  cleanup.push(() => { if (db.open) db.close(); });
  for (const table of ["user", "role", "employee", "project", "employee_earning", "employee_earning_segment"]) {
    const ddl = schemaStatements.find(sql => sql.startsWith(`CREATE TABLE IF NOT EXISTS "${table}" (`));
    if (!ddl) throw new Error(`Missing current table ${table}`);
    db.exec(ddl);
  }
  db.exec("CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY)");
  for (const sql of [...exactDebtSchemaStatements, ...payrollCashSchemaStatements]) db.exec(sql);
  const roleId = randomUUID();
  db.prepare("INSERT INTO role(id,key,name,created_at,updated_at) VALUES (?,?,?,?,?)").run(roleId, "worker", "Worker", now, now);
  function employee() {
    const id = randomUUID();
    db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,salary_reference_period,salary_reference_amount,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE','MONTHLY','30000.00',?,?)").run(id, "Worker", "Name", id, roleId, now, now);
    return id;
  }
  const employeeId = employee(); const projectId = randomUUID();
  db.prepare("INSERT INTO project(id,name,status,created_at,updated_at) VALUES (?,?,'ACTIVE',?,?)").run(projectId, "Project", now, now);
  const lock = createFifoLock();
  const financeRepository = new SqliteExactFinanceRepository(db, lock);
  const finance = new ExactFinanceService(financeRepository, { id: randomUUID, now: () => now });
  const cash = new SqlitePayrollCashRepository(db, lock);
  const sources = new SqlitePayrollSourceRepository(db, lock, financeRepository);
  const service = new PayrollService(finance, cash, sources, { id: randomUUID, now: () => now });
  const earnings = new SqliteEmployeeEarningRepository(db, lock);
  const audit = { actorUserId: randomUUID(), actorLabel: "Operator", transactionId: randomUUID() };
  function earning(total = "35000.00", workerId = employeeId) {
    return earnings.create({ requestId: randomUUID(), employeeId: workerId, currencyCode: "DZD", periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z", totalAmount: total, unallocatedAmount: "0.00", referenceSalary: { period: "MONTHLY", amount: "30000.00" }, segments: [{ id: randomUUID(), projectId, days: 30, amount: total }] }, "approved-intent", now, audit);
  }
  const cost = () => new SqliteProjectCostRepository(db).listProjectSalarySplits(projectId).map(row => row.amount);
  return { db, path, lock, financeRepository, finance, cash, sources, service, audit, employeeId, employee, earning, earnings, cost };
}
