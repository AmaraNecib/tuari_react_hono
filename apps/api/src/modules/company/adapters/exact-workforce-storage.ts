import {
  Money, UnitPrice, SalaryReference,
  exactEmployeeSchema, exactEmployeeStateHistorySchema,
  type ExactEmployee, type ExactEmployeeStateHistory,
} from "@tuari/contracts";
import { bindMoney, bindUnitPrice, prepareMoneyRead, prepareUnitPriceRead } from "../../../infrastructure/database/exact-money-storage";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";

type Reference = { period: "DAILY" | "MONTHLY" | "WEEKLY"; amount: string };
type ReferenceTable = "employee" | "employee_state_history";

/** Reference units retain their period tag; this codec never posts earnings. */
export function bindExactSalaryReference(reference: Reference | null): { units: bigint | null; period: Reference["period"] | null; currency: "DZD" } {
  if (reference === null) return { units: null, period: null, currency: "DZD" };
  const parsed = SalaryReference.parse(reference.period, reference.amount).toWire();
  return {
    units: parsed.period === "DAILY" ? bindUnitPrice(UnitPrice.parse(parsed.amount)) : bindMoney(Money.parse(parsed.amount)),
    period: parsed.period,
    currency: "DZD",
  };
}

/** Isolated monetary projections leave integer counters and timestamps in ordinary mode. */
function readSalaryReference(db: BetterSqliteDatabase, table: ReferenceTable, id: string): Reference | null | undefined {
  if (table !== "employee" && table !== "employee_state_history") throw new TypeError("Unknown workforce reference table");
  const metadata = db.prepare(`SELECT salary_period AS period,salary_currency AS currency FROM "${table}" WHERE id=?`).get(id) as { period: unknown; currency: unknown } | undefined;
  if (!metadata) return undefined;
  if (metadata.currency !== "DZD") throw new TypeError("Salary currency mismatch");
  const daily = metadata.period === "DAILY";
  const amount = daily
    ? prepareUnitPriceRead(db, `SELECT salary_reference_units AS scaled_units FROM "${table}" WHERE id=?`).get(id)
    : prepareMoneyRead(db, `SELECT salary_reference_units AS minor_units FROM "${table}" WHERE id=?`).get(id);
  if (metadata.period === null && amount === null) return null;
  if (!amount || (metadata.period !== "DAILY" && metadata.period !== "MONTHLY" && metadata.period !== "WEEKLY")) throw new TypeError("Salary reference requires matching amount and period");
  return SalaryReference.parse(metadata.period, amount.toWire()).toWire();
}

/** Reads metadata separately so a scoped exact read cannot turn unrelated fields into BigInt. */
function readEmployee(db: BetterSqliteDatabase, id: string): ExactEmployee | undefined {
  const row = db.prepare(`SELECT id,first_name AS firstName,last_name AS lastName,phone,role_id AS roleId,status,
    notes,occupation,created_at AS createdAt,updated_at AS updatedAt,salary_currency AS currency
    FROM employee WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return exactEmployeeSchema.parse({ ...row, salaryReference: readSalaryReference(db, "employee", id) });
}

/** Reads a list with a fixed number of exact-money queries inside the caller's snapshot. */
export function readExactEmployeesInSnapshot(db: BetterSqliteDatabase, ids: readonly string[]): ExactEmployee[] {
  if (ids.length === 0) return [];
  const selected = "WITH selected AS MATERIALIZED (SELECT value AS id FROM json_each(?)) ";
  const selectedIds = JSON.stringify(ids);
  const rows = db.prepare(`${selected}SELECT e.id,e.first_name AS firstName,e.last_name AS lastName,e.phone,e.role_id AS roleId,e.status,
    e.notes,e.occupation,e.created_at AS createdAt,e.updated_at AS updatedAt,e.salary_period AS period,e.salary_currency AS currency
    FROM employee e WHERE e.id IN (SELECT id FROM selected) ORDER BY e.id`).all(selectedIds) as (Record<string, unknown> & { id: string; period: unknown; currency: unknown })[];
  const dailyRows = rows.filter(row => row.period === "DAILY");
  const dailyAmounts = dailyRows.length
    ? prepareUnitPriceRead(db, `${selected}SELECT salary_reference_units AS scaled_units FROM employee WHERE id IN (SELECT id FROM selected) AND salary_period='DAILY' ORDER BY id`).all(selectedIds)
    : [];
  const moneyRows = rows.filter(row => row.period !== "DAILY");
  const moneyAmounts = moneyRows.length
    ? prepareMoneyRead(db, `${selected}SELECT salary_reference_units AS minor_units FROM employee WHERE id IN (SELECT id FROM selected) AND (salary_period IS NULL OR salary_period IN ('MONTHLY','WEEKLY')) ORDER BY id`).all(selectedIds)
    : [];
  if (dailyRows.length !== dailyAmounts.length || moneyRows.length !== moneyAmounts.length) throw new TypeError("Salary reference list read mismatch");
  const amounts = new Map<string, string | null>();
  dailyRows.forEach((row, index) => amounts.set(row.id, dailyAmounts[index]?.toWire() ?? null));
  moneyRows.forEach((row, index) => amounts.set(row.id, moneyAmounts[index]?.toWire() ?? null));
  const employees = new Map(rows.map(row => {
    const { period, ...employee } = row;
    if (row.currency !== "DZD") throw new TypeError("Salary currency mismatch");
    const amount = amounts.get(row.id);
    let salaryReference: Reference | null;
    if (period === null && amount === null) salaryReference = null;
    else if ((period === "DAILY" || period === "MONTHLY" || period === "WEEKLY") && amount !== null && amount !== undefined) salaryReference = SalaryReference.parse(period, amount).toWire();
    else throw new TypeError("Salary reference requires matching amount and period");
    return [row.id, exactEmployeeSchema.parse({ ...employee, salaryReference })] as const;
  }));
  return ids.flatMap(id => {
    const employee = employees.get(id);
    return employee ? [employee] : [];
  });
}

function readEmployeeHistory(db: BetterSqliteDatabase, employeeId: string): ExactEmployeeStateHistory[] {
  const rows = db.prepare(`SELECT id,employee_id AS employeeId,role_id AS roleId,status,event_type AS eventType,
    start_date AS startDate,end_date AS endDate,notes,actor_user_id AS actorUserId,transaction_id AS transactionId,
    created_at AS createdAt,updated_at AS updatedAt,salary_currency AS currency
    FROM employee_state_history WHERE employee_id=? ORDER BY start_date,id`).all(employeeId) as (Record<string, unknown> & { id: string })[];
  return rows.map(row => exactEmployeeStateHistorySchema.parse({ ...row, salaryReference: readSalaryReference(db, "employee_state_history", row.id) }));
}

function snapshot<T>(db: BetterSqliteDatabase, lock: FifoLock, work: () => T): T {
  return lock.runSync(() => db.transaction(work).immediate());
}

/** The connection's shared FIFO is mandatory; metadata and money share one snapshot. */
export function readExactSalaryReference(db: BetterSqliteDatabase, table: ReferenceTable, id: string, lock: FifoLock): Reference | null | undefined {
  return snapshot(db, lock, () => readSalaryReference(db, table, id));
}
export function readExactEmployee(db: BetterSqliteDatabase, id: string, lock: FifoLock): ExactEmployee | undefined {
  return snapshot(db, lock, () => readEmployee(db, id));
}
export function readExactEmployeeHistory(db: BetterSqliteDatabase, employeeId: string, lock: FifoLock): ExactEmployeeStateHistory[] {
  return snapshot(db, lock, () => readEmployeeHistory(db, employeeId));
}
