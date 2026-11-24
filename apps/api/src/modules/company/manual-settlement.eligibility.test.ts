import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { ExactFinanceService } from "./exact-finance.service";
import { SqliteExactFinanceRepository } from "./adapters/sqlite-exact-finance.repository";
import { exactDebtSchemaStatements } from "./adapters/exact-finance-schema";
import { SqliteManualSettlementRepository } from "./adapters/sqlite-manual-settlement.repository";
import { manualSettlementSchemaStatements } from "./adapters/manual-settlement-schema";
import { ManualSettlementService } from "./manual-settlement.service";

function fixture() {
  const db = createDatabaseConnection(":memory:", "");
  const party = randomUUID();
  const other = randomUUID();
  const worker = randomUUID();
  const invoice = randomUUID();
  db.pragma("foreign_keys=ON");
  db.exec("CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY)");
  for (const id of [party, other]) db.prepare("INSERT INTO external_counterparty VALUES (?)").run(id);
  db.prepare("INSERT INTO employee VALUES (?)").run(worker);
  db.prepare("INSERT INTO invoice VALUES (?)").run(invoice);
  for (const sql of [...exactDebtSchemaStatements, ...manualSettlementSchemaStatements]) db.exec(sql);
  const lock = createFifoLock();
  const ledger = new SqliteExactFinanceRepository(db, lock);
  const dependencies = { id: randomUUID, now: () => "2026-11-10T00:00:00.000Z" };
  const finance = new ExactFinanceService(ledger, dependencies);
  const repository = new SqliteManualSettlementRepository(db, lock);
  const service = new ManualSettlementService(finance, ledger, repository, { authorize: () => ({ actorUserId: "operator", actorLabel: "Operator" }) }, dependencies);
  const account = (direction: "PAYABLE" | "RECEIVABLE", externalCounterpartyId = party) => finance.createAccount({ requestId: randomUUID(), partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId, direction });
  const payable = account("PAYABLE");
  const receivable = account("RECEIVABLE");
  const post = (accountId: string, amount = "100.00") => finance.postEntry({ requestId: randomUUID(), debtAccountId: accountId, entryType: "ADJUSTMENT", signedAmountDzd: amount });
  const p = post(payable.id);
  const r = post(receivable.id, "60.00");
  const input = { requestId: "confirm", currency: "DZD" as const, externalCounterpartyId: party, payableOriginalEntryId: p.id, receivableOriginalEntryId: r.id, amountDzd: "25.00", expectedPayableRemainingDzd: "100.00", expectedReceivableRemainingDzd: "60.00" };
  const snapshot = () => ({ accounts: finance.listAccounts(), entries: finance.listAccounts().flatMap(row => finance.listEntries(row.id)), linked: db.prepare("SELECT COUNT(*) AS count FROM manual_debt_settlement").get(), reversals: db.prepare("SELECT COUNT(*) AS count FROM manual_debt_settlement_reversal").get(), receipts: db.prepare("SELECT COUNT(*) AS count FROM exact_finance_command").get() });
  return { db, party, other, worker, invoice, account, post, finance, repository, service, payable, receivable, p, r, input, snapshot };
}

it("refuses wrong party, direction, worker, derived, voided, credit and producer originals without changes", () => {
  const f = fixture();
  try {
    const wrongParty = f.post(f.account("PAYABLE", f.other).id);
    const wrongDirection = f.post(f.receivable.id);
    const workerAccount = f.finance.createAccount({ requestId: randomUUID(), partyType: "INTERNAL_WORKER", workerId: f.worker, direction: "PAYABLE" });
    const worker = f.post(workerAccount.id);
    const derived = f.finance.recordPayment({ requestId: randomUUID(), debtEntryId: f.p.id, amountDzd: "1.00" });
    const correction = f.finance.correctEntry({ requestId: randomUUID(), entryId: f.p.id, amountDzd: "101.00", reason: "Correct amount" });
    const voided = f.post(f.payable.id);
    f.finance.voidEntry({ requestId: randomUUID(), entryId: voided.id, voidReason: "Cancelled original" });
    const credit = f.post(f.payable.id, "-10.00");
    const producer = f.finance.forProducer({ type: "INVOICE", id: f.invoice }).postEntry({ requestId: randomUUID(), debtAccountId: f.payable.id, invoiceId: f.invoice, entryType: "ADJUSTMENT", signedAmountDzd: "100.00" });
    const exhausted = f.post(f.payable.id, "1.00");
    f.finance.recordPayment({ requestId: randomUUID(), debtEntryId: exhausted.id, amountDzd: "1.00" });
    expect(f.service.candidates({ externalCounterpartyId: f.party }).map(row => row.id).sort()).toEqual([f.p.id, f.r.id, wrongDirection.id].sort());
    for (const original of [wrongParty, wrongDirection, worker, derived, correction, voided, credit, producer]) {
      const before = f.snapshot();
      expect(() => f.service.confirm({ ...f.input, requestId: randomUUID(), payableOriginalEntryId: original.id })).toThrow();
      expect(f.snapshot()).toEqual(before);
    }
    for (const change of [{ expectedPayableRemainingDzd: "99.00" }, { expectedReceivableRemainingDzd: "59.00" }]) {
      const before = f.snapshot();
      expect(() => f.service.confirm({ ...f.input, ...change, requestId: randomUUID() })).toThrow(/Stale/);
      expect(f.snapshot()).toEqual(before);
    }
  } finally { f.db.close(); }
});

it.each(["PAYABLE", "RECEIVABLE"] as const)("refuses an amount exceeding only the %s original without receipts or postings", direction => {
  const f = fixture();
  try {
    f.finance.recordPayment({ requestId: randomUUID(), debtEntryId: direction === "PAYABLE" ? f.p.id : f.r.id, amountDzd: direction === "PAYABLE" ? "90.00" : "50.00" });
    const before = f.snapshot();
    const input = { ...f.input, requestId: randomUUID(), expectedPayableRemainingDzd: direction === "PAYABLE" ? "10.00" : "100.00", expectedReceivableRemainingDzd: direction === "RECEIVABLE" ? "10.00" : "60.00" };
    const preview = { currency: input.currency, externalCounterpartyId: input.externalCounterpartyId, payableOriginalEntryId: input.payableOriginalEntryId, receivableOriginalEntryId: input.receivableOriginalEntryId, amountDzd: input.amountDzd };
    expect(() => f.service.preview(preview)).toThrow(/exceeds remaining/i);
    expect(() => f.service.confirm(input)).toThrow(/exceeds remaining/i);
    expect(f.snapshot()).toEqual(before);
    expect(f.finance.remaining(f.p.id)).toBe(input.expectedPayableRemainingDzd);
    expect(f.finance.remaining(f.r.id)).toBe(input.expectedReceivableRemainingDzd);
  } finally { f.db.close(); }
});

it("refuses reversal atomically when an intervening posting fills one account's int64 capacity", () => {
  const f = fixture();
  try {
    const result = f.service.confirm(f.input);
    f.post(f.receivable.id, "92233720368547722.07");
    expect(f.finance.getAccount(f.receivable.id).currentBalance).toBe("92233720368547757.07");
    const before = f.snapshot();
    expect(() => f.service.reverse({ requestId: "reverse-overflow", settlementId: result.settlement.id, reason: "Wrong pair" })).toThrow(/bounds/);
    expect(f.snapshot()).toEqual(before);
    expect(f.repository.getReversal(result.settlement.id)).toBeNull();
    expect(f.finance.remaining(f.p.id)).toBe("75.00");
    expect(f.finance.remaining(f.r.id)).toBe("35.00");
  } finally { f.db.close(); }
});
