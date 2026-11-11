import { Money, exactSalaryApprovalInputSchema } from "@tuari/contracts";
import { bindMoney, prepareMoneyRead } from "../../../infrastructure/database/exact-money-storage";
import { requireExactMoneySchema } from "../../../infrastructure/database/money-schema-gate";
import { exactFinanceJson } from "../exact-finance-json";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import { EXACT_WORKFORCE_READ_RECORD_LIMIT, type ExactSalaryEarning, type ExactWorkforceRepository } from "../workforce-exact.repository";
import { ExactDebtError } from "../exact-finance.service";

type Metadata = Pick<ExactSalaryEarning, "id" | "employeeId" | "currency" | "periodStart" | "periodEnd" | "debtAccountId" | "debtEntryId" | "actorUserId" | "actorLabel" | "transactionId" | "createdAt">;
const fields = {
  id: "id", employeeId: "employee_id", currency: "currency", periodStart: "period_start", periodEnd: "period_end",
  debtAccountId: "debt_account_id", debtEntryId: "debt_entry_id", actorUserId: "actor_user_id", actorLabel: "actor_label",
  transactionId: "transaction_id", createdAt: "created_at",
} as const;
const projection = Object.entries(fields).map(([key, column]) => `"${column}" AS "${key}"`).join(",");

