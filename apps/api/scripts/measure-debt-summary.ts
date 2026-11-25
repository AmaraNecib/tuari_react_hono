import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createDatabaseConnection } from "../src/infrastructure/database/factory";
import { createFifoLock } from "../src/infrastructure/database/fifo-lock";
import { exactDebtSchemaStatements } from "../src/modules/company/adapters/exact-finance-schema";
import { SqliteExactFinanceRepository } from "../src/modules/company/adapters/sqlite-exact-finance.repository";
import { ExactFinanceService } from "../src/modules/company/exact-finance.service";

const implementationBaseSha = "baaca20ef708cdf5dfa31538e609f153254a3fba";
const dir = mkdtempSync(join(tmpdir(), "tuari-debt-summary-measure-"));
const db = createDatabaseConnection(join(dir, "ledger.sqlite"), "");
try {
  db.pragma("foreign_keys=ON");
  db.exec(
    "CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY);",
  );
  for (const sql of exactDebtSchemaStatements) db.exec(sql);

  const repo = new SqliteExactFinanceRepository(db, createFifoLock());
  const service = new ExactFinanceService(repo, {
    id: randomUUID,
    now: () => "2026-11-10T10:00:00.000Z",
  });
  for (let i = 0; i < 1000; i++) {
    const partyId = randomUUID();
    db.prepare("INSERT INTO external_counterparty(id) VALUES (?)").run(partyId);
    service.createAccount({
      partyType: "EXTERNAL_COUNTERPARTY",
      externalCounterpartyId: partyId,
      direction: i % 2 ? "RECEIVABLE" : "PAYABLE",
      requestId: `seed-${i}`,
      openingBalanceDzd: i % 2 ? "20.02" : "10.01",
    });
  }

  const expected = {
    parties: 1000,
    accounts: 1000,
    liveEntries: 1000,
    payable: "5005.00",
    receivable: "10010.00",
  };
  const count = (table: string, where = "") =>
    (db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get() as { count: number }).count;
  const actualCounts = {
    parties: count("external_counterparty"),
    accounts: count("debt_account"),
    liveEntries: count("debt_entry", "WHERE status='LIVE'"),
  };
  if (JSON.stringify(actualCounts) !== JSON.stringify({
    parties: expected.parties,
    accounts: expected.accounts,
    liveEntries: expected.liveEntries,
  })) throw new Error(`dataset count mismatch: ${JSON.stringify(actualCounts)}`);

  const firstStart = performance.now();
  const firstResult = service.summary();
  const firstCallMs = performance.now() - firstStart;
  const validate = (result: typeof firstResult) => {
    if (
      result.accounts.length !== expected.accounts ||
      result.grossPayableDzd !== expected.payable ||
      result.grossReceivableDzd !== expected.receivable
    ) throw new Error(`summary mismatch: ${JSON.stringify({ count: result.accounts.length, payable: result.grossPayableDzd, receivable: result.grossReceivableDzd })}`);
  };
  validate(firstResult);

  for (let i = 0; i < 5; i++) validate(service.summary());
  const samplesMs: number[] = [];
  for (let i = 0; i < 30; i++) {
    const start = performance.now();
    const result = service.summary();
    samplesMs.push(performance.now() - start);
    validate(result);
  }

  const sorted = [...samplesMs].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.ceil(p * sorted.length) - 1]!;
  const sqlite = db.prepare("SELECT sqlite_version() AS version").get() as { version: string };
  console.log(JSON.stringify({
    firstInvocationMs: firstCallMs,
    warmups: 5,
    measuredCalls: 30,
    samplesMs,
    quantileDefinition: "nearest-rank: sorted[ceil(p*n)-1]",
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    minMs: sorted[0],
    maxMs: sorted.at(-1),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: process.env.PROCESSOR_IDENTIFIER ?? "unknown",
      sqlite: sqlite.version,
    },
    dataset: { ...actualCounts, expectedGrossPayableDzd: expected.payable, expectedGrossReceivableDzd: expected.receivable },
    implementationBaseSha,
    tempDatabaseDirectory: dir,
  }, null, 2));
} finally {
  db.close();
}
