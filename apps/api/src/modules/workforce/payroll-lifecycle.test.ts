import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
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

function snapshotPayroll(f: ReturnType<typeof fixture>) {
  const tables = ["employee", "project", "employee_earning", "employee_earning_segment", "employee_salary_cash", "employee_salary_payment_allocation", "employee_salary_advance", "employee_salary_settlement", "employee_salary_advance_offset", "debt_account", "debt_entry", "debt_command", "exact_finance_command"];
  return {
    changes: f.db.prepare("SELECT total_changes() AS count").safeIntegers(true).get(),
    tables: tables.map(table => ({ table, rows: f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).safeIntegers(true).all() })),
  };
}

describe.each([["plain", ""], ["keyed", "558-lifecycle-key"]] as const)("payroll lifecycle reader %s", (_driver, key) => {
  it("shows approved but unposted earnings as owed and performs no data writes", () => {
    const f = fixture(key);
    const earning = f.earning("35000.00");
    const before = snapshotPayroll(f);
    const result = f.reader().getEmployeePayroll(f.employeeId);
    const after = snapshotPayroll(f);
    expect(result.earnings).toMatchObject([{ earning: { id: earning.id, totalAmount: "35000.00" }, registration: "PENDING_REGISTRATION", remaining: "35000.00" }]);
    expect(result.cash).toEqual([]);
    expect(result.summary).toMatchObject({ approvedEarnings: "35000.00", wageCashPaid: "0.00", wagesOffset: "0.00", wagesOwed: "35000.00" });
    expect(result.opening).toEqual({ review: "UNREVIEWED", reminder: true, wages: null, advances: null });
    expect(after).toEqual(before);
  });

  it("leaves populated payroll and ledger rows unchanged while returning exact balances", () => {
    const f = fixture(key); const earning = f.earning("35000.00");
    f.service.recordCash({ ...f.audit, requestId: "snapshot-wage", employeeId: f.employeeId, amount: "25000.00", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "25000.00" }] });
    const cash = f.service.recordCash({ ...f.audit, requestId: "snapshot-advance", employeeId: f.employeeId, amount: "5000.00", paymentDate: paidAt, wages: [], advanceAmount: "5000.00" });
    f.service.offsetAdvance({ ...f.audit, requestId: "snapshot-offset", employeeId: f.employeeId, amount: "2000.00", settlementDate: paidAt, wageSource: { kind: "EARNING", id: earning.id }, advanceSource: { kind: "ADVANCE", id: cash.advance!.id } });
    f.service.repayAdvance({ ...f.audit, requestId: "snapshot-repayment", employeeId: f.employeeId, advanceId: cash.advance!.id, amount: "1000.00", paymentDate: paidAt });
    const before = snapshotPayroll(f);
    const result = f.reader().getEmployeePayroll(f.employeeId);
    expect(result.summary).toMatchObject({ approvedEarnings: "35000.00", wageCashPaid: "25000.00", wagesOffset: "2000.00", wagesOwed: "8000.00", advancesGiven: "5000.00", advancesCashRecovered: "1000.00", advancesOffset: "2000.00", advancesOwed: "2000.00" });
    expect(snapshotPayroll(f)).toEqual(before);
  });

  it("reuses one native finance detail read for posted originals sharing an account", () => {
    const f = fixture(key); const first = f.earning("1000.00"); const second = f.earning("2000.00");
    const original = f.service.registerEarning({ ...f.audit, requestId: "cache-first", earningId: first.id })!;
    const otherOriginal = f.service.registerEarning({ ...f.audit, requestId: "cache-second", earningId: second.id })!;
    expect(otherOriginal.debtAccountId).toBe(original.debtAccountId);
    f.finance.postEntry({ requestId: "cache-unrelated", debtAccountId: original.debtAccountId, entryType: "ADJUSTMENT", signedAmountDzd: "1.00", currency: "DZD" });
    const detail = vi.spyOn(f.finance, "detail");
    try {
      const result = f.reader().getEmployeePayroll(f.employeeId);
      expect(result.earnings.map(row => row.remaining).sort()).toEqual(["1000.00", "2000.00"]);
      expect(result.earnings.every(row => row.registration === "POSTED")).toBe(true);
      expect(result.summary).toMatchObject({ approvedEarnings: "3000.00", wagesOwed: "3000.00", wageCashPaid: "0.00" });
      expect(f.finance.getAccount(original.debtAccountId).currentBalance).toBe("3001.00");
      expect(detail).toHaveBeenCalledTimes(1);
      expect(detail).toHaveBeenCalledWith(original.debtAccountId);
    } finally { detail.mockRestore(); }
  });

  it.each(["metadata", "ledger", "both"] as const)("rejects foreign opening-source %s even with correctly scoped review metadata", mismatch => {
    const f = fixture(key); const foreignEmployee = f.employee(); const sourceId = randomUUID();
    const sourceEmployee = mismatch === "ledger" ? f.employeeId : foreignEmployee;
    const ledgerEmployee = mismatch === "metadata" ? f.employeeId : foreignEmployee;
    const producer = f.finance.forProducer({ type: "PAYROLL_OPENING", id: sourceId });
    const account = producer.createAccount({ requestId: randomUUID(), partyType: "INTERNAL_WORKER", workerId: ledgerEmployee, direction: "PAYABLE", currency: "DZD" });
    const original = producer.postEntry({ requestId: randomUUID(), debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "900.00", currency: "DZD" });
    const provider: PayrollOpeningReviewProvider = { transactionIdentity: f.finance.transactionIdentity, countRows: () => 2,
      getReview: () => ({ state: "REVIEWED", employeeId: f.employeeId, sources: [{ kind: "WAGE", sourceId, employeeId: sourceEmployee, currency: "DZD", amount: "900.00", debtAccountId: account.id, debtEntryId: original.id }] }) };
    expect(() => f.reader(provider).getEmployeePayroll(f.employeeId)).toThrow(/opening source.*mismatch/i);
    expect(f.finance.remaining(original.id)).toBe("900.00");
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
      getReview: () => { expect(f.db.inTransaction).toBe(true); return { state: "REVIEWED", employeeId: f.employeeId, sources: [] }; },
    };
    expect(f.reader(provider).getEmployeePayroll(f.employeeId).opening).toEqual({ review: "REVIEWED", reminder: false, wages: "0.00", advances: "0.00" });
    const unreviewed: PayrollOpeningReviewProvider = { ...provider, getReview: () => ({ state: "UNREVIEWED", employeeId: f.employeeId, sources: [] }) };
    expect(f.reader(unreviewed).getEmployeePayroll(f.employeeId).opening).toEqual({ review: "UNREVIEWED", reminder: true, wages: null, advances: null });
    const wrongEmployee: PayrollOpeningReviewProvider = { ...provider, getReview: () => ({ state: "REVIEWED", employeeId: randomUUID(), sources: [] }) };
    expect(() => f.reader(wrongEmployee).getEmployeePayroll(f.employeeId)).toThrow(/review metadata/);
  });

  it.each(["ADJUSTMENT", "ADVANCE"] as const)("includes reviewed opening totals with %s advance originals", entryType => {
    const f = fixture(key);
    const sourceId = "opening-wage-source";
    const producer = f.finance.forProducer({ type: "PAYROLL_OPENING", id: sourceId });
    const account = producer.createAccount({ requestId: "opening-account", partyType: "INTERNAL_WORKER", workerId: f.employeeId, direction: "PAYABLE", currency: "DZD" });
    const original = producer.postEntry({ requestId: "opening-original", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "900.00", currency: "DZD" });
    const source: PayrollOpeningSource = { kind: "WAGE", sourceId, employeeId: f.employeeId, currency: "DZD", amount: "900.00", debtAccountId: account.id, debtEntryId: original.id };
    const advanceSourceId = "opening-advance-source";
    const advanceProducer = f.finance.forProducer({ type: "PAYROLL_OPENING", id: advanceSourceId });
    const advanceAccount = advanceProducer.createAccount({ requestId: "opening-advance-account", partyType: "INTERNAL_WORKER", workerId: f.employeeId, direction: "RECEIVABLE", currency: "DZD" });
    const advanceOriginal = advanceProducer.postEntry({ requestId: "opening-advance-original", debtAccountId: advanceAccount.id, entryType, signedAmountDzd: "700.00", currency: "DZD" });
    const advanceSource: PayrollOpeningSource = { kind: "ADVANCE", sourceId: advanceSourceId, employeeId: f.employeeId, currency: "DZD", amount: "700.00", debtAccountId: advanceAccount.id, debtEntryId: advanceOriginal.id };
    const payment = producer.recordPayment({ requestId: "opening-cash", debtEntryId: original.id, amountDzd: "500.00", currency: "DZD", paymentMethod: "CASH" });
    f.cash.saveCash({ id: randomUUID(), employeeId: f.employeeId, currency: "DZD", amount: "500.00", paymentDate: paidAt, ...f.audit, createdAt: now,
      wageAllocations: [{ id: randomUUID(), source: { kind: "OPENING", id: sourceId }, amount: "500.00", debtAccountId: account.id, debtEntryId: original.id, paymentEntryId: payment.id }], advance: null });
    const provider: PayrollOpeningReviewProvider = { transactionIdentity: f.finance.transactionIdentity, countRows: () => 3, getReview: () => ({ state: "REVIEWED", employeeId: f.employeeId, sources: [source, advanceSource] }) };
    const result = f.reader(provider).getEmployeePayroll(f.employeeId);
    expect(result.opening).toEqual({ review: "REVIEWED", reminder: false, wages: "400.00", advances: "700.00" });
    expect(result.summary).toMatchObject({ approvedEarnings: "0.00", wageCashPaid: "500.00", wagesOwed: "400.00", advancesGiven: "0.00", advancesOwed: "700.00", currentAppTotalsExcludeUnknownOpening: false });
    const underreported: PayrollOpeningReviewProvider = { ...provider, countRows: () => 2 };
    expect(() => f.reader(underreported).getEmployeePayroll(f.employeeId)).toThrow(/row count does not match/i);
    const mismatched: PayrollOpeningReviewProvider = { ...provider, getReview: () => ({ state: "REVIEWED", employeeId: f.employeeId, sources: [{ ...source, amount: "901.00" }, advanceSource] }) };
    expect(() => f.reader(mismatched).getEmployeePayroll(f.employeeId)).toThrow(/opening source ledger linkage mismatch/i);
  });

  it("includes 5000 opening wages plus 35000 approved less 30000 cash as 10000 owed", () => {
    const f = fixture(key); const earning = f.earning("35000.00");
    const sourceId = randomUUID(); const opening = f.finance.forProducer({ type: "PAYROLL_OPENING", id: sourceId });
    const account = opening.createAccount({ requestId: randomUUID(), partyType: "INTERNAL_WORKER", workerId: f.employeeId, direction: "PAYABLE", currency: "DZD" });
    const original = opening.postEntry({ requestId: randomUUID(), debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "5000.00", currency: "DZD" });
    f.service.recordCash({ ...f.audit, requestId: "current-pay", employeeId: f.employeeId, amount: "30000.00", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "30000.00" }] });
    const provider: PayrollOpeningReviewProvider = { transactionIdentity: f.finance.transactionIdentity, countRows: () => 2,
      getReview: () => ({ state: "REVIEWED", employeeId: f.employeeId, sources: [{ kind: "WAGE", sourceId, employeeId: f.employeeId, currency: "DZD", amount: "5000.00", debtAccountId: account.id, debtEntryId: original.id }] }) };
    const result = f.reader(provider).getEmployeePayroll(f.employeeId);
    expect(result.summary).toMatchObject({ approvedEarnings: "35000.00", wageCashPaid: "30000.00", wagesOwed: "10000.00", advancesOwed: "0.00" });
    expect(result.opening.wages).toBe("5000.00");
    expect(f.cost()).toEqual(["35000.00"]);
  });

  it("keeps unallocated earnings distinct from outstanding wages", () => {
    const f = fixture(key);
    const earning = f.earnings.create({ requestId: randomUUID(), employeeId: f.employeeId, currencyCode: "DZD", periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z", totalAmount: "35000.00", unallocatedAmount: "10000.00", referenceSalary: null,
      segments: [{ id: randomUUID(), projectId: f.projectId, days: 15, amount: "25000.00" }] }, "unallocated-approved-intent", now, f.audit);
    f.service.recordCash({ ...f.audit, requestId: "unallocated-wage-pay", employeeId: f.employeeId, amount: "15000.00", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "15000.00" }] });
    const result = f.reader().getEmployeePayroll(f.employeeId);
    expect(result.summary).toMatchObject({ approvedEarnings: "35000.00", wageCashPaid: "15000.00", wagesOwed: "20000.00", unallocatedEarnings: "10000.00" });
    expect(f.cost()).toEqual(["25000.00"]);
  });

  it.each(["payment", "settlement", "correction"])("refuses an unattributed %s rather than inferring a payroll cash history", kind => {
    const f = fixture(key); const earning = f.earning("1000.00");
    const original = f.service.registerEarning({ ...f.audit, requestId: "register-source", earningId: earning.id })!;
    const producer = f.finance.forProducer({ type: "PAYROLL_EARNINGS", id: earning.id });
    if (kind === "payment") producer.recordPayment({ requestId: randomUUID(), debtEntryId: original.id, amountDzd: "100.00", currency: "DZD" });
    else if (kind === "settlement") producer.recordSettlement({ requestId: randomUUID(), debtEntryId: original.id, amountDzd: "100.00", currency: "DZD" });
    else producer.correctEntry({ requestId: randomUUID(), entryId: original.id, amountDzd: "900.00", reason: "Unattributed correction probe", currency: "DZD" });
    expect(() => f.reader().getEmployeePayroll(f.employeeId)).toThrow(/unattributed/i);
    expect(f.cash.listCash(f.employeeId)).toEqual([]);
  });

  it("uses wide exact report totals for multiple maximum-sized approved earnings", () => {
    const f = fixture(key);
    f.earning("92233720368547758.07");
    f.earning("92233720368547758.07");
    const result = f.reader().getEmployeePayroll(f.employeeId);
    expect(result.summary.approvedEarnings).toBe("184467440737095516.14");
    expect(result.summary.wagesOwed).toBe("184467440737095516.14");
  });

  it("includes reviewed opening balances in wide exact totals without new ledger writes", () => {
    const f = fixture(key); f.earning("92233720368547758.07");
    const sourceId = randomUUID(); const producer = f.finance.forProducer({ type: "PAYROLL_OPENING", id: sourceId });
    const account = producer.createAccount({ requestId: randomUUID(), partyType: "INTERNAL_WORKER", workerId: f.employeeId, direction: "PAYABLE", currency: "DZD" });
    const original = producer.postEntry({ requestId: randomUUID(), debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "92233720368547758.07", currency: "DZD" });
    const provider: PayrollOpeningReviewProvider = { transactionIdentity: f.finance.transactionIdentity, countRows: () => 2,
      getReview: () => ({ state: "REVIEWED", employeeId: f.employeeId, sources: [{ kind: "WAGE", sourceId, employeeId: f.employeeId, currency: "DZD", amount: "92233720368547758.07", debtAccountId: account.id, debtEntryId: original.id }] }) };
    const result = f.reader(provider).getEmployeePayroll(f.employeeId);
    expect(result.summary.wagesOwed).toBe("184467440737095516.14");
    expect(result.opening.wages).toBe("92233720368547758.07");
    expect(result.earnings[0]?.registration).toBe("PENDING_REGISTRATION");
    expect(f.finance.listEntries(account.id)).toHaveLength(1);
  });

  it("rejects cash allocated to a fabricated earning even if its ledger producer label matches", () => {
    const f = fixture(key); const sourceId = randomUUID();
    const producer = f.finance.forProducer({ type: "PAYROLL_EARNINGS", id: sourceId });
    const account = producer.createAccount({ requestId: randomUUID(), partyType: "INTERNAL_WORKER", workerId: f.employeeId, direction: "PAYABLE", currency: "DZD" });
    const original = producer.postEntry({ requestId: randomUUID(), debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "1000.00", currency: "DZD" });
    const payment = producer.recordPayment({ requestId: randomUUID(), debtEntryId: original.id, amountDzd: "100.00", currency: "DZD" });
    f.cash.saveCash({ id: randomUUID(), employeeId: f.employeeId, currency: "DZD", amount: "100.00", paymentDate: paidAt, ...f.audit, createdAt: now, advance: null,
      wageAllocations: [{ id: randomUUID(), source: { kind: "EARNING", id: sourceId }, amount: "100.00", debtAccountId: account.id, debtEntryId: original.id, paymentEntryId: payment.id }] });
    expect(() => f.reader().getEmployeePayroll(f.employeeId)).toThrow(/source does not exist/);
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

  it("budgets cash children, both financial directions and unrelated ledger rows before hydration", () => {
    const f = fixture(key); const earning = f.earning("35000.00");
    const cash = f.service.recordCash({ ...f.audit, requestId: "wage", employeeId: f.employeeId, amount: "25000.00", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "25000.00" }] });
    const advance = f.service.recordCash({ ...f.audit, requestId: "advance", employeeId: f.employeeId, amount: "5000.00", paymentDate: paidAt, wages: [], advanceAmount: "5000.00" });
    f.service.offsetAdvance({ ...f.audit, requestId: "offset", employeeId: f.employeeId, amount: "2000.00", settlementDate: paidAt, wageSource: { kind: "EARNING", id: earning.id }, advanceSource: { kind: "ADVANCE", id: advance.advance!.id } });
    f.service.repayAdvance({ ...f.audit, requestId: "repay", employeeId: f.employeeId, advanceId: advance.advance!.id, amount: "1000.00", paymentDate: paidAt });
    f.finance.postEntry({ requestId: "unrelated", debtAccountId: cash.wageAllocations[0]!.debtAccountId, entryType: "ADJUSTMENT", signedAmountDzd: "1.00", currency: "DZD" });
    // 1 earning + 1 segment + 2 cash + 1 allocation + 1 advance + 1
    // repayment + 1 offset + 2 accounts + 7 ledger entries = 17 rows.
    const provider: PayrollOpeningReviewProvider = { transactionIdentity: f.finance.transactionIdentity, countRows: () => 9984,
      getReview: () => { throw new Error("opening hydration reached"); } };
    expect(() => f.reader(provider).getEmployeePayroll(f.employeeId)).toThrow(/materialization limit/);
    expect(() => f.reader({ ...provider, countRows: () => 9983 }).getEmployeePayroll(f.employeeId)).toThrow("opening hydration reached");
    expect(f.reader().getEmployeePayroll(f.employeeId).summary).toMatchObject({ wagesOwed: "8000.00", advancesOwed: "2000.00" });
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
