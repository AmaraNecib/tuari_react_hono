import { sumMoneyHistory, manualSettlementHistoryInputSchema, Money, confirmManualSettlementSchema, previewManualSettlementSchema, reverseManualSettlementSchema, type ConfirmManualSettlement, type PreviewManualSettlement, type ReverseManualSettlement } from "@tuari/contracts";
import { ExactDebtError, type ExactFinanceService } from "./exact-finance.service";
import type { ExactFinanceRepository, ExactTransactionIdentity } from "./exact-finance.repository";
import type { ManualSettlementRecord, ManualSettlementRepository, ManualSettlementReversalRecord } from "./manual-settlement.repository";
import type { ExactInventoryRepository } from "../inventory/inventory-exact.repository";

export class ManualSettlementAuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  constructor() { super("Required settlement permissions are unavailable"); }
}

export class ManualSettlementUncommittedError extends ExactDebtError {
  constructor(cause: ExactDebtError) { super(cause.message, cause.code); }
}
const rolledBack = (cause: unknown) => cause instanceof ExactDebtError ? new ManualSettlementUncommittedError(cause) : cause;

export type ManualSettlementAuthorization = {
  readonly transactionIdentity?: ExactTransactionIdentity;
  authorize(permissions: readonly string[]): { actorUserId: string; actorLabel: string };
};
/** Paired ledger commands and history; selected only by the explicit disposable root. */
export class ManualSettlementService {
  constructor(private readonly finance: ExactFinanceService, private readonly ledger: ExactFinanceRepository, private readonly repository: ManualSettlementRepository, private readonly authorization: ManualSettlementAuthorization, private readonly dependencies: { id(): string; now(): string }, private readonly inventory?: ExactInventoryRepository) {
    const identity = finance.transactionIdentity;
    if (authorization.transactionIdentity && (identity.connection !== authorization.transactionIdentity.connection || identity.lock !== authorization.transactionIdentity.lock)) throw new ExactDebtError("Settlement authorization requires the same connection and shared FIFO");
    for (const participant of [ledger, repository, ...(inventory ? [inventory] : [])]) if (identity.connection !== participant.transactionIdentity.connection || identity.lock !== participant.transactionIdentity.lock) throw new ExactDebtError("Manual settlement requires the same connection and shared FIFO");
  }
  candidates(input: { externalCounterpartyId: string }) {
    return this.repository.withTransaction(() => {
      this.authorization.authorize(["debts:read"]);
      return this.finance.listAccounts().filter(account => account.partyType === "EXTERNAL_COUNTERPARTY" && account.externalCounterpartyId === input.externalCounterpartyId && account.currency === "DZD").flatMap(account => {
        const remainingByEntry = new Map(this.finance.detail(account.id).entries.map(entry => [entry.id, entry.remainingDzd]));
        return this.finance.listEntries(account.id).filter(entry => entry.status === "LIVE" && !entry.targetEntryId && !entry.correctionOfEntryId && !entry.invoiceId
          && (!(entry.producerType || entry.producerId) || this.trustedInventoryOriginal(entry, input.externalCounterpartyId, account.direction))
          && Money.parse(entry.signedAmountDzd).compare(Money.parse("0")) > 0)
          .map(entry => ({ id: entry.id, debtAccountId: account.id, direction: account.direction, postingSequence: entry.postingSequence, remainingDzd: remainingByEntry.get(entry.id)! }))
          .filter(entry => Money.parse(entry.remainingDzd).compare(Money.parse("0")) > 0);
      });
    });
  }
  accountHistory(input: { debtAccountId: string }) {
    return this.repository.withTransaction(() => {
      this.authorization.authorize(["debts:read"]);
      this.finance.getAccount(input.debtAccountId);
      return { items: this.repository.listAccountSettlements(input.debtAccountId).map(row => ({ ...row, reversal: this.repository.getReversal(row.id) })), nextOffset: null };
    });
  }
  private trustedInventoryOriginal(entry: NonNullable<ReturnType<ExactFinanceRepository["getEntry"]>>, externalCounterpartyId: string, direction: "PAYABLE" | "RECEIVABLE") {
    if (!this.inventory || !entry.producerType || !entry.producerId) return false;
    if (direction === "PAYABLE" && entry.producerType === "INVENTORY_PURCHASE") {
      const group = this.inventory.getGroup(entry.producerId);
      return Boolean(group && group.externalCounterpartyId === externalCounterpartyId && group.debtEntryId === entry.id && group.debtAccountId === entry.debtAccountId);
    }
    if (direction === "RECEIVABLE" && entry.producerType === "INVENTORY_OUTBOUND") {
      const outbound = this.inventory.getOutbound(entry.producerId);
      return Boolean(outbound && outbound.transferType === "SALE" && outbound.counterpartyId === externalCounterpartyId && outbound.debtEntryId === entry.id && outbound.associatedDebtAccountId === entry.debtAccountId);
    }
    return false;
  }
  private refreshSourceBalance(originalId: string) {
    const entry = this.ledger.getEntry(originalId);
    if (!entry || entry.producerType !== "INVENTORY_PURCHASE" || !entry.producerId || !this.inventory) return;
    const group = this.inventory.getGroup(entry.producerId);
    if (group?.debtEntryId === entry.id) this.inventory.saveGroup({ ...group, remainingDebtDzd: this.finance.remaining(entry.id), updatedAt: this.dependencies.now() });
  }
  private financeForOriginal(originalId: string) {
    const entry = this.ledger.getEntry(originalId);
    if (!entry?.producerType || !entry.producerId) return this.finance;
    const account = this.finance.getAccount(entry.debtAccountId);
    if (!this.trustedInventoryOriginal(entry, account.externalCounterpartyId ?? "", account.direction)) return this.finance;
    return this.finance.forProducer({ type: entry.producerType, id: entry.producerId });
  }
  private pair(input: PreviewManualSettlement) {
    const entries = [input.payableOriginalEntryId, input.receivableOriginalEntryId].map((id, index) => {
      const entry = this.ledger.getEntry(id);
      if (!entry) throw new ExactDebtError("Original obligation not found", "NOT_FOUND");
      const account = this.finance.getAccount(entry.debtAccountId);
      const direction = index === 0 ? "PAYABLE" : "RECEIVABLE";
      const producerOwned = entry.producerType || entry.producerId;
      if (entry.status !== "LIVE" || entry.targetEntryId || entry.correctionOfEntryId || entry.invoiceId
        || (producerOwned ? !this.trustedInventoryOriginal(entry, input.externalCounterpartyId, direction) : false)
        || Money.parse(entry.signedAmountDzd).compare(Money.parse("0")) <= 0
        || account.partyType !== "EXTERNAL_COUNTERPARTY" || account.externalCounterpartyId !== input.externalCounterpartyId || account.direction !== direction || account.currency !== input.currency) throw new ExactDebtError("Ineligible manual settlement original", "CONFLICT");
      return { entry, remaining: Money.parse(this.finance.remaining(id)) };
    });
    const amount = Money.parse(input.amountDzd);
    if (entries.some(({ remaining }) => remaining.compare(amount) < 0)) throw new ExactDebtError("Settlement exceeds remaining obligation", "CONFLICT");
    const payable = entries[0]!;
    const receivable = entries[1]!;
    const netPositionDzd = sumMoneyHistory(this.finance.listAccounts().filter(account => account.partyType === "EXTERNAL_COUNTERPARTY" && account.externalCounterpartyId === input.externalCounterpartyId && account.currency === input.currency).map(account => account.direction === "PAYABLE" ? Money.parse(account.currentBalance) : Money.parse(account.currentBalance).negate()));
    return { netPositionDzd, projectedNetPositionDzd: netPositionDzd, payableAccountId: payable.entry.debtAccountId, receivableAccountId: receivable.entry.debtAccountId, payableRemainingDzd: payable.remaining.toWire(), receivableRemainingDzd: receivable.remaining.toWire(), projectedPayableRemainingDzd: payable.remaining.subtract(amount).toWire(), projectedReceivableRemainingDzd: receivable.remaining.subtract(amount).toWire() };
  }
  preview(raw: PreviewManualSettlement) {
    const input = previewManualSettlementSchema.parse(raw);
    return this.repository.withTransaction(() => {
      this.authorization.authorize(["debts:read"]);
      return this.pair(input);
    });
  }
  confirm(raw: ConfirmManualSettlement) {
    const input = confirmManualSettlementSchema.parse(raw);
    return this.repository.withTransaction(() => {
      const actor = this.authorization.authorize(["debts:read", "debts:settle"]);
      return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "MANUAL_SETTLEMENT", id: input.externalCounterpartyId }, intent: { kind: "confirm", ...input, note: input.note ?? null }, actorUserId: actor.actorUserId, actorLabel: null }, this.repository, () => {
        const preview = this.pair(input);
        if (preview.payableRemainingDzd !== input.expectedPayableRemainingDzd || preview.receivableRemainingDzd !== input.expectedReceivableRemainingDzd) throw new ExactDebtError("Stale remaining amounts; preview again", "CONFLICT");
        const amount = Money.parse(input.amountDzd).negate().toWire();
        const payable = this.financeForOriginal(input.payableOriginalEntryId).appendManualSettlementPortion(input.payableOriginalEntryId, amount, actor);
        const receivable = this.financeForOriginal(input.receivableOriginalEntryId).appendManualSettlementPortion(input.receivableOriginalEntryId, amount, actor);
        this.refreshSourceBalance(input.payableOriginalEntryId);
        this.refreshSourceBalance(input.receivableOriginalEntryId);
        const settlement: ManualSettlementRecord = { id: this.dependencies.id(), externalCounterpartyId: input.externalCounterpartyId, currency: input.currency, payableOriginalEntryId: input.payableOriginalEntryId, receivableOriginalEntryId: input.receivableOriginalEntryId, payableSettlementEntryId: payable.id, receivableSettlementEntryId: receivable.id, amountDzd: input.amountDzd, recordedAt: this.dependencies.now(), ...actor, note: input.note ?? null };
        this.repository.insertSettlement(settlement);
        return { settlement, preview };
      }, rolledBack);
    });
  }
  history(raw: { externalCounterpartyId: string; limit?: number; offset?: number }) {
    const input = manualSettlementHistoryInputSchema.parse(raw);
    return this.repository.withTransaction(() => {
      this.authorization.authorize(["debts:read"]);
      const rows = this.repository.listSettlements(input.externalCounterpartyId, input.limit + 1, input.offset);
      return { items: rows.slice(0, input.limit).map(row => ({ ...row, reversal: this.repository.getReversal(row.id) })), nextOffset: rows.length > input.limit ? input.offset + input.limit : null };
    });
  }
  reverse(raw: ReverseManualSettlement) {
    const input = reverseManualSettlementSchema.parse(raw);
    return this.repository.withTransaction(() => {
      const actor = this.authorization.authorize(["debts:read", "debts:settle", "debts:update"]);
      const settlement = this.repository.getSettlement(input.settlementId);
      if (!settlement) throw new ExactDebtError("Settlement not found", "NOT_FOUND");
      return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "MANUAL_SETTLEMENT", id: settlement.externalCounterpartyId }, intent: { kind: "reverse", ...input }, actorUserId: actor.actorUserId, actorLabel: null }, this.repository, () => {
        if (this.repository.getReversal(settlement.id)) throw new ExactDebtError("Settlement is already reversed", "CONFLICT");
        const payable = this.financeForOriginal(settlement.payableOriginalEntryId).appendManualSettlementPortion(settlement.payableOriginalEntryId, settlement.amountDzd, actor);
        const receivable = this.financeForOriginal(settlement.receivableOriginalEntryId).appendManualSettlementPortion(settlement.receivableOriginalEntryId, settlement.amountDzd, actor);
        this.refreshSourceBalance(settlement.payableOriginalEntryId);
        this.refreshSourceBalance(settlement.receivableOriginalEntryId);
        const reversal: ManualSettlementReversalRecord = { id: this.dependencies.id(), settlementId: settlement.id, payableReversalEntryId: payable.id, receivableReversalEntryId: receivable.id, recordedAt: this.dependencies.now(), ...actor, reason: input.reason };
        this.repository.insertReversal(reversal);
        return { settlement, reversal };
      }, rolledBack);
    });
  }
}