/** Opt-in native source adapter. Production workforce composition remains numeric. */
export class SqliteExactWorkforceRepository implements ExactWorkforceRepository {
  get transactionIdentity() { return { connection: this.db, lock: this.lock }; }
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock) {
    this.withTransaction(() => {
      requireExactMoneySchema(db, "workforce");
      for (const [table, required] of [
        ["employee_salary_earning", { ...Object.fromEntries(Object.values(fields).map(name => [name, "TEXT"])), approved_amount_minor: "INTEGER", unallocated_amount_minor: "INTEGER" }],
        ["employee_salary_earning_segment", { earning_id: "TEXT", id: "TEXT", ordinal: "INTEGER", project_id: "TEXT", amount_minor: "INTEGER", days: "INTEGER" }],
      ] as const) {
        const schema = db.prepare("SELECT type FROM sqlite_master WHERE name=?").get(table) as { type: string } | undefined;
        if (schema?.type !== "table") throw new Error(`Exact workforce table required: ${table}`);
        const columns = db.pragma(`table_info(${table})`) as { name: string; type: string }[];
        for (const [name, type] of Object.entries(required)) {
          if (columns.find(column => column.name === name)?.type.toUpperCase() !== type) throw new Error(`Invalid exact workforce column ${table}.${name}`);
        }
      }
    });
  }

  withTransaction<T>(work: () => T): T {
    return this.lock.runSync(() => this.db.transaction(() => {
      const result = work();
      if (result && typeof (result as { then?: unknown }).then === "function") throw new TypeError("Payroll transaction must be synchronous");
      return result;
    }).immediate());
  }
  employeeExists(id: string): boolean {
    return this.withTransaction(() => Boolean(this.db.prepare("SELECT id FROM employee WHERE id=?").get(id)));
  }
  projectExists(id: string): boolean {
    return this.withTransaction(() => Boolean(this.db.prepare("SELECT id FROM project WHERE id=?").get(id)));
  }
  private amount(column: "approved_amount_minor" | "unallocated_amount_minor", id: string): string {
    const amount = prepareMoneyRead(this.db, `SELECT ${column} AS minor_units FROM employee_salary_earning WHERE id=?`).get(id);
    if (!amount) throw new TypeError("Required earning amount is missing");
    return amount.toWire();
  }
  getEarning(id: string): ExactSalaryEarning | null {
    return this.withTransaction(() => {
      const row = this.db.prepare(`SELECT ${projection} FROM employee_salary_earning WHERE id=?`).get(id) as Metadata | undefined;
      if (!row) return null;
      if (row.currency !== "DZD") throw new TypeError("Salary currency mismatch");
      const metadata = this.db.prepare("SELECT id,project_id AS projectId,days FROM employee_salary_earning_segment WHERE earning_id=? ORDER BY ordinal").all(id) as { id: string; projectId: string; days: number | null }[];
      const read = prepareMoneyRead(this.db, "SELECT amount_minor AS minor_units FROM employee_salary_earning_segment WHERE earning_id=? AND id=?");
      const segments = metadata.map(segment => {
        const amount = read.get(id, segment.id);
        if (!amount) throw new TypeError("Required segment amount is missing");
        return { id: segment.id, projectId: segment.projectId, amount: amount.toWire(), ...(segment.days === null ? {} : { days: segment.days }) };
      });
      const parsed = exactSalaryApprovalInputSchema.parse({
        requestId: id, employeeId: row.employeeId, currency: row.currency, periodStart: row.periodStart, periodEnd: row.periodEnd,
        approvedAmount: this.amount("approved_amount_minor", id), unallocatedAmount: this.amount("unallocated_amount_minor", id), segments,
      });
      const { requestId: _requestId, ...approved } = parsed;
      return { ...approved, ...row };
    });
  }
  private requireReadBudget(predicate: string, id: string): void {
    // Count only bounded metadata, including unrelated segments that source reconciliation will read.
    const row = this.db.prepare(`WITH selected AS MATERIALIZED (
      SELECT e.id FROM employee_salary_earning e WHERE ${predicate} LIMIT ?
    ) SELECT count(*) AS count FROM (
      SELECT id FROM selected UNION ALL
      SELECT s.id FROM selected e JOIN employee_salary_earning_segment s ON s.earning_id=e.id LIMIT ?
    )`).get(id, EXACT_WORKFORCE_READ_RECORD_LIMIT + 1, EXACT_WORKFORCE_READ_RECORD_LIMIT + 1) as { count: number };
    if (row.count > EXACT_WORKFORCE_READ_RECORD_LIMIT) throw new ExactDebtError("Payroll read resource limit exceeded");
  }
  listEarnings(employeeId: string): ExactSalaryEarning[] {
    return this.withTransaction(() => {
      this.requireReadBudget("e.employee_id=?", employeeId);
      const rows = this.db.prepare("SELECT id FROM employee_salary_earning WHERE employee_id=? ORDER BY created_at,id LIMIT ?").all(employeeId, EXACT_WORKFORCE_READ_RECORD_LIMIT) as { id: string }[];
      return rows.map(row => this.getEarning(row.id)!);
    });
  }
  listProjectEarnings(projectId: string): ExactSalaryEarning[] {
    return this.withTransaction(() => {
      const predicate = "EXISTS (SELECT 1 FROM employee_salary_earning_segment s WHERE s.earning_id=e.id AND s.project_id=?)";
      this.requireReadBudget(predicate, projectId);
      const rows = this.db.prepare(`SELECT id FROM employee_salary_earning e WHERE ${predicate} ORDER BY created_at,id LIMIT ?`).all(projectId, EXACT_WORKFORCE_READ_RECORD_LIMIT) as { id: string }[];
      return rows.map(row => this.getEarning(row.id)!);
    });
  }
  saveEarning(earning: ExactSalaryEarning): void {
    this.withTransaction(() => {
      const parsed = exactSalaryApprovalInputSchema.parse({
        requestId: earning.id, employeeId: earning.employeeId, currency: earning.currency, periodStart: earning.periodStart, periodEnd: earning.periodEnd,
        approvedAmount: earning.approvedAmount, unallocatedAmount: earning.unallocatedAmount, segments: earning.segments,
      });
      const { requestId: _requestId, ...approved } = parsed;
      const canonical = { ...earning, ...approved };
      const previous = this.getEarning(earning.id);
      if (previous) {
        if (exactFinanceJson(previous) !== exactFinanceJson(canonical)) throw new Error("Approved earning is immutable");
        return;
      }
      const columns = [...Object.values(fields), "approved_amount_minor", "unallocated_amount_minor"];
      const values = [...Object.keys(fields).map(key => canonical[key as keyof typeof fields]), bindMoney(Money.parse(canonical.approvedAmount)), bindMoney(Money.parse(canonical.unallocatedAmount))];
      this.db.prepare(`INSERT INTO employee_salary_earning(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...values);
      const insert = this.db.prepare("INSERT INTO employee_salary_earning_segment(earning_id,id,ordinal,project_id,amount_minor,days) VALUES (?,?,?,?,?,?)");
      canonical.segments.forEach((segment, ordinal) => insert.run(canonical.id, segment.id, ordinal, segment.projectId, bindMoney(Money.parse(segment.amount)), segment.days ?? null));
    });
  }
}
