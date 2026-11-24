import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createDatabaseConnection } from "../../../infrastructure/database/factory";
import { createFifoLock } from "../../../infrastructure/database/fifo-lock";
import { ExactFinanceService } from "../exact-finance.service";
import { SqliteExactFinanceRepository } from "./sqlite-exact-finance.repository";
import { exactDebtSchemaStatements } from "./exact-finance-schema";
import { SqliteManualSettlementRepository } from "./sqlite-manual-settlement.repository";
import { manualSettlementSchemaStatements } from "./manual-settlement-schema";

it("persists exact linked ledger rows beyond safe Number precision, reopens, and refuses invalid links", () => {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-613-storage-")), "fixture.sqlite");
  let db = createDatabaseConnection(path, "");
  const party = randomUUID();
  try {
    db.pragma("foreign_keys=ON");
    db.exec("CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY)");
    db.prepare("INSERT INTO external_counterparty VALUES (?)").run(party);
    for (const sql of [...exactDebtSchemaStatements, ...manualSettlementSchemaStatements]) db.exec(sql);
    const lock = createFifoLock();
    const ledger = new SqliteExactFinanceRepository(db, lock);
    const finance = new ExactFinanceService(ledger, { id: randomUUID, now: () => "2026-11-10T00:00:00.000Z" });
    const originals = (["PAYABLE", "RECEIVABLE"] as const).map(direction => {
      const account = finance.createAccount({ requestId: direction, partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party, direction, openingBalanceDzd: "90071992547409.93" });
      return finance.listEntries(account.id)[0]!;
    });
    const postings = originals.map(original => ({ ...original, id: randomUUID(), postingSequence: 2, entryType: "SETTLEMENT" as const, targetEntryId: original.id, signedAmountDzd: "-90071992547409.93", balanceAfterDzd: "0.00" }));
    postings.forEach(posting => ledger.saveEntry(posting));
    let repo = new SqliteManualSettlementRepository(db, lock);
    const row = { id: randomUUID(), externalCounterpartyId: party, currency: "DZD" as const, payableOriginalEntryId: originals[0]!.id, receivableOriginalEntryId: originals[1]!.id, payableSettlementEntryId: postings[0]!.id, receivableSettlementEntryId: postings[1]!.id, amountDzd: "90071992547409.93", recordedAt: "2026-11-10T00:00:00.000Z", actorUserId: randomUUID(), actorLabel: "Operator", note: null };
    expect(() => repo.insertSettlement({ ...row, payableSettlementEntryId: originals[0]!.id })).toThrow(/link/i);
    for (const change of [
      { amountDzd: "0.00" }, { amountDzd: "90071992547409.92" },
      { payableOriginalEntryId: originals[1]!.id }, { externalCounterpartyId: randomUUID() },
      { receivableSettlementEntryId: postings[0]!.id },
    ]) expect(() => repo.insertSettlement({ ...row, ...change })).toThrow();
    expect(repo.getSettlement(row.id)).toBeNull();
    expect(() => repo.withTransaction(() => { repo.insertSettlement(row); throw new Error("Outer rollback"); })).toThrow(/Outer rollback/);
    expect(repo.getSettlement(row.id)).toBeNull();
    repo.insertSettlement(row);
    expect(repo.getSettlement(row.id)).toEqual(row);
    expect(() => db.prepare("UPDATE manual_debt_settlement SET note='changed' WHERE id=?").run(row.id)).toThrow(/immutable/);
    const reversalPostings = originals.map(original => ({ ...original, id: randomUUID(), postingSequence: 3, entryType: "ADJUSTMENT" as const, targetEntryId: original.id }));
    reversalPostings.forEach(posting => ledger.saveEntry(posting));
    const reversal = { id: randomUUID(), settlementId: row.id, payableReversalEntryId: reversalPostings[0]!.id, receivableReversalEntryId: reversalPostings[1]!.id, recordedAt: row.recordedAt, actorUserId: row.actorUserId, actorLabel: row.actorLabel, reason: "Wrong pair" };
    expect(() => repo.insertReversal({ ...reversal, payableReversalEntryId: postings[0]!.id })).toThrow(/linkage/);
    expect(repo.getReversal(row.id)).toBeNull();
    repo.insertReversal(reversal);
    expect(() => repo.insertReversal({ ...reversal, id: randomUUID() })).toThrow();
    db.close();
    db = createDatabaseConnection(path, "");
    repo = new SqliteManualSettlementRepository(db, createFifoLock());
    expect(repo.getSettlement(row.id)).toEqual(row);
    expect(repo.getReversal(row.id)).toEqual(reversal);
  } finally { db.close(); }
});
