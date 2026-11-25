import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { ExactFinanceService } from "./exact-finance.service";
import { SqliteExactFinanceRepository } from "./adapters/sqlite-exact-finance.repository";
import { exactDebtSchemaStatements } from "./adapters/exact-finance-schema";
import { SqliteManualSettlementRepository } from "./adapters/sqlite-manual-settlement.repository";
import { manualSettlementSchemaStatements } from "./adapters/manual-settlement-schema";
import { ManualSettlementService } from "./manual-settlement.service";

it.each(["", "613-public-concurrency-key"])("reserves before reads and rejects a stale independent-connection contender, key=%s", key => {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-613-race-")), "fixture.sqlite");
  const db = createDatabaseConnection(path, key);
  const second = createDatabaseConnection(path, key);
  const party = randomUUID();
  const actor = { actorUserId: randomUUID(), actorLabel: "Operator" };
  const granted = new Set(["debts:read", "debts:settle", "debts:update"]);
  const dependencies = { id: randomUUID, now: () => "2026-11-10T00:00:00.000Z" };
  let onFirstAuthorization: (() => void) | undefined;
  const compose = (connection: typeof db, firstConnection = false) => {
    const lock = createFifoLock();
    const ledger = new SqliteExactFinanceRepository(connection, lock);
    const finance = new ExactFinanceService(ledger, dependencies);
    const repository = new SqliteManualSettlementRepository(connection, lock);
    const service = new ManualSettlementService(finance, ledger, repository, {
      authorize: required => {
        if (firstConnection) onFirstAuthorization?.();
        if (!required.every(permission => granted.has(permission))) throw new Error("FORBIDDEN");
        return actor;
      },
    }, dependencies);
    return { finance, ledger, repository, service };
  };
  try {
    db.pragma("foreign_keys=ON");
    second.pragma("foreign_keys=ON");
    second.pragma("busy_timeout=1");
    db.exec("CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY); CREATE TABLE cash_probe(amount INTEGER); INSERT INTO cash_probe VALUES (12345)");
    db.prepare("INSERT INTO external_counterparty VALUES (?)").run(party);
    for (const sql of [...exactDebtSchemaStatements, ...manualSettlementSchemaStatements]) db.exec(sql);
    const first = compose(db, true);
    const other = compose(second);
    const payable = first.finance.createAccount({ requestId: "payable", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party, direction: "PAYABLE", openingBalanceDzd: "100.00" });
    const receivable = first.finance.createAccount({ requestId: "receivable", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party, direction: "RECEIVABLE", openingBalanceDzd: "60.00" });
    const p = first.finance.listEntries(payable.id)[0]!.id;
    const r = first.finance.listEntries(receivable.id)[0]!.id;
    const input = { requestId: "winner", currency: "DZD" as const, externalCounterpartyId: party, payableOriginalEntryId: p, receivableOriginalEntryId: r, amountDzd: "25.00", expectedPayableRemainingDzd: "100.00", expectedReceivableRemainingDzd: "60.00" };
    const contender = { ...input, requestId: "contender" };
    let attempted = false;
    onFirstAuthorization = () => {
      if (attempted) return;
      attempted = true;
      expect(() => other.service.confirm(contender)).toThrow(/locked|busy/i);
    };
    first.service.confirm(input);
    expect(attempted).toBe(true);
    expect(() => other.service.confirm(contender)).toThrow(/stale/i);
    for (const finance of [first.finance, other.finance]) {
      expect(finance.remaining(p)).toBe("75.00");
      expect(finance.remaining(r)).toBe("35.00");
    }
    for (const ledger of [first.ledger, other.ledger]) {
      expect(ledger.getAggregateCommand(JSON.stringify(["MANUAL_SETTLEMENT", party, "contender"]))).toBeNull();
      expect(ledger.getAggregateCommand(JSON.stringify(["MANUAL_SETTLEMENT", party, "winner"]))).not.toBeNull();
    }
    for (const connection of [db, second]) {
      expect(connection.prepare("SELECT id FROM manual_debt_settlement").all()).toHaveLength(1);
      expect(connection.prepare("SELECT COUNT(*) AS count FROM exact_finance_command").get()).toEqual({ count: 1 });
      expect(connection.prepare("SELECT amount FROM cash_probe").all()).toEqual([{ amount: 12345 }]);
    }
  } finally {
    second.close();
    db.close();
  }
});
