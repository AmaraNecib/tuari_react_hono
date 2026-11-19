import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { SqliteExactFinanceRepository } from "../company/adapters/sqlite-exact-finance.repository";
import { ExactFinanceService } from "../company/exact-finance.service";
import { payrollFixture, cleanup, now, paidAt } from "./__test-utils__/payroll-native";
import { payrollOffsetSchemaStatements } from "./adapters/payroll-offset-schema";
import { SqlitePayrollOffsetRepository } from "./adapters/sqlite-payroll-offset.repository";
import { SqlitePayrollCashRepository } from "./adapters/sqlite-payroll-cash.repository";
import { SqlitePayrollSourceRepository } from "./adapters/sqlite-payroll-source.repository";
import { PayrollService } from "./payroll.service";

function fixture(key: string, wage = "10000.00", advance = "5000.00") {
  const f = payrollFixture(key);
  for (const sql of payrollOffsetSchemaStatements) f.db.exec(sql);
  const offsets = new SqlitePayrollOffsetRepository(f.db, f.lock);
  const service = new PayrollService(f.finance, f.cash, f.sources, { id: randomUUID, now: () => now }, offsets);
  const earning = f.earning(wage);
  const advanceCash = service.recordCash({ ...f.audit, requestId: "advance-cash", employeeId: f.employeeId, amount: advance, paymentDate: paidAt, wages: [], advanceAmount: advance });
  const input = { ...f.audit, requestId: "offset", employeeId: f.employeeId, amount: "2000.00", settlementDate: paidAt,
    wageSource: { kind: "EARNING" as const, id: earning.id }, advanceSource: { kind: "ADVANCE" as const, id: advanceCash.advance!.id } };
  return { ...f, service, offsets, earning, advanceCash, input, createEarning: f.earning };
}

