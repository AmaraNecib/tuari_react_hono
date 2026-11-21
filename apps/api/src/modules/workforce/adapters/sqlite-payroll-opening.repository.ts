import { Money } from "@tuari/contracts";
import { bindMoney, prepareMoneyRead } from "../../../infrastructure/database/exact-money-storage";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { PayrollOpeningReview, PayrollOpeningReviewProvider } from "../payroll-lifecycle";
import type { PayrollAudit } from "../payroll.service";
import { assertPreparedPayrollSchema } from "./payroll-schema-integrity";

export const payrollOpeningSchemaStatements: readonly string[] = [
  `CREATE TABLE employee_opening_review (
    employee_id TEXT PRIMARY KEY NOT NULL REFERENCES employee(id) ON DELETE RESTRICT,
    actor_user_id TEXT, actor_label TEXT, transaction_id TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE employee_opening_source (
    source_id TEXT PRIMARY KEY NOT NULL, employee_id TEXT NOT NULL REFERENCES employee_opening_review(employee_id) ON DELETE RESTRICT,
    kind TEXT NOT NULL CHECK(kind IN ('WAGE','ADVANCE')), currency TEXT NOT NULL CHECK(currency='DZD'),
    amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 9223372036854775807),
    debt_account_id TEXT NOT NULL REFERENCES debt_account(id) ON DELETE RESTRICT,
    debt_entry_id TEXT NOT NULL UNIQUE REFERENCES debt_entry(id) ON DELETE RESTRICT, UNIQUE(employee_id,kind))`,
  `CREATE TRIGGER employee_opening_source_link BEFORE INSERT ON employee_opening_source
    WHEN NOT EXISTS(SELECT 1 FROM debt_entry e JOIN debt_account a ON a.id=e.debt_account_id
      WHERE e.id=NEW.debt_entry_id AND a.id=NEW.debt_account_id AND a.party_type='INTERNAL_WORKER'
      AND a.worker_id=NEW.employee_id AND a.direction=CASE NEW.kind WHEN 'WAGE' THEN 'PAYABLE' ELSE 'RECEIVABLE' END
      AND a.currency='DZD' AND e.currency='DZD' AND e.producer_type='PAYROLL_OPENING' AND e.producer_id=NEW.source_id
      AND e.status='LIVE' AND e.target_entry_id IS NULL AND e.correction_of_entry_id IS NULL
      AND e.entry_type='ADJUSTMENT' AND e.signed_amount_minor=NEW.amount_minor)
    BEGIN SELECT RAISE(ABORT,'Opening source ledger mismatch'); END`,
  `CREATE TABLE employee_opening_correction (
    sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE REFERENCES debt_entry(id) ON DELETE RESTRICT,
    source_id TEXT NOT NULL REFERENCES employee_opening_source(source_id) ON DELETE RESTRICT,
    old_minor INTEGER NOT NULL CHECK(typeof(old_minor)='integer' AND old_minor BETWEEN 0 AND 9223372036854775807),
    new_minor INTEGER NOT NULL CHECK(typeof(new_minor)='integer' AND new_minor BETWEEN 0 AND 9223372036854775807),
    actor_user_id TEXT, actor_label TEXT, transaction_id TEXT, created_at TEXT NOT NULL, reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000))`,
  `CREATE TRIGGER employee_opening_correction_link BEFORE INSERT ON employee_opening_correction
    WHEN NOT EXISTS(SELECT 1 FROM employee_opening_source s JOIN debt_entry e ON e.id=NEW.id
      WHERE s.source_id=NEW.source_id AND e.debt_account_id=s.debt_account_id AND e.currency='DZD'
      AND e.correction_of_entry_id=s.debt_entry_id AND e.target_entry_id IS NULL AND e.status='LIVE'
      AND e.producer_type='PAYROLL_OPENING' AND e.producer_id=s.source_id
      AND e.signed_amount_minor=NEW.new_minor-NEW.old_minor AND e.note=NEW.reason
      AND e.actor_user_id IS NEW.actor_user_id AND e.actor_label IS NEW.actor_label
      AND e.transaction_id IS NEW.transaction_id AND e.created_at=NEW.created_at)
    BEGIN SELECT RAISE(ABORT,'Opening correction ledger mismatch'); END`,
  ...["employee_opening_review", "employee_opening_source", "employee_opening_correction"].flatMap(table => [
    `CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Opening history is immutable'); END`,
    `CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Opening history is immutable'); END`,
    `CREATE TRIGGER ${table}_no_replace BEFORE INSERT ON ${table} WHEN EXISTS(SELECT 1 FROM ${table} WHERE ${table === "employee_opening_review" ? "employee_id=NEW.employee_id" : table === "employee_opening_correction" ? "id=NEW.id OR sequence=NEW.sequence" : "source_id=NEW.source_id OR (employee_id=NEW.employee_id AND kind=NEW.kind) OR debt_entry_id=NEW.debt_entry_id"}) BEGIN SELECT RAISE(ABORT,'Opening identity already exists'); END`,
  ]),
];

