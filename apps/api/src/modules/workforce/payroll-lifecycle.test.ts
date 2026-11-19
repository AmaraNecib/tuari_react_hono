import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { payrollFixture, cleanup, now, paidAt } from "./__test-utils__/payroll-native";
import { payrollOffsetSchemaStatements } from "./adapters/payroll-offset-schema";
import { SqlitePayrollOffsetRepository } from "./adapters/sqlite-payroll-offset.repository";
import { SqlitePayrollLifecycleReader } from "./adapters/sqlite-payroll-lifecycle.reader";
import type { PayrollOpeningReviewProvider, PayrollOpeningSource } from "./payroll-lifecycle";
import { PayrollService } from "./payroll.service";

function fixture(key = "") {
  const f = payrollFixture(key);
  for (const sql of payrollOffsetSchemaStatements) f.db.exec(sql);
  const offsets = new SqlitePayrollOffsetRepository(f.db, f.lock);
  const service = new PayrollService(f.finance, f.cash, f.sources, { id: randomUUID, now: () => now }, offsets);
  const reader = (opening?: PayrollOpeningReviewProvider) => new SqlitePayrollLifecycleReader(f.db, f.lock, f.finance, f.financeRepository, f.sources, f.cash, offsets, opening);
  return { ...f, offsets, service, reader };
}