describe.each([["plain", ""], ["keyed", "558-offset-public-key"]])("explicit wage offset %s", (_driver, key) => {
  it("settles only a selected portion without labeling it as a cash payment", () => {
    const f = payrollFixture(key); const earning = f.earning("10000.00");
    const original = f.service.registerEarning({ ...f.audit, requestId: "wage", earningId: earning.id });
    const scoped = f.finance.forProducer({ type: "PAYROLL_EARNINGS", id: earning.id });
    const input = { ...f.audit, requestId: "partial-settlement", debtEntryId: original!.id, currency: "DZD" as const, amountDzd: "2000.00" };
    const settled = scoped.recordSettlement(input);
    expect(settled).toMatchObject({ entryType: "SETTLEMENT", paymentMethod: null, signedAmountDzd: "-2000.00", targetEntryId: original!.id });
    expect(f.finance.remaining(original!.id)).toBe("8000.00");
    expect(f.cash.listCash(f.employeeId)).toEqual([]);
    expect(f.cost()).toEqual(["10000.00"]);
    expect(scoped.recordSettlement(input)).toEqual(settled);
    expect(() => scoped.recordSettlement({ ...input, amountDzd: "1000.00" })).toThrow(/conflict/);
    expect(() => f.finance.recordSettlement({ ...input, requestId: "generic" })).toThrow(/producer/);
    expect(() => f.finance.forProducer({ type: "PAYROLL_EARNINGS", id: randomUUID() }).recordSettlement({ ...input, requestId: "wrong-producer" })).toThrow(/producer/);
    for (const amountDzd of ["0", "-1", "8000.01", "1.001", "92233720368547758.08"]) expect(() => scoped.recordSettlement({ ...input, requestId: randomUUID(), amountDzd })).toThrow();
  });

  it("records a partial offset with two noncash legs and unchanged cash/project history", () => {
    const f = fixture(key);
    const result = f.service.offsetAdvance(f.input);
    expect(result.amount).toBe("2000.00");
    expect(f.finance.remaining(result.wage.debtEntryId)).toBe("8000.00");
    expect(f.finance.remaining(result.advance.debtEntryId)).toBe("3000.00");
    for (const leg of [result.wage, result.advance]) expect(f.financeRepository.getEntry(leg.settlementEntryId)).toMatchObject({ entryType: "SETTLEMENT", paymentMethod: null, signedAmountDzd: "-2000.00", targetEntryId: leg.debtEntryId });
    expect(f.cash.listCash(f.employeeId)).toEqual([f.advanceCash]);
    expect(f.cash.listSettlements(f.employeeId)).toEqual([]);
    expect(f.offsets.getOffset(result.id)).toEqual(result);
    expect(f.offsets.listOffsets(f.employeeId)).toEqual([result]);
    expect(f.cost()).toEqual(["10000.00"]);
    const paid = f.service.recordCash({ ...f.audit, requestId: "pay-eight-thousand", employeeId: f.employeeId, amount: "8000.00", paymentDate: paidAt, wages: [{ earningId: f.earning.id, amount: "8000.00" }] });
    expect(f.finance.remaining(paid.wageAllocations[0]!.debtEntryId)).toBe("0.00");
    expect(f.finance.remaining(result.advance.debtEntryId)).toBe("3000.00");
    expect(f.cash.listCash(f.employeeId).map(row => row.amount).sort()).toEqual(["5000.00", "8000.00"]);
    expect(f.cost()).toEqual(["10000.00"]);
  });

  it("allows repeated partial offsets and full recovery without silently choosing either", () => {
    const f = fixture(key);
    const first = f.service.offsetAdvance(f.input);
    const second = f.service.offsetAdvance({ ...f.input, requestId: "remaining-advance", amount: "3000.00" });
    expect(f.finance.remaining(first.wage.debtEntryId)).toBe("5000.00");
    expect(f.finance.remaining(first.advance.debtEntryId)).toBe("0.00");
    expect(f.offsets.listOffsets(f.employeeId)).toHaveLength(2);
    f.service.recordCash({ ...f.audit, requestId: "pay-remainder", employeeId: f.employeeId, amount: "5000.00", paymentDate: paidAt, wages: [{ earningId: f.earning.id, amount: "5000.00" }] });
    expect(f.finance.remaining(second.wage.debtEntryId)).toBe("0.00");
    expect(f.cost()).toEqual(["10000.00"]);
    expect(() => f.service.offsetAdvance({ ...f.input, requestId: "no-more", amount: "0.01" })).toThrow();
  });

  it("supports no salary recovery and later independent cash repayment", () => {
    const f = fixture(key);
    const paid = f.service.recordCash({ ...f.audit, requestId: "salary-in-full", employeeId: f.employeeId, amount: "10000.00", paymentDate: paidAt, wages: [{ earningId: f.earning.id, amount: "10000.00" }] });
    expect(f.finance.remaining(paid.wageAllocations[0]!.debtEntryId)).toBe("0.00");
    expect(f.finance.remaining(f.advanceCash.advance!.debtEntryId)).toBe("5000.00");
    expect(f.offsets.listOffsets(f.employeeId)).toEqual([]);
    f.service.repayAdvance({ ...f.audit, requestId: "independent-repayment", employeeId: f.employeeId, advanceId: f.advanceCash.advance!.id, amount: "5000.00", paymentDate: paidAt });
    expect(f.finance.remaining(f.advanceCash.advance!.debtEntryId)).toBe("0.00");
    expect(f.offsets.listOffsets(f.employeeId)).toEqual([]);
    expect(f.cost()).toEqual(["10000.00"]);
  });

  it("supports a full offset and preserves large exact cents", () => {
    const f = fixture(key, "90071992547409.93", "90071992547409.93");
    const result = f.service.offsetAdvance({ ...f.input, amount: "90071992547409.92" });
    expect(f.finance.remaining(result.wage.debtEntryId)).toBe("0.01");
    expect(f.finance.remaining(result.advance.debtEntryId)).toBe("0.01");
    f.service.offsetAdvance({ ...f.input, requestId: "last-cent", amount: "0.01" });
    expect(f.finance.remaining(result.wage.debtEntryId)).toBe("0.00");
    expect(f.finance.remaining(result.advance.debtEntryId)).toBe("0.00");
    expect(f.cost()).toEqual(["90071992547409.93"]);
  });

  it("replays canonical intent, rejects changed targets/actors and survives close/reopen", () => {
    const f = fixture(key); const result = f.service.offsetAdvance(f.input);
    expect(f.service.offsetAdvance({ ...f.input, amount: "2000", settlementDate: "2026-11-18T10:00:00+01:00", transactionId: randomUUID() })).toEqual(result);
    for (const patch of [{ amount: "1000.00" }, { employeeId: f.employee() }, { actorUserId: randomUUID() }, { wageSource: { kind: "EARNING" as const, id: randomUUID() } }, { advanceSource: { kind: "ADVANCE" as const, id: randomUUID() } }]) expect(() => f.service.offsetAdvance({ ...f.input, ...patch })).toThrow(/conflict/);
    f.db.close();
    const db = createDatabaseConnection(f.path, key); cleanup.push(() => db.close());
    const lock = createFifoLock(); const financeRepository = new SqliteExactFinanceRepository(db, lock);
    const finance = new ExactFinanceService(financeRepository, { id: randomUUID, now: () => now });
    const cash = new SqlitePayrollCashRepository(db, lock); const offsets = new SqlitePayrollOffsetRepository(db, lock);
    const service = new PayrollService(finance, cash, new SqlitePayrollSourceRepository(db, lock, financeRepository), { id: randomUUID, now: () => now }, offsets);
    expect(service.offsetAdvance(f.input)).toEqual(result);
    expect(offsets.listOffsets(f.employeeId)).toEqual([result]);
    expect(finance.remaining(result.wage.debtEntryId)).toBe("8000.00");
    expect(finance.remaining(result.advance.debtEntryId)).toBe("3000.00");
  });

  it.each(["first", "second", "provenance", "receipt"])("rolls back every effect if the %s offset write fails", failure => {
    const f = fixture(key);
    if (failure === "first" || failure === "second") f.db.exec(`CREATE TRIGGER injected_offset_failure BEFORE INSERT ON debt_entry WHEN NEW.entry_type='SETTLEMENT' AND EXISTS (SELECT 1 FROM debt_account WHERE id=NEW.debt_account_id AND direction='${failure === "first" ? "PAYABLE" : "RECEIVABLE"}') BEGIN SELECT RAISE(ABORT,'injected offset failure'); END`);
    else if (failure === "provenance") f.db.exec("CREATE TRIGGER injected_offset_failure AFTER INSERT ON employee_salary_advance_offset BEGIN SELECT RAISE(ABORT,'injected offset failure'); END");
    else f.db.exec("CREATE TRIGGER injected_offset_failure BEFORE INSERT ON exact_finance_command WHEN json_type(NEW.result_json,'$.wageSource')='object' BEGIN SELECT RAISE(ABORT,'injected offset failure'); END");
    const before = f.finance.listEntries(f.advanceCash.advance!.debtAccountId);
    expect(() => f.service.offsetAdvance(f.input)).toThrow("injected offset failure");
    expect(f.sources.getEarning(f.earning.id)?.original).toBeNull();
    expect(f.finance.listEntries(f.advanceCash.advance!.debtAccountId)).toEqual(before);
    expect(f.finance.remaining(f.advanceCash.advance!.debtEntryId)).toBe("5000.00");
    expect(f.offsets.listOffsets(f.employeeId)).toEqual([]);
    expect(f.cash.listCash(f.employeeId)).toEqual([f.advanceCash]);
    expect(f.db.prepare("SELECT count(*) AS count FROM exact_finance_command").get()).toEqual({ count: 1 });
    f.db.exec("DROP TRIGGER injected_offset_failure");
    const result = f.service.offsetAdvance(f.input);
    expect(f.finance.remaining(result.wage.debtEntryId)).toBe("8000.00");
    expect(f.finance.remaining(result.advance.debtEntryId)).toBe("3000.00");
  });

  it("rejects invalid amounts, missing/wrong workers and unsupported opening sources", () => {
    const f = fixture(key);
    for (const amount of ["0", "-1", "1.001", "1e2", "92233720368547758.08", "5000.01"]) expect(() => f.service.offsetAdvance({ ...f.input, amount })).toThrow();
    expect(() => f.service.offsetAdvance({ ...f.input, employeeId: f.employee() })).toThrow();
    expect(() => f.service.offsetAdvance({ ...f.input, wageSource: { kind: "OPENING", id: randomUUID() } })).toThrow();
    expect(() => f.service.offsetAdvance({ ...f.input, advanceSource: { kind: "OPENING_ADVANCE", id: randomUUID() } })).toThrow();
    expect(() => f.service.offsetAdvance({ ...f.input, advanceSource: { kind: "ADVANCE", id: randomUUID() } })).toThrow();
    expect(f.sources.getEarning(f.earning.id)?.original).toBeNull();
    expect(f.finance.remaining(f.advanceCash.advance!.debtEntryId)).toBe("5000.00");
    expect(f.offsets.listOffsets(f.employeeId)).toEqual([]);
  });

  it("rejects another worker's advance without leaving a new wage obligation behind", () => {
    const f = fixture(key); const otherWorker = f.employee();
    const otherCash = f.service.recordCash({ ...f.audit, requestId: "other-advance", employeeId: otherWorker, amount: "5000.00", paymentDate: paidAt, wages: [], advanceAmount: "5000.00" });
    expect(() => f.service.offsetAdvance({ ...f.input, advanceSource: { kind: "ADVANCE", id: otherCash.advance!.id } })).toThrow(/source/);
    expect(f.sources.getEarning(f.earning.id)?.original).toBeNull();
    expect(f.finance.remaining(otherCash.advance!.debtEntryId)).toBe("5000.00");
    expect(f.finance.remaining(f.advanceCash.advance!.debtEntryId)).toBe("5000.00");
    expect(f.offsets.listOffsets(f.employeeId)).toEqual([]);
  });

  it.each(["missing", "worker", "amount", "opening"])("refuses direct storage attribution to a %s earning source", fault => {
    const f = fixture(key);
    const sourceId = fault === "missing" || fault === "opening" ? randomUUID() : f.createEarning(fault === "amount" ? "9000.00" : "10000.00", fault === "worker" ? f.employee() : f.employeeId).id;
    const wages = f.finance.forProducer({ type: fault === "opening" ? "PAYROLL_OPENING" : "PAYROLL_EARNINGS", id: sourceId });
    const account = wages.createAccount({ requestId: randomUUID(), partyType: "INTERNAL_WORKER", workerId: f.employeeId, direction: "PAYABLE", currency: "DZD" });
    const original = wages.postEntry({ requestId: randomUUID(), debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "10000.00", currency: "DZD" });
    const wageEntry = wages.recordSettlement({ requestId: randomUUID(), debtEntryId: original.id, amountDzd: "2000.00", currency: "DZD" });
    const advances = f.finance.forProducer({ type: "PAYROLL_ADVANCE", id: f.advanceCash.advance!.id });
    const advanceEntry = advances.recordSettlement({ requestId: randomUUID(), debtEntryId: f.advanceCash.advance!.debtEntryId, amountDzd: "2000.00", currency: "DZD" });
    expect(() => f.offsets.saveOffset({ id: randomUUID(), employeeId: f.employeeId, currency: "DZD", amount: "2000.00", settlementDate: paidAt, ...f.audit, createdAt: now,
      wageSource: { kind: fault === "opening" ? "OPENING" : "EARNING", id: sourceId }, advanceSource: { kind: "ADVANCE", id: f.advanceCash.advance!.id },
      wage: { debtAccountId: account.id, debtEntryId: original.id, settlementEntryId: wageEntry.id },
      advance: { debtAccountId: f.advanceCash.advance!.debtAccountId, debtEntryId: f.advanceCash.advance!.debtEntryId, settlementEntryId: advanceEntry.id } })).toThrow("Payroll offset source link mismatch");
    expect(f.offsets.listOffsets(f.employeeId)).toEqual([]);
  });

  it("refuses direct attribution to an opening advance without a reviewed source provider", () => {
    const f = fixture(key);
    const wageOriginal = f.service.registerEarning({ ...f.audit, requestId: "real-wage", earningId: f.earning.id })!;
    const wageEntry = f.finance.forProducer({ type: "PAYROLL_EARNINGS", id: f.earning.id }).recordSettlement({ requestId: randomUUID(), debtEntryId: wageOriginal.id, amountDzd: "2000.00", currency: "DZD" });
    const openingId = randomUUID(); const opening = f.finance.forProducer({ type: "PAYROLL_OPENING", id: openingId });
    const original = opening.postEntry({ requestId: randomUUID(), debtAccountId: f.advanceCash.advance!.debtAccountId, entryType: "ADJUSTMENT", signedAmountDzd: "5000.00", currency: "DZD" });
    const advanceEntry = opening.recordSettlement({ requestId: randomUUID(), debtEntryId: original.id, amountDzd: "2000.00", currency: "DZD" });
    expect(() => f.offsets.saveOffset({ id: randomUUID(), employeeId: f.employeeId, currency: "DZD", amount: "2000.00", settlementDate: paidAt, ...f.audit, createdAt: now,
      wageSource: { kind: "EARNING", id: f.earning.id }, advanceSource: { kind: "OPENING_ADVANCE", id: openingId },
      wage: { debtAccountId: wageOriginal.debtAccountId, debtEntryId: wageOriginal.id, settlementEntryId: wageEntry.id },
      advance: { debtAccountId: original.debtAccountId, debtEntryId: original.id, settlementEntryId: advanceEntry.id } })).toThrow("Payroll offset source link mismatch");
    expect(f.offsets.listOffsets(f.employeeId)).toEqual([]);
  });

  it("refuses an existing offset after its approved earning source is corrupted", () => {
    const f = fixture(key); const result = f.service.offsetAdvance(f.input);
    f.db.prepare("UPDATE employee_earning SET total_minor=? WHERE id=?").run(900000n, f.earning.id);
    expect(() => f.offsets.getOffset(result.id)).toThrow("Payroll offset source link mismatch");
    expect(() => f.offsets.listOffsets(f.employeeId)).toThrow("Payroll offset source link mismatch");
  });

  it("refuses offsets larger than wages even if the advance has enough remaining", () => {
    const f = fixture(key, "1000.00", "5000.00");
    expect(() => f.service.offsetAdvance(f.input)).toThrow(/remaining/);
    expect(f.sources.getEarning(f.earning.id)?.original).toBeNull();
    expect(f.offsets.listOffsets(f.employeeId)).toEqual([]);
  });

  it("prevents duplicate, cash or repayment attribution and immutable history replacement", () => {
    const f = fixture(key); const result = f.service.offsetAdvance(f.input);
    expect(() => f.offsets.saveOffset({ ...result, id: randomUUID() })).toThrow();
    expect(() => f.cash.saveCash({ id: randomUUID(), employeeId: f.employeeId, currency: "DZD", amount: result.amount, paymentDate: paidAt, ...f.audit, createdAt: now,
      wageAllocations: [{ id: "row", source: result.wageSource, amount: result.amount, debtAccountId: result.wage.debtAccountId, debtEntryId: result.wage.debtEntryId, paymentEntryId: result.wage.settlementEntryId }], advance: null })).toThrow();
    expect(() => f.cash.saveSettlement({ id: randomUUID(), employeeId: f.employeeId, currency: "DZD", amount: result.amount, paymentDate: paidAt, ...f.audit, createdAt: now,
      source: result.advanceSource, debtAccountId: result.advance.debtAccountId, debtEntryId: result.advance.debtEntryId, paymentEntryId: result.advance.settlementEntryId })).toThrow();
    const paid = f.service.recordCash({ ...f.audit, requestId: "cash-for-reuse", employeeId: f.employeeId, amount: "1000.00", paymentDate: paidAt, wages: [{ earningId: f.earning.id, amount: "1000.00" }] });
    expect(() => f.offsets.saveOffset({ ...result, id: randomUUID(), amount: "1000.00", wage: { ...result.wage, settlementEntryId: paid.wageAllocations[0]!.paymentEntryId } })).toThrow();
    f.db.pragma("recursive_triggers=OFF");
    expect(() => f.db.exec("UPDATE employee_salary_advance_offset SET amount_minor=1")).toThrow();
    expect(() => f.db.exec("DELETE FROM employee_salary_advance_offset")).toThrow();
    expect(() => f.db.exec("INSERT OR REPLACE INTO employee_salary_advance_offset SELECT * FROM employee_salary_advance_offset")).toThrow();
    expect(f.offsets.getOffset(result.id)).toEqual(result);
  });

  it.each(["wage", "advance"] as const)("refuses a corrupted %s leg on direct and collection reads", leg => {
    const f = fixture(key); const result = f.service.offsetAdvance(f.input);
    const producer = f.finance.forProducer({ type: leg === "wage" ? "PAYROLL_EARNINGS" : "PAYROLL_ADVANCE", id: leg === "wage" ? f.earning.id : f.advanceCash.advance!.id });
    producer.voidEntry({ requestId: randomUUID(), entryId: result[leg].settlementEntryId, voidReason: "Corruption probe" });
    expect(() => f.offsets.getOffset(result.id)).toThrow("Payroll offset source link mismatch");
    expect(() => f.offsets.listOffsets(f.employeeId)).toThrow("Payroll offset source link mismatch");
  });

  it("refuses an oversized corrupted offset collection before hydrating any invalid link", () => {
    const f = fixture(key); const result = f.service.offsetAdvance(f.input);
    const linkTrigger = payrollOffsetSchemaStatements.find(sql => sql.startsWith("CREATE TRIGGER payroll_offset_link_insert"))!;
    // Simulate untrusted persisted rows in this disposable fixture, then restore
    // the canonical schema before reading. No application database is touched.
    f.db.exec("DROP TRIGGER payroll_offset_link_insert");
    f.db.pragma("foreign_keys=OFF");
    const columns = f.db.pragma("table_info(employee_salary_advance_offset)") as { name: string }[];
    const replaced = new Set(["id", "wage_settlement_entry_id", "advance_settlement_entry_id"]);
    const insert = f.db.prepare(`INSERT INTO employee_salary_advance_offset SELECT ${columns.map(column => replaced.has(column.name) ? "?" : column.name).join(",")} FROM employee_salary_advance_offset WHERE id=?`);
    f.db.transaction(() => {
      for (let index = 0; index < 10000; index++) insert.run(`corrupt-offset-${index}`, `missing-wage-${index}`, `missing-advance-${index}`, result.id);
    }).immediate();
    f.db.pragma("foreign_keys=ON"); f.db.exec(linkTrigger);
    const restored = new SqlitePayrollOffsetRepository(f.db, f.lock);
    expect(restored.getOffset(result.id)).toEqual(result);
    expect(() => restored.listOffsets(f.employeeId)).toThrow("Payroll offset materialization limit exceeded");
  }, 30000);

  it("records the isolated Money2 inventory without changing normal initializer fields", () => {
    const f = fixture(key);
    const tables = ["employee_salary_cash", "employee_salary_payment_allocation", "employee_salary_advance", "employee_salary_settlement", "employee_salary_advance_offset"];
    const actualTables = (f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'employee_salary_%'").all() as { name: string }[]).map(row => row.name);
    expect(actualTables.sort()).toEqual([...tables].sort());
    const fields = tables.flatMap(table => (f.db.pragma(`table_info(${table})`) as { name: string; type: string }[]).filter(column => column.type === "REAL" || /_(minor|units)$/.test(column.name)).map(column => ({ field: `${table}.${column.name}`, type: column.type })));
    expect(fields).toEqual(tables.map(table => ({ field: `${table}.amount_minor`, type: "INTEGER" })));
  });

  it("attests offset schema and shares transaction identity without enabling production storage", () => {
    const f = fixture(key);
    expect(() => new PayrollService(f.finance, f.cash, f.sources, { id: randomUUID, now: () => now }, new SqlitePayrollOffsetRepository(f.db, createFifoLock()))).toThrow(/connection|FIFO/);
    expect(() => f.offsets.withTransaction(async () => undefined)).toThrow(/synchronous/);
    expect(() => f.offsets.withTransaction(() => Promise.resolve())).toThrow(/synchronous/);
    const amount = (f.db.pragma("table_info(employee_salary_advance_offset)") as { name: string; type: string }[]).find(column => column.name === "amount_minor");
    expect(amount?.type).toBe("INTEGER");
    f.db.exec("DROP TRIGGER payroll_offset_link_insert");
    expect(() => new SqlitePayrollOffsetRepository(f.db, f.lock)).toThrow(/schema/);
  });
});
