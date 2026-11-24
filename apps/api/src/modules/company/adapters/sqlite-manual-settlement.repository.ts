import { Money } from "@tuari/contracts";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import { bindMoney, prepareMoneyRead } from "../../../infrastructure/database/exact-money-storage";
import type { ManualSettlementRecord, ManualSettlementRepository, ManualSettlementReversalRecord } from "../manual-settlement.repository";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import { SqliteExactFinanceRepository } from "./sqlite-exact-finance.repository";
import type { ExactInventoryRepository } from "../../inventory/inventory-exact.repository";

const settlementFields = {
  id: "id", externalCounterpartyId: "external_counterparty_id", currency: "currency", payableOriginalEntryId: "payable_original_entry_id", receivableOriginalEntryId: "receivable_original_entry_id", payableSettlementEntryId: "payable_settlement_entry_id", receivableSettlementEntryId: "receivable_settlement_entry_id", recordedAt: "recorded_at", actorUserId: "actor_user_id", actorLabel: "actor_label", note: "note",
} as const;
const reversalFields = {
  id: "id", settlementId: "settlement_id", payableReversalEntryId: "payable_reversal_entry_id", receivableReversalEntryId: "receivable_reversal_entry_id", recordedAt: "recorded_at", actorUserId: "actor_user_id", actorLabel: "actor_label", reason: "reason",
} as const;
const projection = (fields: Record<string, string>) => Object.entries(fields).map(([key, column]) => `${column} AS ${key}`).join(",");

