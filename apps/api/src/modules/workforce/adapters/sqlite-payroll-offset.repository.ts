import { z } from "zod";
import { Money, auditActorUserIdSchema, auditTransactionIdSchema, timestampSchema } from "@tuari/contracts";
import { bindMoney, prepareMoneyRead } from "../../../infrastructure/database/exact-money-storage";
import { runSyncTransaction, type FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { PayrollOffsetRecord, PayrollOffsetRepository } from "../payroll-offset.repository";
import { SqlitePayrollCashRepository } from "./sqlite-payroll-cash.repository";
import { assertPreparedPayrollSchema } from "./payroll-schema-integrity";
import { payrollOffsetLink, payrollOffsetSchemaStatements } from "./payroll-offset-schema";

const id = z.string().min(1).max(128);
const leg = z.object({ debtAccountId: id, debtEntryId: id, settlementEntryId: id }).strict();
const recordSchema = z.object({ id, employeeId: id, currency: z.literal("DZD"), amount: z.string().max(96).superRefine((value, context) => {
  try { if (Money.parse(value).compare(Money.parse("0")) <= 0) throw new Error("Nonpositive offset"); }
  catch { context.addIssue({ code: "custom", message: "Offset must be positive bounded exact money" }); }
}), settlementDate: timestampSchema, actorUserId: auditActorUserIdSchema, actorLabel: z.string().max(1000).nullable(), transactionId: auditTransactionIdSchema, createdAt: timestampSchema,
  wageSource: z.object({ kind: z.enum(["EARNING", "OPENING"]), id }).strict(),
  advanceSource: z.object({ kind: z.enum(["ADVANCE", "OPENING_ADVANCE"]), id }).strict(), wage: leg, advance: leg }).strict();
type OffsetRow = Omit<PayrollOffsetRecord, "amount" | "wageSource" | "advanceSource" | "wage" | "advance"> & {
  wageSourceKind: "EARNING" | "OPENING"; wageSourceId: string; advanceSourceKind: "ADVANCE" | "OPENING_ADVANCE"; advanceSourceId: string;
  wageDebtAccountId: string; wageDebtEntryId: string; wageSettlementEntryId: string;
  advanceDebtAccountId: string; advanceDebtEntryId: string; advanceSettlementEntryId: string;
};
const projection = `id,employee_id AS employeeId,currency,settlement_date AS settlementDate,
  wage_source_kind AS wageSourceKind,wage_source_id AS wageSourceId,advance_source_kind AS advanceSourceKind,advance_source_id AS advanceSourceId,
  wage_debt_account_id AS wageDebtAccountId,wage_debt_entry_id AS wageDebtEntryId,wage_settlement_entry_id AS wageSettlementEntryId,
  advance_debt_account_id AS advanceDebtAccountId,advance_debt_entry_id AS advanceDebtEntryId,advance_settlement_entry_id AS advanceSettlementEntryId,
  actor_user_id AS actorUserId,actor_label AS actorLabel,transaction_id AS transactionId,created_at AS createdAt`;

export class SqlitePayrollOffsetRepository implements PayrollOffsetRepository {
  get transactionIdentity() { return { connection: this.db, lock: this.lock }; }
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock) {
    this.withTransaction(() => {
      new SqlitePayrollCashRepository(db, lock);
      assertPreparedPayrollSchema(db, payrollOffsetSchemaStatements);
    });
  }
  withTransaction<T>(work: () => T): T {
    if (work.constructor.name === "AsyncFunction") throw new TypeError("Payroll offset transaction callback must be synchronous");
    return runSyncTransaction(this.lock, this.db, () => {
      const result = work();
      if (result && typeof (result as { then?: unknown }).then === "function") throw new TypeError("Payroll offset transaction callback must be synchronous");
      return result;
    });
  }
  getOffset(offsetId: string): PayrollOffsetRecord | null {
    return this.withTransaction(() => {
      const row = this.db.prepare(`SELECT ${projection} FROM employee_salary_advance_offset WHERE id=?`).get(offsetId) as OffsetRow | undefined;
      if (!row) return null;
      if (this.db.prepare(`SELECT 1 FROM employee_salary_advance_offset candidate WHERE candidate.id=? AND NOT ${payrollOffsetLink}`).get(offsetId)) throw new TypeError("Payroll offset source link mismatch");
      const amount = prepareMoneyRead(this.db, "SELECT amount_minor AS minor_units FROM employee_salary_advance_offset WHERE id=?").get(offsetId);
      if (!amount) throw new TypeError("Required payroll offset amount is missing");
      const { wageSourceKind, wageSourceId, advanceSourceKind, advanceSourceId, wageDebtAccountId, wageDebtEntryId, wageSettlementEntryId, advanceDebtAccountId, advanceDebtEntryId, advanceSettlementEntryId, ...metadata } = row;
      const record: PayrollOffsetRecord = { ...metadata, amount: amount.toWire(), wageSource: { kind: wageSourceKind, id: wageSourceId }, advanceSource: { kind: advanceSourceKind, id: advanceSourceId },
        wage: { debtAccountId: wageDebtAccountId, debtEntryId: wageDebtEntryId, settlementEntryId: wageSettlementEntryId },
        advance: { debtAccountId: advanceDebtAccountId, debtEntryId: advanceDebtEntryId, settlementEntryId: advanceSettlementEntryId } };
      recordSchema.parse(record);
      return record;
    });
  }
  listOffsets(employeeId: string): PayrollOffsetRecord[] {
    return this.withTransaction(() => {
      const count = this.db.prepare("SELECT count(*) AS count FROM (SELECT id FROM employee_salary_advance_offset WHERE employee_id=? LIMIT 10001)").get(employeeId) as { count: number };
      if (count.count > 10000) throw new RangeError("Payroll offset materialization limit exceeded");
      return (this.db.prepare("SELECT id FROM employee_salary_advance_offset WHERE employee_id=? ORDER BY created_at,id").all(employeeId) as { id: string }[]).map(row => this.getOffset(row.id)!);
    });
  }
  saveOffset(record: PayrollOffsetRecord): void {
    recordSchema.parse(record);
    this.withTransaction(() => {
      this.db.prepare(`INSERT INTO employee_salary_advance_offset (
        id,employee_id,currency,amount_minor,settlement_date,wage_source_kind,wage_source_id,advance_source_kind,advance_source_id,
        wage_debt_account_id,wage_debt_entry_id,wage_settlement_entry_id,advance_debt_account_id,advance_debt_entry_id,advance_settlement_entry_id,
        actor_user_id,actor_label,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        record.id, record.employeeId, record.currency, bindMoney(Money.parse(record.amount)), record.settlementDate,
        record.wageSource.kind, record.wageSource.id, record.advanceSource.kind, record.advanceSource.id,
        record.wage.debtAccountId, record.wage.debtEntryId, record.wage.settlementEntryId,
        record.advance.debtAccountId, record.advance.debtEntryId, record.advance.settlementEntryId,
        record.actorUserId, record.actorLabel, record.transactionId, record.createdAt);
    });
  }
}
