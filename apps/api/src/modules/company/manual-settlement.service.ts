import { Money, confirmManualSettlementSchema, previewManualSettlementSchema, reverseManualSettlementSchema, type ConfirmManualSettlement, type PreviewManualSettlement, type ReverseManualSettlement } from "@tuari/contracts";
import { ExactDebtError, type ExactFinanceService } from "./exact-finance.service";
import type { ExactFinanceRepository } from "./exact-finance.repository";
import type { ManualSettlementRecord, ManualSettlementRepository, ManualSettlementReversalRecord } from "./manual-settlement.repository";

export type ManualSettlementAuthorization = {
  authorize(permissions: readonly string[]): { actorUserId: string; actorLabel: string };
};
/** Inert internal command composition, not selected by application dependencies yet. */
export class ManualSettlementService {
  constructor(private readonly finance: ExactFinanceService, private readonly ledger: ExactFinanceRepository, private readonly repository: ManualSettlementRepository, private readonly authorization: ManualSettlementAuthorization, private readonly dependencies: { id(): string; now(): string }) {
    const identity = finance.transactionIdentity;
    for (const participant of [ledger, repository]) if (identity.connection !== participant.transactionIdentity.connection || identity.lock !== participant.transactionIdentity.lock) throw new ExactDebtError("Manual settlement requires the same connection and shared FIFO");
  }
  private pair(input: PreviewManualSettlement) {
    const entries = [input.payableOriginalEntryId, input.receivableOriginalEntryId].map((id, index) => {
      const entry = this.ledger.getEntry(id);
      if (!entry) throw new ExactDebtError("Original obligation not found", "NOT_FOUND");
      const account = this.finance.getAccount(entry.debtAccountId);
      if (entry.status !== "LIVE" || entry.targetEntryId || entry.correctionOfEntryId || entry.producerType || entry.producerId || entry.invoiceId || Money.parse(entry.signedAmountDzd).compare(Money.parse("0")) <= 0
        || account.partyType !== "EXTERNAL_COUNTERPARTY" || account.externalCounterpartyId !== input.externalCounterpartyId || account.direction !== (index === 0 ? "PAYABLE" : "RECEIVABLE") || account.currency !== input.currency) throw new ExactDebtError("Ineligible manual settlement original", "CONFLICT");
      return { entry, remaining: Money.parse(this.finance.remaining(id)) };
    });
    const amount = Money.parse(input.amountDzd);
    if (entries.some(({ remaining }) => remaining.compare(amount) < 0)) throw new ExactDebtError("Settlement exceeds remaining obligation", "CONFLICT");
    const payable = entries[0]!;
    const receivable = entries[1]!;
    return { payableAccountId: payable.entry.debtAccountId, receivableAccountId: receivable.entry.debtAccountId, payableRemainingDzd: payable.remaining.toWire(), receivableRemainingDzd: receivable.remaining.toWire(), projectedPayableRemainingDzd: payable.remaining.subtract(amount).toWire(), projectedReceivableRemainingDzd: receivable.remaining.subtract(amount).toWire() };
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
      return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "MANUAL_SETTLEMENT", id: input.externalCounterpartyId }, intent: { kind: "confirm", ...input, note: input.note ?? null }, ...actor }, this.repository, () => {
        const preview = this.pair(input);
        if (preview.payableRemainingDzd !== input.expectedPayableRemainingDzd || preview.receivableRemainingDzd !== input.expectedReceivableRemainingDzd) throw new ExactDebtError("Stale remaining amounts; preview again", "CONFLICT");
        const amount = Money.parse(input.amountDzd).negate().toWire();
        const payable = this.finance.appendManualSettlementPortion(input.payableOriginalEntryId, amount, actor);
        const receivable = this.finance.appendManualSettlementPortion(input.receivableOriginalEntryId, amount, actor);
        const settlement: ManualSettlementRecord = { id: this.dependencies.id(), externalCounterpartyId: input.externalCounterpartyId, currency: input.currency, payableOriginalEntryId: input.payableOriginalEntryId, receivableOriginalEntryId: input.receivableOriginalEntryId, payableSettlementEntryId: payable.id, receivableSettlementEntryId: receivable.id, amountDzd: input.amountDzd, recordedAt: this.dependencies.now(), ...actor, note: input.note ?? null };
        this.repository.insertSettlement(settlement);
        return { settlement, preview };
      });
    });
  }
  reverse(raw: ReverseManualSettlement) {
    const input = reverseManualSettlementSchema.parse(raw);
    return this.repository.withTransaction(() => {
      const actor = this.authorization.authorize(["debts:read", "debts:settle", "debts:update"]);
      const settlement = this.repository.getSettlement(input.settlementId);
      if (!settlement) throw new ExactDebtError("Settlement not found", "NOT_FOUND");
      return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "MANUAL_SETTLEMENT", id: settlement.externalCounterpartyId }, intent: { kind: "reverse", ...input }, ...actor }, this.repository, () => {
        if (this.repository.getReversal(settlement.id)) throw new ExactDebtError("Settlement is already reversed", "CONFLICT");
        const payable = this.finance.appendManualSettlementPortion(settlement.payableOriginalEntryId, settlement.amountDzd, actor);
        const receivable = this.finance.appendManualSettlementPortion(settlement.receivableOriginalEntryId, settlement.amountDzd, actor);
        const reversal: ManualSettlementReversalRecord = { id: this.dependencies.id(), settlementId: settlement.id, payableReversalEntryId: payable.id, receivableReversalEntryId: receivable.id, recordedAt: this.dependencies.now(), ...actor, reason: input.reason };
        this.repository.insertReversal(reversal);
        return { settlement, reversal };
      });
    });
  }
}