describe.each([["plain", ""], ["keyed", "558-lifecycle-key"]] as const)("payroll lifecycle reader %s", (_driver, key) => {
  it("shows approved but unposted earnings as owed and performs no debt writes", () => {
    const f = fixture(key);
    const earning = f.earning("35000.00");
    const before = ["debt_account", "debt_entry", "debt_command", "exact_finance_command"].map(table => Number((f.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count));
    const result = f.reader().getEmployeePayroll(f.employeeId);
    const after = ["debt_account", "debt_entry", "debt_command", "exact_finance_command"].map(table => Number((f.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count));
    expect(result.earnings).toMatchObject([{ earning: { id: earning.id, totalAmount: "35000.00" }, registration: "PENDING_REGISTRATION", remaining: "35000.00" }]);
    expect(result.cash).toEqual([]);
    expect(result.summary).toMatchObject({ approvedEarnings: "35000.00", wageCashPaid: "0.00", wagesOffset: "0.00", wagesOwed: "35000.00" });
    expect(result.opening).toEqual({ review: "UNREVIEWED", reminder: true, wages: null, advances: null });
    expect(after).toEqual(before);
  });

  it("keeps cash, offsets, repayments, and advances separate without changing allocation provenance", () => {
    const f = fixture(key);
    const earning = f.earning("35000.00");
    const cash = f.service.recordCash({ ...f.audit, requestId: "wage-cash", employeeId: f.employeeId, amount: "25000.00", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "25000.00" }] });
    expect(f.reader().getEmployeePayroll(f.employeeId).summary).toMatchObject({ approvedEarnings: "35000.00", wageCashPaid: "25000.00", wagesOwed: "10000.00" });
    const advanceCash = f.service.recordCash({ ...f.audit, requestId: "advance-cash", employeeId: f.employeeId, amount: "5000.00", paymentDate: paidAt, wages: [], advanceAmount: "5000.00" });
    const offset = f.service.offsetAdvance({ ...f.audit, requestId: "offset", employeeId: f.employeeId, amount: "2000.00", settlementDate: paidAt,
      wageSource: { kind: "EARNING", id: earning.id }, advanceSource: { kind: "ADVANCE", id: advanceCash.advance!.id } });
    f.service.repayAdvance({ ...f.audit, requestId: "repay", employeeId: f.employeeId, advanceId: advanceCash.advance!.id, amount: "1000.00", paymentDate: paidAt });
    const result = f.reader().getEmployeePayroll(f.employeeId);
    expect(result.cash.find(row => row.id === cash.id)?.wageAllocations).toEqual(cash.wageAllocations);
    expect(result.offsets.map(row => row.id)).toEqual([offset.id]);
    expect(result.repayments.map(row => row.amount)).toEqual(["1000.00"]);
    expect(result.advances.map(row => row.advance.id)).toEqual([advanceCash.advance!.id]);
    expect(result.summary).toMatchObject({
      approvedEarnings: "35000.00", wageCashPaid: "25000.00", wagesOffset: "2000.00", wagesOwed: "8000.00",
      advancesGiven: "5000.00", advancesCashRecovered: "1000.00", advancesOffset: "2000.00", advancesOwed: "2000.00",
    });
    expect(result.opening.reminder).toBe(true);
  });

  it("keeps the opening reminder after current payroll cash and distinguishes missing provider from reviewed zero", () => {
    const f = fixture(key);
    const earning = f.earning("1000.00");
    f.service.recordCash({ ...f.audit, requestId: "cash", employeeId: f.employeeId, amount: "1000.00", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "1000.00" }] });
    expect(f.reader().getEmployeePayroll(f.employeeId).opening).toMatchObject({ review: "UNREVIEWED", reminder: true, wages: null, advances: null });
    const provider: PayrollOpeningReviewProvider = {
      transactionIdentity: f.finance.transactionIdentity,
      countRows: () => 1,
      getReview: () => { expect(f.db.inTransaction).toBe(true); return { state: "REVIEWED", sources: [] }; },
    };
    expect(f.reader(provider).getEmployeePayroll(f.employeeId).opening).toEqual({ review: "REVIEWED", reminder: false, wages: "0.00", advances: "0.00" });
  });

  it("includes only reviewed opening originals linked to the same worker and exact amount", () => {
    const f = fixture(key);
    const sourceId = "opening-wage-source";
    const producer = f.finance.forProducer({ type: "PAYROLL_OPENING", id: sourceId });
    const account = producer.createAccount({ requestId: "opening-account", partyType: "INTERNAL_WORKER", workerId: f.employeeId, direction: "PAYABLE", currency: "DZD" });
    const original = producer.postEntry({ requestId: "opening-original", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "900.00", currency: "DZD" });
    const source: PayrollOpeningSource = { kind: "WAGE", sourceId, employeeId: f.employeeId, currency: "DZD", amount: "900.00", debtAccountId: account.id, debtEntryId: original.id };
    const advanceSourceId = "opening-advance-source";
    const advanceProducer = f.finance.forProducer({ type: "PAYROLL_OPENING", id: advanceSourceId });
    const advanceAccount = advanceProducer.createAccount({ requestId: "opening-advance-account", partyType: "INTERNAL_WORKER", workerId: f.employeeId, direction: "RECEIVABLE", currency: "DZD" });
    const advanceOriginal = advanceProducer.postEntry({ requestId: "opening-advance-original", debtAccountId: advanceAccount.id, entryType: "ADVANCE", signedAmountDzd: "700.00", currency: "DZD" });
    const advanceSource: PayrollOpeningSource = { kind: "ADVANCE", sourceId: advanceSourceId, employeeId: f.employeeId, currency: "DZD", amount: "700.00", debtAccountId: advanceAccount.id, debtEntryId: advanceOriginal.id };
    const payment = producer.recordPayment({ requestId: "opening-cash", debtEntryId: original.id, amountDzd: "500.00", currency: "DZD", paymentMethod: "CASH" });
    f.cash.saveCash({ id: randomUUID(), employeeId: f.employeeId, currency: "DZD", amount: "500.00", paymentDate: paidAt, ...f.audit, createdAt: now,
      wageAllocations: [{ id: randomUUID(), source: { kind: "OPENING", id: sourceId }, amount: "500.00", debtAccountId: account.id, debtEntryId: original.id, paymentEntryId: payment.id }], advance: null });
    const provider: PayrollOpeningReviewProvider = { transactionIdentity: f.finance.transactionIdentity, countRows: () => 3, getReview: () => ({ state: "REVIEWED", sources: [source, advanceSource] }) };
    expect(f.reader(provider).getEmployeePayroll(f.employeeId).opening).toEqual({ review: "REVIEWED", reminder: false, wages: "400.00", advances: "700.00" });
    const underreported: PayrollOpeningReviewProvider = { ...provider, countRows: () => 2 };
    expect(() => f.reader(underreported).getEmployeePayroll(f.employeeId)).toThrow(/row count does not match/i);
    const mismatched: PayrollOpeningReviewProvider = { ...provider, getReview: () => ({ state: "REVIEWED", sources: [{ ...source, amount: "901.00" }, advanceSource] }) };
    expect(() => f.reader(mismatched).getEmployeePayroll(f.employeeId)).toThrow(/opening source ledger linkage mismatch/i);
  });

  it("uses wide exact report totals for multiple maximum-sized approved earnings", () => {
    const f = fixture(key);
    f.earning("92233720368547758.07");
    f.earning("92233720368547758.07");
    const result = f.reader().getEmployeePayroll(f.employeeId);
    expect(result.summary.approvedEarnings).toBe("184467440737095516.14");
    expect(result.summary.wagesOwed).toBe("184467440737095516.14");
  });

  it("rejects the combined selected-row budget before opening-provider hydration", () => {
    const f = fixture(key);
    const earning = f.earning("100.00");
    f.service.registerEarning({ ...f.audit, requestId: "registered", earningId: earning.id });
    const provider: PayrollOpeningReviewProvider = {
      transactionIdentity: f.finance.transactionIdentity,
      countRows: () => 9997,
      getReview: () => { throw new Error("provider hydrated before aggregate budget check"); },
    };
    expect(() => f.reader(provider).getEmployeePayroll(f.employeeId)).toThrow(/materialization limit/i);
  });

  it("refuses missing employees, foreign database/FIFO participants, and source-ledger drift", () => {
    const f = fixture(key);
    expect(() => f.reader().getEmployeePayroll(randomUUID())).toThrow(/employee not found/i);
    const other = fixture(`${key}-other`);
    expect(() => new SqlitePayrollLifecycleReader(f.db, f.lock, f.finance, f.financeRepository, other.sources, f.cash, f.offsets)).toThrow(/same connection and shared fifo/i);
    const wrongFifo: PayrollOpeningReviewProvider = { transactionIdentity: { connection: f.db, lock: other.lock }, countRows: () => 0, getReview: () => null };
    expect(() => f.reader(wrongFifo)).toThrow(/same connection and shared fifo/i);
    const earning = f.earning("1000.00");
    f.service.registerEarning({ ...f.audit, requestId: "register", earningId: earning.id });
    f.db.prepare("DROP TRIGGER debt_entry_posting_immutable").run();
    f.db.prepare("UPDATE debt_entry SET signed_amount_minor=? WHERE producer_id=? AND producer_type='PAYROLL_EARNINGS'").run(99999, earning.id);
    expect(() => f.reader().getEmployeePayroll(f.employeeId)).toThrow(/earning original linkage mismatch/i);
  });
});
