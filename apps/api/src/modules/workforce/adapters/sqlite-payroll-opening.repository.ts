import { Money } from "@tuari/contracts";
import { bindMoney, prepareMoneyRead } from "../../../infrastructure/database/exact-money-storage";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { PayrollOpeningReview, PayrollOpeningReviewProvider } from "../payroll-lifecycle";
import type { PayrollAudit } from "../payroll.service";
import { assertPreparedPayrollSchema } from "./payroll-schema-integrity";
import { payrollOpeningReconciliationSchemaStatements } from "./payroll-opening-reconciliation-schema";
import type { OpeningProposal, OpeningRefund, OpeningResolution } from "../payroll-opening-reconciliation";

export const payrollOpeningSchemaStatements: readonly string[] = [
  `CREATE TABLE employee_opening_review (
    employee_id TEXT PRIMARY KEY NOT NULL REFERENCES employee(id) ON DELETE RESTRICT,
    wages_minor INTEGER NOT NULL CHECK(typeof(wages_minor)='integer' AND wages_minor BETWEEN 0 AND 9223372036854775807),
    advances_minor INTEGER NOT NULL CHECK(typeof(advances_minor)='integer' AND advances_minor BETWEEN 0 AND 9223372036854775807),
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
      AND (e.correction_of_entry_id=s.debt_entry_id OR (e.id=s.debt_entry_id AND e.correction_of_entry_id IS NULL AND NEW.old_minor=0))
      AND e.target_entry_id IS NULL AND e.status='LIVE'
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
  ...payrollOpeningReconciliationSchemaStatements,
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
    return (this.db.prepare("SELECT (SELECT count(*) FROM employee_opening_review WHERE employee_id=?) + (SELECT count(*) FROM employee_opening_source WHERE employee_id=?) + (SELECT count(*) FROM employee_opening_correction c JOIN employee_opening_source s ON s.source_id=c.source_id WHERE s.employee_id=?) + (SELECT count(*) FROM employee_opening_refund f JOIN employee_opening_proposal p ON p.id=f.proposal_id JOIN employee_opening_source s ON s.source_id=p.source_id WHERE s.employee_id=?) AS count").get(employeeId, employeeId, employeeId, employeeId) as { count: number }).count;
  }
  getReview(employeeId: string): PayrollOpeningReview | null {
    return this.withTransaction(() => {
      if (!this.db.prepare("SELECT 1 FROM employee_opening_review WHERE employee_id=?").get(employeeId)) return null;
      const rows = this.db.prepare("SELECT source_id AS sourceId,employee_id AS employeeId,kind,currency,debt_account_id AS debtAccountId,debt_entry_id AS debtEntryId FROM employee_opening_source WHERE employee_id=? ORDER BY kind").all(employeeId) as Omit<PayrollOpeningReview["sources"][number], "amount">[];
      if (rows.length > 2) throw new Error("Invalid opening source count");
      return { employeeId, state: "REVIEWED", sources: rows.map(row => {
        const amount = prepareMoneyRead(this.db, "SELECT amount_minor AS minor_units FROM employee_opening_source WHERE source_id=?").get(row.sourceId);
        if (!amount) throw new Error("Opening source amount missing");
        const corrections = this.db.prepare("SELECT id FROM employee_opening_correction WHERE source_id=? ORDER BY sequence LIMIT 10001").all(row.sourceId) as { id: string }[];
        if (corrections.length > 10000) throw new RangeError("Opening correction limit exceeded");
        const audit = this.getReviewAudit(employeeId);
        const initial = row.kind === "WAGE" ? audit?.wages : audit?.advances;
        if (!initial || (initial === "0.00" ? !corrections.some(event => event.id === row.debtEntryId) : initial !== amount.toWire())) throw new Error("Opening original review attribution mismatch");
        this.assertSourceMovements({ ...row, amount: amount.toWire() });
        return { ...row, amount: amount.toWire(), correctionIds: corrections.map(event => event.id), refunds: this.listRefunds(employeeId).filter(refund => refund.sourceId === row.sourceId).map(refund => ({ id: refund.id, amount: refund.amount })) };
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
    const count = this.db.prepare("SELECT count(*) AS count FROM employee_opening_correction c JOIN employee_opening_source s ON s.source_id=c.source_id WHERE s.employee_id=(SELECT employee_id FROM employee_opening_source WHERE source_id=?)").get(event.sourceId) as { count: number };
    if (count.count >= 10000) throw new RangeError("Opening correction history limit exceeded");
    this.db.prepare("INSERT INTO employee_opening_correction(id,source_id,old_minor,new_minor,actor_user_id,actor_label,transaction_id,created_at,reason) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(event.id, event.sourceId, bindMoney(Money.parse(event.oldAmount)), bindMoney(Money.parse(event.newAmount)), event.actorUserId, event.actorLabel, event.transactionId, event.createdAt, event.reason);
  }
  listProposals(employeeId: string): OpeningProposal[] {
    const rows = this.db.prepare(`SELECT p.id,p.source_id AS sourceId,s.employee_id AS employeeId,s.kind,
      p.reason,p.actor_user_id AS actorUserId,p.actor_label AS actorLabel,p.transaction_id AS transactionId,p.created_at AS createdAt
      FROM employee_opening_proposal p JOIN employee_opening_source s ON s.source_id=p.source_id
      WHERE s.employee_id=? ORDER BY p.rowid LIMIT 1001`).all(employeeId) as Omit<OpeningProposal, "oldAmount" | "newAmount" | "requiredRefund" | "status" | "resolution">[];
    if (rows.length > 1000) throw new RangeError("Opening proposal limit exceeded");
    return rows.map(row => {
      const resolution = this.db.prepare("SELECT id,status,refund_entry_id AS refundEntryId,correction_entry_id AS correctionEntryId,reason,actor_user_id AS actorUserId,actor_label AS actorLabel,transaction_id AS transactionId,created_at AS createdAt FROM employee_opening_resolution WHERE proposal_id=?").get(row.id) as OpeningResolution | undefined;
      const money = (column: "old_minor" | "new_minor" | "required_refund_minor") => prepareMoneyRead(this.db, `SELECT ${column} AS minor_units FROM employee_opening_proposal WHERE id=?`).get(row.id)!.toWire();
      return { ...row, oldAmount: money("old_minor"), newAmount: money("new_minor"), requiredRefund: money("required_refund_minor"), status: resolution?.status ?? "PENDING", resolution: resolution ?? null };
    });
  }
  saveProposal(row: OpeningProposal): void {
    if (this.listProposals(row.employeeId).length >= 1000) throw new RangeError("Opening proposal limit exceeded");
    this.db.prepare("INSERT INTO employee_opening_proposal(id,source_id,old_minor,new_minor,required_refund_minor,reason,actor_user_id,actor_label,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(row.id, row.sourceId, bindMoney(Money.parse(row.oldAmount)), bindMoney(Money.parse(row.newAmount)), bindMoney(Money.parse(row.requiredRefund)), row.reason, row.actorUserId, row.actorLabel, row.transactionId, row.createdAt);
  }
  listRefunds(employeeId: string): OpeningRefund[] {
    const rows = this.db.prepare(`SELECT f.id,f.proposal_id AS proposalId,p.source_id AS sourceId,s.employee_id AS employeeId,s.kind,
      s.debt_account_id AS debtAccountId,s.debt_entry_id AS debtEntryId,f.direction,f.refund_date AS refundDate,
      f.actor_user_id AS actorUserId,f.actor_label AS actorLabel,f.transaction_id AS transactionId,f.created_at AS createdAt
      FROM employee_opening_refund f JOIN employee_opening_proposal p ON p.id=f.proposal_id
      JOIN employee_opening_source s ON s.source_id=p.source_id WHERE s.employee_id=? ORDER BY f.rowid LIMIT 1001`).all(employeeId) as Omit<OpeningRefund, "amount">[];
    if (rows.length > 1000) throw new RangeError("Opening refund limit exceeded");
    return rows.map(row => ({ ...row, amount: prepareMoneyRead(this.db, "SELECT amount_minor AS minor_units FROM employee_opening_refund WHERE id=?").get(row.id)!.toWire() }));
  }
  saveRefund(row: OpeningRefund): void {
    this.db.prepare("INSERT INTO employee_opening_refund(id,proposal_id,amount_minor,direction,refund_date,actor_user_id,actor_label,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(row.id, row.proposalId, bindMoney(Money.parse(row.amount)), row.direction, row.refundDate, row.actorUserId, row.actorLabel, row.transactionId, row.createdAt);
  }
  saveResolution(proposalId: string, row: OpeningResolution): void {
    this.db.prepare("INSERT INTO employee_opening_resolution(id,proposal_id,status,refund_entry_id,correction_entry_id,reason,actor_user_id,actor_label,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(row.id, proposalId, row.status, row.refundEntryId, row.correctionEntryId, row.reason, row.actorUserId, row.actorLabel, row.transactionId, row.createdAt);
  }
  latestCashDate(source: PayrollOpeningReview["sources"][number]): string | null {
    const sql = source.kind === "WAGE"
      ? "SELECT MAX(c.payment_date) AS latest FROM employee_salary_payment_allocation a JOIN employee_salary_cash c ON c.id=a.cash_id WHERE a.source_kind='OPENING' AND a.source_id=? AND c.employee_id=?"
      : "SELECT MAX(payment_date) AS latest FROM employee_salary_settlement WHERE source_kind='OPENING_ADVANCE' AND source_id=? AND employee_id=?";
    return (this.db.prepare(sql).get(source.sourceId, source.employeeId) as { latest: string | null }).latest;
  }
  assertSourceMovements(source: PayrollOpeningReview["sources"][number]): void {
    const receipt = source.kind === "WAGE"
      ? `EXISTS(SELECT 1 FROM employee_salary_payment_allocation a JOIN employee_salary_cash c ON c.id=a.cash_id
          WHERE a.payment_entry_id=e.id AND a.source_kind='OPENING' AND a.source_id=? AND c.employee_id=?
          AND a.debt_entry_id=e.target_entry_id AND a.debt_account_id=e.debt_account_id AND c.currency=e.currency
          AND e.signed_amount_minor=-a.amount_minor)`
      : `EXISTS(SELECT 1 FROM employee_salary_settlement a WHERE a.payment_entry_id=e.id
          AND a.source_kind='OPENING_ADVANCE' AND a.source_id=? AND a.employee_id=?
          AND a.debt_entry_id=e.target_entry_id AND a.debt_account_id=e.debt_account_id
          AND a.currency=e.currency AND e.signed_amount_minor=-a.amount_minor)`;
    const invalid = this.db.prepare(`SELECT 1 FROM debt_entry e WHERE e.target_entry_id=? AND (
      e.status IS NOT 'LIVE' OR e.correction_of_entry_id IS NOT NULL OR e.payment_method IS NOT 'CASH'
      OR e.producer_type IS NOT 'PAYROLL_OPENING' OR e.producer_id IS NOT ? OR e.currency IS NOT 'DZD'
      OR (e.entry_type='PAYMENT' AND NOT ${receipt})
      OR (e.entry_type='ADJUSTMENT' AND NOT EXISTS(SELECT 1 FROM employee_opening_refund f JOIN employee_opening_proposal p ON p.id=f.proposal_id
        JOIN employee_opening_resolution r ON r.proposal_id=p.id AND r.status='APPLIED' AND r.refund_entry_id=f.id
        WHERE f.id=e.id AND p.source_id=? AND f.amount_minor=e.signed_amount_minor))
      OR e.entry_type NOT IN ('PAYMENT','ADJUSTMENT')) LIMIT 1`)
      .get(source.debtEntryId, source.sourceId, source.sourceId, source.employeeId, source.sourceId);
    if (invalid) throw new Error("Opening settlement is missing immutable cash provenance");
  }
  getReviewAudit(employeeId: string) {
    const row = this.db.prepare("SELECT actor_user_id AS actorUserId,actor_label AS actorLabel,transaction_id AS transactionId,created_at AS createdAt FROM employee_opening_review WHERE employee_id=?").get(employeeId) as ({ createdAt: string } & PayrollAudit) | undefined;
    if (!row) return null;
    return { ...row,
      wages: prepareMoneyRead(this.db, "SELECT wages_minor AS minor_units FROM employee_opening_review WHERE employee_id=?").get(employeeId)!.toWire(),
      advances: prepareMoneyRead(this.db, "SELECT advances_minor AS minor_units FROM employee_opening_review WHERE employee_id=?").get(employeeId)!.toWire(),
    };
  }
  save(review: PayrollOpeningReview, audit: PayrollAudit, createdAt: string): void {
    const amount = (kind: "WAGE" | "ADVANCE") => bindMoney(Money.parse(review.sources.find(source => source.kind === kind)?.amount ?? "0.00"));
    this.db.prepare("INSERT INTO employee_opening_review(employee_id,wages_minor,advances_minor,actor_user_id,actor_label,transaction_id,created_at) VALUES (?,?,?,?,?,?,?)").run(review.employeeId, amount("WAGE"), amount("ADVANCE"), audit.actorUserId, audit.actorLabel, audit.transactionId, createdAt);
    for (const row of review.sources) this.saveSource(row);
  }
  saveSource(row: PayrollOpeningReview["sources"][number]): void {
    this.db.prepare("INSERT INTO employee_opening_source(source_id,employee_id,kind,currency,amount_minor,debt_account_id,debt_entry_id) VALUES (?,?,?,?,?,?,?)").run(row.sourceId, row.employeeId, row.kind, row.currency, bindMoney(Money.parse(row.amount)), row.debtAccountId, row.debtEntryId);
  }
}