/** Immutable review facts only. Debt entries remain the sole balance authority. */
export class SqlitePayrollOpeningRepository implements PayrollOpeningReviewProvider {
  get transactionIdentity() { return { connection: this.db, lock: this.lock }; }
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock) {
    assertPreparedPayrollSchema(db, payrollOpeningSchemaStatements);
  }
  withTransaction<T>(work: () => T): T {
    if (work.constructor.name === "AsyncFunction") throw new TypeError("Opening transaction must be synchronous");
    return this.lock.runSync(() => this.db.transaction(() => {
      const result = work();
      if (result && typeof (result as { then?: unknown }).then === "function") throw new TypeError("Opening transaction must be synchronous");
      return result;
    }).immediate());
  }
  countRows(employeeId: string): number {
    return (this.db.prepare("SELECT (SELECT count(*) FROM employee_opening_review WHERE employee_id=?) + (SELECT count(*) FROM employee_opening_source WHERE employee_id=?) AS count").get(employeeId, employeeId) as { count: number }).count;
  }
  getReview(employeeId: string): PayrollOpeningReview | null {
    return this.withTransaction(() => {
      if (!this.db.prepare("SELECT 1 FROM employee_opening_review WHERE employee_id=?").get(employeeId)) return null;
      const rows = this.db.prepare("SELECT source_id AS sourceId,employee_id AS employeeId,kind,currency,debt_account_id AS debtAccountId,debt_entry_id AS debtEntryId FROM employee_opening_source WHERE employee_id=? ORDER BY kind").all(employeeId) as Omit<PayrollOpeningReview["sources"][number], "amount">[];
      if (rows.length > 2) throw new Error("Invalid opening source count");
      return { employeeId, state: "REVIEWED", sources: rows.map(row => {
        const amount = prepareMoneyRead(this.db, "SELECT amount_minor AS minor_units FROM employee_opening_source WHERE source_id=?").get(row.sourceId);
        if (!amount) throw new Error("Opening source amount missing");
        return { ...row, amount: amount.toWire() };
      }) };
    });
  }
  listCorrections(employeeId: string) {
    const rows = this.db.prepare(`SELECT c.id,c.source_id AS sourceId,s.kind,c.actor_user_id AS actorUserId,c.actor_label AS actorLabel,c.created_at AS createdAt,c.reason
      FROM employee_opening_correction c JOIN employee_opening_source s ON s.source_id=c.source_id
      WHERE s.employee_id=? ORDER BY c.sequence LIMIT 10001`).all(employeeId) as { id: string; sourceId: string; kind: "WAGE" | "ADVANCE"; actorUserId: string | null; actorLabel: string | null; createdAt: string; reason: string }[];
    if (rows.length > 10000) throw new RangeError("Opening correction history limit exceeded");
    return rows.map(row => ({ ...row,
      oldAmount: prepareMoneyRead(this.db, "SELECT old_minor AS minor_units FROM employee_opening_correction WHERE id=?").get(row.id)!.toWire(),
      newAmount: prepareMoneyRead(this.db, "SELECT new_minor AS minor_units FROM employee_opening_correction WHERE id=?").get(row.id)!.toWire(),
    }));
  }
  saveCorrection(event: { id: string; sourceId: string; oldAmount: string; newAmount: string; reason: string; createdAt: string } & PayrollAudit): void {
    this.db.prepare("INSERT INTO employee_opening_correction(id,source_id,old_minor,new_minor,actor_user_id,actor_label,transaction_id,created_at,reason) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(event.id, event.sourceId, bindMoney(Money.parse(event.oldAmount)), bindMoney(Money.parse(event.newAmount)), event.actorUserId, event.actorLabel, event.transactionId, event.createdAt, event.reason);
  }
  save(review: PayrollOpeningReview, audit: PayrollAudit, createdAt: string): void {
    this.db.prepare("INSERT INTO employee_opening_review(employee_id,actor_user_id,actor_label,transaction_id,created_at) VALUES (?,?,?,?,?)").run(review.employeeId, audit.actorUserId, audit.actorLabel, audit.transactionId, createdAt);
    for (const row of review.sources) this.db.prepare("INSERT INTO employee_opening_source(source_id,employee_id,kind,currency,amount_minor,debt_account_id,debt_entry_id) VALUES (?,?,?,?,?,?,?)").run(row.sourceId, row.employeeId, row.kind, row.currency, bindMoney(Money.parse(row.amount)), row.debtAccountId, row.debtEntryId);
  }
}
