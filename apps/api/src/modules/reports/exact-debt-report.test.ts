import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { ensureFreshExactApplicationSchema } from "../../infrastructure/database/fresh-exact-schema";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { createFinancialDependencies } from "../../app/financial-dependencies";
import { SqliteExactDebtReportSnapshot } from "./exact-debt-report-snapshot";
import { ExactDebtReportReader } from "./exact-debt-report";
import type { BetterSqliteDatabase } from "../../types/sqlite";
const connections: BetterSqliteDatabase[] = [];
afterEach(() => { for (const db of connections.splice(0)) db.close(); });
const partyId = "00000000-0000-4000-8000-000000000999";
async function harness(key = "") {
  const db = createDatabaseConnection(join(mkdtempSync(join(tmpdir(), "558-report-")), "app.sqlite"), key);
  connections.push(db);
  await ensureFreshExactApplicationSchema(db);
  db.prepare("INSERT INTO external_counterparty(id,full_name,phone_number,created_at,updated_at) VALUES (?, 'Party','123',?,?)").run(partyId, "2026-01-01", "2026-01-01");
  const lock = createFifoLock();
  let now = "2026-01-01T00:00:00.000Z";
  const services = createFinancialDependencies(db, lock, { id: () => crypto.randomUUID(), now: () => now });
  const reader = new ExactDebtReportReader(new SqliteExactDebtReportSnapshot(db, lock, services.financeRepository), () => "2026-03-02T00:00:00.000Z");
  const account = (direction: "PAYABLE" | "RECEIVABLE", amount: string) => services.finance.createAccount({ requestId: crypto.randomUUID(), partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: partyId, direction, openingBalanceDzd: amount });
  return { db, lock, services, reader, account, setNow: (value: string) => { now = value; } };
}
describe("exact debt report native snapshot", () => {
  it.each(["", "report-key"])("preserves both directions, wide aggregates and source rows (%s)", async key => {
    const h = await harness(key);
    h.account("PAYABLE", "92233720368547758.07");
    h.account("RECEIVABLE", "92233720368547758.07");
    const before = h.db.serialize();
    const report = h.reader.generate({});
    expect(report.summary).toEqual({ totalOutstandingDzd: "184467440737095516.14", totalSettledDzd: "0.00", overdueDzd: "184467440737095516.14", partyCount: 1 });
    expect(report.byParty[0]?.outstandingDzd).toBe("184467440737095516.14");
    expect(report.generatedAt).toBe("2026-03-02T00:00:00.000Z");
    expect(h.db.serialize()).toEqual(before);
  });
  it("uses inclusive window membership, current balances and exactly the 59/60-day boundary", async () => {
    const h = await harness(); h.account("PAYABLE", "10.01");
    const day59 = h.reader.generate({ startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-03-01T00:00:00.000Z" });
    expect(day59.summary.overdueDzd).toBe("0.00");
    expect(day59.agingBreakdown[1]?.amountDzd).toBe("10.01");
    expect(h.reader.generate({ endDate: "2026-03-02T00:00:00.000Z" }).agingBreakdown[2]?.amountDzd).toBe("10.01");
    expect(h.reader.generate({ startDate: "2026-01-01T00:00:00.001Z" }).summary).toEqual({ totalOutstandingDzd: "0.00", totalSettledDzd: "0.00", overdueDzd: "0.00", partyCount: 0 });
  });
  it("includes producer originals, corrections and noncash offsets but excludes voided effects", async () => {
    const h = await harness(); const a = h.account("PAYABLE", "0");
    const producer = h.services.finance.forProducer({ type: "PAYROLL_EARNINGS", id: partyId });
    const first = producer.postEntry({ requestId: "first", debtAccountId: a.id, entryType: "OPENING", signedAmountDzd: "10.00" });
    h.setNow("2026-01-02T00:00:00.000Z");
    producer.recordPayment({ requestId: "pay", debtEntryId: first.id, amountDzd: "3.00" });
    producer.correctEntry({ requestId: "correct", entryId: first.id, amountDzd: "8.00", reason: "Correct total" });
    expect(h.reader.generate({}).summary.totalOutstandingDzd).toBe("5.00");
    producer.settleAccount({ requestId: "settle", debtAccountId: a.id });
    expect(h.reader.generate({}).summary).toMatchObject({ totalOutstandingDzd: "0.00", totalSettledDzd: "5.00" });
    producer.voidEntry({ requestId: "void", entryId: first.id, voidReason: "Cancel" });
    expect(h.reader.generate({}).summary.partyCount).toBe(0);
  });
  it("refuses a foreign FIFO holder and mismatched transaction identity", async () => {
    const h = await harness();
    expect(() => new SqliteExactDebtReportSnapshot(h.db, createFifoLock(), h.services.financeRepository)).toThrow(/same connection/);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const holding = h.lock.run(async () => { started(); await gate; });
    await ready;
    try { expect(() => h.reader.generate({})).toThrow(/busy|held|lock/i); } finally { release(); await holding; }
  });
  it("keeps payment aging separate from corrections and counts cash-only payoff as zero SETTLEMENT money", async () => {
    const h = await harness(); const a = h.account("PAYABLE", "10.00");
    const target = h.services.finance.listEntries(a.id)[0]!;
    h.setNow("2026-02-01T00:00:00.000Z");
    h.services.finance.recordPayment({ requestId: "partial", debtEntryId: target.id, amountDzd: "3.00" });
    h.setNow("2026-03-01T00:00:00.000Z");
    h.services.finance.correctEntry({ requestId: "adjust", entryId: target.id, amountDzd: "9.00", reason: "Agreement" });
    const report = h.reader.generate({ startDate: "2026-02-01T00:00:00.000Z", endDate: "2026-02-01T00:00:00.000Z" });
    expect(report.summary.totalOutstandingDzd).toBe("6.00");
    expect(report.byParty[0]?.lastTransaction).toBe("2026-03-01T00:00:00.000Z");
    expect(report.topDebtors[0]?.daysSinceLastPayment).toBe(0);
    expect(h.reader.generate({}).topDebtors[0]?.daysSinceLastPayment).toBe(29);
    h.services.finance.recordPayment({ requestId: "finish", debtEntryId: target.id, amountDzd: "6.00" });
    expect(h.reader.generate({}).summary.totalSettledDzd).toBe("0.00");
  });
  it("sorts wide amounts without numeric conversion and resolves worker names", async () => {
    const h = await harness();
    const role = h.db.prepare("SELECT id FROM role WHERE key='worker'").get() as { id: string };
    h.db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES (?, 'Worker','Name','555',?,'ACTIVE','2026-01-01','2026-01-01')").run(partyId, role.id);
    h.services.finance.createAccount({ requestId: "worker", partyType: "INTERNAL_WORKER", workerId: partyId, direction: "PAYABLE", openingBalanceDzd: "90071992547409.93" });
    h.account("PAYABLE", "90071992547409.92");
    const result = h.reader.generate({});
    expect(result.summary.partyCount).toBe(2);
    expect(result.byParty.map(p => p.partyName)).toEqual(["Worker Name", "Party"]);
    expect(result.topDebtors.map(p => p.amountDzd)).toEqual(["90071992547409.93", "90071992547409.92"]);
  });
  it("preserves signed original obligations and absolute noncash settlement amounts", async () => {
    const h = await harness(); const a = h.account("PAYABLE", "0");
    h.services.finance.postEntry({ requestId: "negative", debtAccountId: a.id, entryType: "ADJUSTMENT", signedAmountDzd: "-7.01" });
    expect(h.reader.generate({}).summary.totalOutstandingDzd).toBe("-7.01");
    expect(h.reader.generate({}).topDebtors).toEqual([]);
    h.services.finance.settleAccount({ requestId: "offset", debtAccountId: a.id });
    expect(h.reader.generate({}).summary.totalSettledDzd).toBe("7.01");
  });
  it("rejects entry history above the budget before reading accounts", async () => {
    const h = await harness(); const a = h.account("PAYABLE", "0");
    h.db.prepare("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10001) INSERT INTO debt_entry(id,debt_account_id,currency,posting_sequence,entry_type,entry_date,signed_amount_minor,balance_after_minor,status,created_at,updated_at) SELECT 'entry'||x,?,'DZD',x,'ADJUSTMENT','2026-01-01',1,x,'LIVE','2026-01-01','2026-01-01' FROM n").run(a.id);
    const spy = vi.spyOn(h.services.financeRepository, "listAccounts");
    expect(() => h.reader.generate({})).toThrow(/resource limit/);
    expect(spy).not.toHaveBeenCalled();
  });
  it("checks the whole row budget before hydrating any prefix", async () => {
    const h = await harness();
    h.db.exec("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10001) INSERT INTO external_counterparty(id,full_name,phone_number,created_at,updated_at) SELECT 'p'||x,'P','123','2026-01-01','2026-01-01' FROM n");
    h.db.exec("INSERT INTO debt_account(id,party_type,external_counterparty_id,direction,currency,current_balance_minor,status,created_at,updated_at) SELECT id,'EXTERNAL_COUNTERPARTY',id,'PAYABLE','DZD',0,'SETTLED','2026-01-01','2026-01-01' FROM external_counterparty WHERE id LIKE 'p%'");
    const spy = vi.spyOn(h.services.financeRepository, "listAccounts");
    expect(() => h.reader.generate({})).toThrow(/resource limit/);
    expect(spy).not.toHaveBeenCalled();
  });
});