/** Append-only pairing storage on the shared connection and immediate transaction. */
export class SqliteManualSettlementRepository implements ManualSettlementRepository {
  private readonly ledger: SqliteExactFinanceRepository;
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock, private readonly inventory?: ExactInventoryRepository) {
    this.ledger = new SqliteExactFinanceRepository(db, lock);
  }
  get transactionIdentity() { return { connection: this.db, lock: this.lock }; }
  withTransaction<T>(work: () => T): T { return this.lock.runSync(() => this.db.transaction(work).immediate()); }

  private validateLinks(row: ManualSettlementRecord, postingIds: readonly string[], reversing: boolean): void {
    const amount = Money.parse(row.amountDzd, row.currency);
    if (amount.compare(Money.parse("0")) <= 0) throw new Error("Settlement amount must be positive");
    if (row.payableOriginalEntryId === row.receivableOriginalEntryId || postingIds[0] === postingIds[1]) throw new Error("Invalid settlement linkage");
    for (const [index, direction] of (["PAYABLE", "RECEIVABLE"] as const).entries()) {
      const original = this.ledger.getEntry(index === 0 ? row.payableOriginalEntryId : row.receivableOriginalEntryId);
      const account = original && this.ledger.getAccount(original.debtAccountId);
      const posting = this.ledger.getEntry(postingIds[index]!);
      const trusted = Boolean(original && this.inventory && ((direction === "PAYABLE" && original.producerType === "INVENTORY_PURCHASE" && original.producerId && this.inventory.getGroup(original.producerId)?.debtEntryId === original.id && this.inventory.getGroup(original.producerId)?.externalCounterpartyId === row.externalCounterpartyId)
        || (direction === "RECEIVABLE" && original.producerType === "INVENTORY_OUTBOUND" && original.producerId && this.inventory.getOutbound(original.producerId)?.transferType === "SALE" && this.inventory.getOutbound(original.producerId)?.debtEntryId === original.id && this.inventory.getOutbound(original.producerId)?.counterpartyId === row.externalCounterpartyId)));
      if (!original || !account || !posting || original.status !== "LIVE" || original.targetEntryId || original.correctionOfEntryId || ((original.producerType || original.producerId) && !trusted) || original.invoiceId
        || Money.parse(original.signedAmountDzd).compare(Money.parse("0")) <= 0
        || account.partyType !== "EXTERNAL_COUNTERPARTY" || account.externalCounterpartyId !== row.externalCounterpartyId || account.direction !== direction || account.currency !== row.currency
        || posting.debtAccountId !== account.id || posting.status !== "LIVE" || posting.currency !== row.currency || posting.targetEntryId !== original.id || posting.correctionOfEntryId || (trusted ? posting.producerType !== original.producerType || posting.producerId !== original.producerId : posting.producerType || posting.producerId) || posting.invoiceId
        || posting.entryType !== (reversing ? "ADJUSTMENT" : "SETTLEMENT") || Money.parse(posting.signedAmountDzd).compare(reversing ? amount : amount.negate()) !== 0 || posting.paymentMethod !== null) throw new Error("Invalid manual settlement linkage");
    }
  }
  listSettlements(partyId: string, limit: number, offset: number): ManualSettlementRecord[] {
    return this.withTransaction(() => {
      const rows = this.db.prepare("SELECT id FROM manual_debt_settlement WHERE external_counterparty_id=? ORDER BY recorded_at DESC,id DESC LIMIT ? OFFSET ?").all(partyId, limit, offset) as { id: string }[];
      return rows.map(row => this.getSettlement(row.id)!);
    });
  }
  listAccountSettlements(accountId: string): ManualSettlementRecord[] {
    return this.withTransaction(() => {
      const rows = this.db.prepare("SELECT s.id FROM manual_debt_settlement s WHERE EXISTS (SELECT 1 FROM debt_entry e WHERE e.debt_account_id=? AND e.id IN (s.payable_original_entry_id,s.receivable_original_entry_id)) ORDER BY s.recorded_at DESC,s.id DESC").all(accountId) as { id: string }[];
      return rows.map(row => this.getSettlement(row.id)!);
    });
  }
  insertSettlement(row: ManualSettlementRecord): void {
    this.withTransaction(() => {
      this.validateLinks(row, [row.payableSettlementEntryId, row.receivableSettlementEntryId], false);
      const columns = [...Object.values(settlementFields), "amount_minor"];
      const values = [...Object.keys(settlementFields).map(key => row[key as keyof typeof settlementFields]), bindMoney(Money.parse(row.amountDzd, row.currency))];
      this.db.prepare(`INSERT INTO manual_debt_settlement (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...values);
    });
  }
  getSettlement(id: string): ManualSettlementRecord | null {
    return this.withTransaction(() => {
      const row = this.db.prepare(`SELECT ${projection(settlementFields)} FROM manual_debt_settlement WHERE id=?`).get(id) as Omit<ManualSettlementRecord, "amountDzd"> | undefined;
      if (!row) return null;
      const amount = prepareMoneyRead(this.db, "SELECT amount_minor AS minor_units FROM manual_debt_settlement WHERE id=?").get(id);
      if (!amount) throw new Error("Missing settlement amount");
      return { ...row, amountDzd: amount.toWire() };
    });
  }
  insertReversal(row: ManualSettlementReversalRecord): void {
    this.withTransaction(() => {
      const settlement = this.getSettlement(row.settlementId);
      if (!settlement) throw new Error("Settlement not found");
      this.validateLinks(settlement, [settlement.payableSettlementEntryId, settlement.receivableSettlementEntryId], false);
      this.validateLinks(settlement, [row.payableReversalEntryId, row.receivableReversalEntryId], true);
      const columns = Object.values(reversalFields);
      this.db.prepare(`INSERT INTO manual_debt_settlement_reversal (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...Object.keys(reversalFields).map(key => row[key as keyof typeof reversalFields]));
    });
  }
  getReversal(settlementId: string): ManualSettlementReversalRecord | null {
    return this.withTransaction(() => this.db.prepare(`SELECT ${projection(reversalFields)} FROM manual_debt_settlement_reversal WHERE settlement_id=?`).get(settlementId) as ManualSettlementReversalRecord | undefined ?? null);
  }
}
