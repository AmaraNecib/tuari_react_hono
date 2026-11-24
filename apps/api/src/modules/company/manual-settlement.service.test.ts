import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { ExactFinanceService } from "./exact-finance.service";
import { SqliteExactFinanceRepository } from "./adapters/sqlite-exact-finance.repository";
import { exactDebtSchemaStatements } from "./adapters/exact-finance-schema";
import { SqliteManualSettlementRepository } from "./adapters/sqlite-manual-settlement.repository";
import { manualSettlementSchemaStatements } from "./adapters/manual-settlement-schema";
import { ManualSettlementService } from "./manual-settlement.service";

it("settles both manual originals once across reopen and restores both recorded portions", () => {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-613-service-")), "fixture.sqlite");
  let db = createDatabaseConnection(path, "");
  const party = randomUUID();
  let actor = { actorUserId: randomUUID(), actorLabel: "Operator" };
  let permitted = true;
  const granted = new Set(["debts:read", "debts:settle", "debts:update"]);
  const dependencies = { id: randomUUID, now: () => "2026-11-10T00:00:00.000Z" };
  const compose = () => {
    const lock = createFifoLock();
    const ledger = new SqliteExactFinanceRepository(db, lock);
    const finance = new ExactFinanceService(ledger, dependencies);
    const repository = new SqliteManualSettlementRepository(db, lock);
    const service = new ManualSettlementService(finance, ledger, repository, { authorize: required => { if (!permitted || !required.every(permission => granted.has(permission))) throw new Error("FORBIDDEN"); return actor; } }, dependencies);
    return { finance, ledger, repository, service };
  };
  try {
    db.pragma("foreign_keys=ON");
    db.exec("CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY); CREATE TABLE cash_probe(amount INTEGER); INSERT INTO cash_probe VALUES (12345)");
    db.prepare("INSERT INTO external_counterparty VALUES (?)").run(party);
    for (const sql of [...exactDebtSchemaStatements, ...manualSettlementSchemaStatements]) db.exec(sql);
    let f = compose();
    expect(() => new ManualSettlementService(f.finance, f.ledger, f.repository, { transactionIdentity: { connection: db, lock: createFifoLock() }, authorize: () => actor }, dependencies)).toThrow(/same connection and shared FIFO/);
    const payable = f.finance.createAccount({ requestId: "payable", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party, direction: "PAYABLE", openingBalanceDzd: "100.00" });
    const receivable = f.finance.createAccount({ requestId: "receivable", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party, direction: "RECEIVABLE", openingBalanceDzd: "60.00" });
    const p = f.finance.listEntries(payable.id)[0]!.id;
    const r = f.finance.listEntries(receivable.id)[0]!.id;
    const input = { requestId: "confirm", currency: "DZD" as const, externalCounterpartyId: party, payableOriginalEntryId: p, receivableOriginalEntryId: r, amountDzd: "25.00", expectedPayableRemainingDzd: "100.00", expectedReceivableRemainingDzd: "60.00" };
    const previewInput = { externalCounterpartyId: party, payableOriginalEntryId: p, receivableOriginalEntryId: r, currency: "DZD" as const, amountDzd: "25.00" };
    expect(f.service.candidates({ externalCounterpartyId: party })).toEqual(expect.arrayContaining([
      { id: p, debtAccountId: payable.id, direction: "PAYABLE", postingSequence: 1, remainingDzd: "100.00" },
      { id: r, debtAccountId: receivable.id, direction: "RECEIVABLE", postingSequence: 1, remainingDzd: "60.00" },
    ]));
    expect(() => f.service.accountHistory({ debtAccountId: "missing-account" })).toThrow(/not found/i);
    expect(() => f.service.preview({ ...previewInput, payableOriginalEntryId: "missing-entry" })).toThrow(/not found/i);
    const snapshot = () => ({ accounts: f.finance.listAccounts(), entries: f.finance.listAccounts().flatMap(account => f.finance.listEntries(account.id)), settlements: db.prepare("SELECT * FROM manual_debt_settlement ORDER BY id").all(), reversals: db.prepare("SELECT * FROM manual_debt_settlement_reversal ORDER BY id").all(), debtReceipts: db.prepare("SELECT * FROM debt_command ORDER BY id").all(), aggregateReceipts: db.prepare("SELECT * FROM exact_finance_command ORDER BY id").all() });
    const beforePreview = snapshot();
    for (const amountDzd of ["61.00", "101.00"]) {
      expect(() => f.service.preview({ ...previewInput, amountDzd })).toThrow(/exceeds remaining/i);
      expect(() => f.service.confirm({ ...input, requestId: randomUUID(), amountDzd })).toThrow(/exceeds remaining/i);
      expect(snapshot()).toEqual(beforePreview);
    }
    expect(() => f.service.reverse({ requestId: "missing", settlementId: "missing", reason: "Missing operation" })).toThrow(/not found/i);
    for (const participant of [
      new SqliteExactFinanceRepository(db, createFifoLock()),
      new SqliteManualSettlementRepository(db, createFifoLock()),
    ]) {
      expect(() => new ManualSettlementService(f.finance,
        participant instanceof SqliteExactFinanceRepository ? participant : f.ledger,
        participant instanceof SqliteManualSettlementRepository ? participant : f.repository,
        { authorize: () => actor }, dependencies)).toThrow(/same connection and shared FIFO/);
    }
    granted.delete("debts:read");
    expect(() => f.service.preview(previewInput)).toThrow(/FORBIDDEN/);
    expect(() => f.service.candidates({ externalCounterpartyId: party })).toThrow(/FORBIDDEN/);
    expect(() => f.service.accountHistory({ debtAccountId: payable.id })).toThrow(/FORBIDDEN/);
    expect(() => f.service.history({ externalCounterpartyId: party })).toThrow(/FORBIDDEN/);
    expect(snapshot()).toEqual(beforePreview);
    granted.add("debts:read");
    expect(f.service.preview(previewInput)).toMatchObject({ payableRemainingDzd: "100.00", receivableRemainingDzd: "60.00", projectedPayableRemainingDzd: "75.00", projectedReceivableRemainingDzd: "35.00" });
    expect(snapshot()).toEqual(beforePreview);
    for (const permission of ["debts:read", "debts:settle"]) {
      granted.delete(permission);
      expect(() => f.service.confirm(input)).toThrow(/FORBIDDEN/);
      expect(f.finance.remaining(p)).toBe("100.00");
      expect(f.finance.remaining(r)).toBe("60.00");
      granted.add(permission);
    }
    const save = f.ledger.saveAggregateCommand.bind(f.ledger);
    f.ledger.saveAggregateCommand = () => { throw new Error("Receipt failure"); };
    expect(() => f.service.confirm(input)).toThrow(/Receipt failure/);
    expect(f.finance.remaining(p)).toBe("100.00");
    expect(f.finance.remaining(r)).toBe("60.00");
    expect(db.prepare("SELECT COUNT(*) AS count FROM manual_debt_settlement").get()).toEqual({ count: 0 });
    f.ledger.saveAggregateCommand = save;
    const saveEntry = f.ledger.saveEntry.bind(f.ledger);
    f.ledger.saveEntry = entry => { if (entry.debtAccountId === receivable.id && entry.entryType === "SETTLEMENT") throw new Error("Second posting failure"); saveEntry(entry); };
    expect(() => f.service.confirm(input)).toThrow(/Second posting failure/);
    expect(f.finance.remaining(p)).toBe("100.00");
    expect(f.finance.remaining(r)).toBe("60.00");
    f.ledger.saveEntry = saveEntry;
    const result = f.service.confirm(input);
    expect(f.finance.remaining(p)).toBe("75.00");
    expect(f.finance.remaining(r)).toBe("35.00");
    const detailRead = vi.spyOn(f.finance, "detail");
    const remainingRead = vi.spyOn(f.finance, "remaining");
    const candidates = f.service.candidates({ externalCounterpartyId: party });
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: p, remainingDzd: "75.00" }),
      expect.objectContaining({ id: r, remainingDzd: "35.00" }),
    ]));
    expect(detailRead).toHaveBeenCalledTimes(2);
    expect(detailRead.mock.calls).toEqual(expect.arrayContaining([[payable.id], [receivable.id]]));
    expect(remainingRead).not.toHaveBeenCalled();
    detailRead.mockRestore(); remainingRead.mockRestore();
    for (const entryId of [p, r, result.settlement.payableSettlementEntryId, result.settlement.receivableSettlementEntryId]) expect(() => f.finance.voidEntry({ requestId: `void-${entryId}`, entryId, voidReason: "Cannot void half" })).toThrow(/Reverse.*first/);
    expect(() => f.service.confirm({ ...input, requestId: "stale" })).toThrow(/stale/i);
    db.close(); db = createDatabaseConnection(path, ""); f = compose();
    expect(f.service.confirm(input)).toEqual(result);
    for (const permission of ["debts:read", "debts:settle"]) {
      granted.delete(permission);
      expect(() => f.service.confirm(input)).toThrow(/FORBIDDEN/);
      granted.add(permission);
    }
    expect(() => f.service.confirm({ ...input, amountDzd: "24.00" })).toThrow(/conflict/i);
    const beforeActor = actor;
    actor = { ...actor, actorUserId: randomUUID() };
    expect(() => f.service.confirm(input)).toThrow(/conflict/i);
    actor = beforeActor;
    permitted = false;
    expect(() => f.service.confirm(input)).toThrow(/FORBIDDEN/);
    permitted = true;
    const reverse = { requestId: "reverse", settlementId: result.settlement.id, reason: "Wrong pair" };
    for (const permission of ["debts:read", "debts:settle", "debts:update"]) {
      granted.delete(permission);
      expect(() => f.service.reverse(reverse)).toThrow(/FORBIDDEN/);
      expect(f.finance.remaining(p)).toBe("75.00");
      expect(f.finance.remaining(r)).toBe("35.00");
      granted.add(permission);
    }
    const saveReverseReceipt = f.ledger.saveAggregateCommand.bind(f.ledger);
    f.ledger.saveAggregateCommand = () => { throw new Error("Reversal receipt failure"); };
    expect(() => f.service.reverse(reverse)).toThrow(/Reversal receipt failure/);
    expect(f.finance.remaining(p)).toBe("75.00");
    expect(f.finance.remaining(r)).toBe("35.00");
    expect(f.repository.getReversal(result.settlement.id)).toBeNull();
    f.ledger.saveAggregateCommand = saveReverseReceipt;
    const reversed = f.service.reverse(reverse);
    expect(f.finance.remaining(p)).toBe("100.00");
    expect(f.finance.remaining(r)).toBe("60.00");
    expect(f.service.reverse(reverse)).toEqual(reversed);
    const afterReversal = snapshot();
    for (const entryId of [reversed.reversal.payableReversalEntryId, reversed.reversal.receivableReversalEntryId, result.settlement.payableSettlementEntryId, result.settlement.receivableSettlementEntryId]) {
      const requestId = `post-reverse-void-${entryId}`;
      expect(() => f.finance.voidEntry({ requestId, entryId, voidReason: "Cannot void linked half" })).toThrow(/linked postings/);
      expect(f.ledger.getEntry(entryId)?.status).toBe("LIVE");
      expect(f.finance.remaining(p)).toBe("100.00");
      expect(f.finance.remaining(r)).toBe("60.00");
      expect(f.ledger.getCommand(requestId)).toBeNull();
      expect(snapshot()).toEqual(afterReversal);
    }
    for (const permission of ["debts:read", "debts:settle", "debts:update"]) {
      granted.delete(permission);
      expect(() => f.service.reverse(reverse)).toThrow(/FORBIDDEN/);
      granted.add(permission);
    }
    expect(() => f.service.reverse({ ...reverse, requestId: "reverse-again" })).toThrow(/reversed/i);
    expect(db.prepare("SELECT amount FROM cash_probe").all()).toEqual([{ amount: 12345 }]);
  } finally { db.close(); }
});
