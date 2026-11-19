import { Money } from "@tuari/contracts";
import { prepareMoneyRead } from "../../../infrastructure/database/exact-money-storage";
import { runSyncTransaction, type FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { ExactFinanceRepository } from "../../company/exact-finance.repository";
import type { PayrollAdvanceSource, PayrollEarningSource, PayrollSourceRepository } from "../payroll-source.repository";

export class SqlitePayrollSourceRepository implements PayrollSourceRepository {
  get transactionIdentity() { return { connection: this.db, lock: this.lock }; }
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock, private readonly finance: ExactFinanceRepository) {
    if (finance.transactionIdentity.connection !== db || finance.transactionIdentity.lock !== lock) throw new TypeError("Payroll sources require finance's connection and shared FIFO");
  }
  withTransaction<T>(work: () => T): T {
    if (work.constructor.name === "AsyncFunction") throw new TypeError("Payroll source transaction callback must be synchronous");
    return runSyncTransaction(this.lock, this.db, () => {
      const result = work();
      if (result && typeof (result as { then?: unknown }).then === "function") throw new TypeError("Payroll source transaction callback must be synchronous");
      return result;
    });
  }
  getEarning(id: string): PayrollEarningSource | null {
    return this.withTransaction(() => {
      const row = this.db.prepare("SELECT id,employee_id AS employeeId,currency_code AS currency FROM employee_earning WHERE id=?").get(id) as { id: string; employeeId: string; currency: string } | undefined;
      if (!row) return null;
      const total = prepareMoneyRead(this.db, "SELECT total_minor AS minor_units FROM employee_earning WHERE id=?").get(id);
      if (!total) throw new TypeError("Required approved earning amount is missing");
      const amount = total.toWire();
      if (total.compare(Money.parse("0")) < 0) throw new TypeError("Invalid approved earning amount");
      const originals = this.db.prepare("SELECT id,debt_account_id AS debtAccountId FROM debt_entry WHERE producer_type='PAYROLL_EARNINGS' AND producer_id=? AND target_entry_id IS NULL AND correction_of_entry_id IS NULL ORDER BY posting_sequence LIMIT 2").all(id) as { id: string; debtAccountId: string }[];
      if (originals.length > 1) throw new TypeError("Duplicate payroll earning originals");
      if (row.currency !== "DZD") throw new TypeError("Unsupported payroll earning currency");
      if (Money.parse(amount).compare(Money.parse("0")) === 0) {
        if (originals.length) throw new TypeError("Zero earning cannot have a debt original");
        return { id: row.id, employeeId: row.employeeId, currency: row.currency, amount, original: null, account: null };
      }
      if (!originals.length) return { id: row.id, employeeId: row.employeeId, currency: row.currency, amount, original: null, account: null };
      const original = this.finance.getEntry(originals[0]!.id);
      const account = this.finance.getAccount(originals[0]!.debtAccountId);
      if (!original || !account || original.status !== "LIVE" || original.producerType !== "PAYROLL_EARNINGS" || original.producerId !== id || original.targetEntryId || original.correctionOfEntryId || original.currency !== row.currency || Money.parse(original.signedAmountDzd).compare(Money.parse(amount)) !== 0 || account.partyType !== "INTERNAL_WORKER" || account.workerId !== row.employeeId || account.direction !== "PAYABLE" || account.currency !== row.currency) throw new TypeError("Payroll earning original linkage mismatch");
      return { id: row.id, employeeId: row.employeeId, currency: row.currency, amount, original, account };
    });
  }
  getAdvance(id: string): PayrollAdvanceSource | null {
    return this.withTransaction(() => {
      const cash = this.db.prepare("SELECT employee_id AS employeeId,currency FROM employee_salary_cash WHERE id=(SELECT cash_id FROM employee_salary_advance WHERE id=?)").get(id) as { employeeId: string; currency: string } | undefined;
      const link = this.db.prepare("SELECT debt_account_id AS debtAccountId,debt_entry_id AS debtEntryId FROM employee_salary_advance WHERE id=?").get(id) as { debtAccountId: string; debtEntryId: string } | undefined;
      if (!link || !cash) return null;
      const account = this.finance.getAccount(link.debtAccountId);
      const original = this.finance.getEntry(link.debtEntryId);
      const amountRow = prepareMoneyRead(this.db, "SELECT amount_minor AS minor_units FROM employee_salary_advance WHERE id=?").get(id);
      if (!amountRow) throw new TypeError("Required payroll advance amount is missing");
      const amount = amountRow.toWire();
      if (!account || !original || original.status !== "LIVE" || original.entryType !== "ADVANCE" || original.targetEntryId || original.correctionOfEntryId || Money.parse(original.signedAmountDzd).compare(Money.parse("0")) <= 0 || original.producerType !== "PAYROLL_ADVANCE" || original.producerId !== id || original.debtAccountId !== account.id || original.currency !== cash.currency || Money.parse(original.signedAmountDzd).compare(Money.parse(amount)) !== 0 || account.partyType !== "INTERNAL_WORKER" || account.workerId !== cash.employeeId || account.direction !== "RECEIVABLE" || account.currency !== cash.currency) throw new TypeError("Payroll advance original linkage mismatch");
      return { id, employeeId: cash.employeeId, currency: cash.currency, amount, account, original };
    });
  }
}
