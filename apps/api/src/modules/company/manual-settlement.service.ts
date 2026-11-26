import { sumMoneyHistory, experimentalSettlementCandidateSchema, experimentalSettlementHistoryOutputSchema, manualSettlementCandidateSchema, manualSettlementHistoryInputSchema, manualSettlementHistoryOutputSchema, Money, confirmManualSettlementSchema, previewManualSettlementSchema, reverseManualSettlementSchema, type ConfirmManualSettlement, type PreviewManualSettlement, type ReverseManualSettlement } from "@tuari/contracts";
import { z } from "zod";
import { ExactDebtError, type ExactFinanceService } from "./exact-finance.service";
import type { ExactFinanceRepository, ExactTransactionIdentity } from "./exact-finance.repository";
import type { ManualSettlementRecord, ManualSettlementRepository, ManualSettlementReversalRecord } from "./manual-settlement.repository";
import type { ExactInventoryRepository } from "../inventory/inventory-exact.repository";
import type { ExperimentalInvoiceSettlementParticipant } from "../invoice/experimental-invoice-settlement-participant";

export class ManualSettlementAuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  constructor() { super("Required settlement permissions are unavailable"); }
}

export class ManualSettlementUncommittedError extends ExactDebtError {
  constructor(cause: ExactDebtError) { super(cause.message, cause.code); }
}
const rolledBack = (cause: unknown) => cause instanceof ExactDebtError ? new ManualSettlementUncommittedError(cause) : cause;
type ManualSettlementCandidate = z.infer<typeof manualSettlementCandidateSchema>;
type ExperimentalSettlementCandidate = z.infer<typeof experimentalSettlementCandidateSchema>;
type ManualSettlementHistoryOutput = z.infer<typeof manualSettlementHistoryOutputSchema>;
type ExperimentalSettlementHistoryOutput = z.infer<typeof experimentalSettlementHistoryOutputSchema>;

export type ManualSettlementAuthorization = {
  readonly transactionIdentity?: ExactTransactionIdentity;
  authorize(permissions: readonly string[]): { actorUserId: string; actorLabel: string };
  canReadInventorySources?(): boolean;
  canReadInvoiceSources?(): boolean;
};
/** Paired ledger commands and history; selected only by the explicit disposable root. */
export class ManualSettlementService {
  constructor(private readonly finance: ExactFinanceService, private readonly ledger: ExactFinanceRepository, private readonly repository: ManualSettlementRepository, private readonly authorization: ManualSettlementAuthorization, private readonly dependencies: { id(): string; now(): string }, private readonly inventory?: ExactInventoryRepository, private readonly invoice?: ExperimentalInvoiceSettlementParticipant) {
    const identity = finance.transactionIdentity;
    if (authorization.transactionIdentity && (identity.connection !== authorization.transactionIdentity.connection || identity.lock !== authorization.transactionIdentity.lock)) throw new ExactDebtError("Settlement authorization requires the same connection and shared FIFO");
    for (const participant of [ledger, repository, ...(inventory ? [inventory] : []), ...(invoice ? [invoice] : [])]) if (identity.connection !== participant.transactionIdentity.connection || identity.lock !== participant.transactionIdentity.lock) throw new ExactDebtError("Manual settlement requires the same connection and shared FIFO");
  }
  candidates(input: { externalCounterpartyId: string }) {
    return this.listCandidates(input, false);
  }
  experimentalCandidates(input: { externalCounterpartyId: string }) {
    return this.listCandidates(input, true);
  }
  private listCandidates(input: { externalCounterpartyId: string }, exposeInvoiceSources: false): ManualSettlementCandidate[];
  private listCandidates(input: { externalCounterpartyId: string }, exposeInvoiceSources: true): ExperimentalSettlementCandidate[];
  private listCandidates(input: { externalCounterpartyId: string }, exposeInvoiceSources: boolean): (ManualSettlementCandidate | ExperimentalSettlementCandidate)[] {
    return this.repository.withTransaction(() => {
      this.authorization.authorize(["debts:read"]);
      const canReadInventorySources = this.authorization.canReadInventorySources?.() === true;
      const canReadInvoiceSources = exposeInvoiceSources && this.authorization.canReadInvoiceSources?.() === true;
      return this.finance.listAccounts().filter(account => account.partyType === "EXTERNAL_COUNTERPARTY" && account.externalCounterpartyId === input.externalCounterpartyId && account.currency === "DZD").flatMap(account => {
        const remainingByEntry = new Map(this.finance.detail(account.id).entries.map(entry => [entry.id, entry.remainingDzd]));
        return this.finance.listEntries(account.id).filter(entry => entry.status === "LIVE" && !entry.targetEntryId && !entry.correctionOfEntryId && (!entry.invoiceId || Boolean(this.invoice?.lookupOriginal(entry.id)))
          && (!(entry.producerType || entry.producerId) || Boolean(entry.invoiceId && this.invoice?.lookupOriginal(entry.id)) || this.trustedInventoryOriginal(entry, input.externalCounterpartyId, account.direction))
          && Money.parse(entry.signedAmountDzd).compare(Money.parse("0")) > 0)
          .map(entry => {
            const group = entry.producerType === "INVENTORY_PURCHASE" && entry.producerId ? this.inventory?.getGroup(entry.producerId) : null;
            const outbound = entry.producerType === "INVENTORY_OUTBOUND" && entry.producerId ? this.inventory?.getOutbound(entry.producerId) : null;
            if ((group || outbound) && !canReadInventorySources) return { id: entry.id, debtAccountId: account.id, direction: account.direction, postingSequence: entry.postingSequence, remainingDzd: remainingByEntry.get(entry.id)!, sourceKind: "RESTRICTED" as const };
            if (entry.invoiceId || entry.producerType === "INVOICE") {
              const source = canReadInvoiceSources ? this.invoice?.describeSource(entry.id) : null;
              if (!source) return { id: entry.id, debtAccountId: account.id, direction: account.direction, postingSequence: entry.postingSequence, remainingDzd: remainingByEntry.get(entry.id)!, sourceKind: "RESTRICTED" as const };
              return { id: entry.id, debtAccountId: account.id, direction: account.direction, postingSequence: entry.postingSequence, remainingDzd: remainingByEntry.get(entry.id)!, sourceKind: source.kind, sourceId: source.id, sourceLabel: source.label };
            }
            const sourceKind = group ? "PURCHASE" as const : outbound ? "SALE" as const : "MANUAL" as const;
            const sourceId = group?.id ?? outbound?.id ?? entry.id;
            const sourceLabel = group ? (group.invoiceNumber || group.id) : outbound ? `${outbound.transferType} · ${outbound.id}` : `#${entry.postingSequence}`;
            return { id: entry.id, debtAccountId: account.id, direction: account.direction, postingSequence: entry.postingSequence, remainingDzd: remainingByEntry.get(entry.id)!, sourceKind, sourceId, sourceLabel };
          })
          .filter(entry => Money.parse(entry.remainingDzd).compare(Money.parse("0")) > 0);
      });
    });
  }
  private sourceForOriginal(id: string, direction: "PAYABLE" | "RECEIVABLE", canReadInventorySources: boolean, canReadInvoiceSources = false) {
    const entry = this.ledger.getEntry(id);
    if (entry && this.trustedInventoryOriginal(entry, this.finance.getAccount(entry.debtAccountId).externalCounterpartyId ?? "", direction)) {
      if (!canReadInventorySources) return { kind: "RESTRICTED" as const };
      const group = entry.producerType === "INVENTORY_PURCHASE" && entry.producerId ? this.inventory?.getGroup(entry.producerId) : null;
      const outbound = entry.producerType === "INVENTORY_OUTBOUND" && entry.producerId ? this.inventory?.getOutbound(entry.producerId) : null;
      return group ? { kind: "PURCHASE" as const, id: group.id, label: group.invoiceNumber || group.id }
        : { kind: "SALE" as const, id: outbound!.id, label: `SALE · ${outbound!.id}` };
    }
    if (entry?.invoiceId || entry?.producerType === "INVOICE") {
      const source = canReadInvoiceSources ? this.invoice?.describeSource(id) : null;
      return source ? { kind: source.kind, id: source.id, label: source.label } : { kind: "RESTRICTED" as const };
    }
    return { kind: "MANUAL" as const, id, label: `#${entry?.postingSequence ?? "?"}` };
  }
  private withSources(row: ManualSettlementRecord, canReadInventorySources: boolean, canReadInvoiceSources = false) {
    return { ...row, payableSource: this.sourceForOriginal(row.payableOriginalEntryId, "PAYABLE", canReadInventorySources, canReadInvoiceSources), receivableSource: this.sourceForOriginal(row.receivableOriginalEntryId, "RECEIVABLE", canReadInventorySources, canReadInvoiceSources) };
  }
  accountHistory(input: { debtAccountId: string }) {
    return this.listAccountHistory(input, false);
  }
  experimentalAccountHistory(input: { debtAccountId: string }) {
    return this.listAccountHistory(input, true);
  }
  private listAccountHistory(input: { debtAccountId: string }, exposeInvoiceSources: false): ManualSettlementHistoryOutput;
  private listAccountHistory(input: { debtAccountId: string }, exposeInvoiceSources: true): ExperimentalSettlementHistoryOutput;
  private listAccountHistory(input: { debtAccountId: string }, exposeInvoiceSources: boolean): ManualSettlementHistoryOutput | ExperimentalSettlementHistoryOutput {
    return this.repository.withTransaction(() => {
      this.authorization.authorize(["debts:read"]);
      const canReadInventorySources = this.authorization.canReadInventorySources?.() === true;
      const canReadInvoiceSources = exposeInvoiceSources && this.authorization.canReadInvoiceSources?.() === true;
      this.finance.getAccount(input.debtAccountId);
      return { items: this.repository.listAccountSettlements(input.debtAccountId).map(row => ({ ...this.withSources(row, canReadInventorySources, canReadInvoiceSources), reversal: this.repository.getReversal(row.id) })), nextOffset: null };
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
  private appendPortion(originalId: string, signedAmountDzd: string, requestId: string, actor: { actorUserId: string; actorLabel: string }) {
    const entry = this.ledger.getEntry(originalId);
    if (entry?.invoiceId && this.invoice) return this.invoice.appendConfirmation(originalId, Money.parse(signedAmountDzd).compare(Money.parse("0")) < 0 ? Money.parse(signedAmountDzd).negate().toWire() : signedAmountDzd, requestId, actor);
    return this.financeForOriginal(originalId).appendManualSettlementPortion(originalId, signedAmountDzd, actor);
  }
  private appendReversalPortion(originalId: string, settlementPostingId: string, amountDzd: string, actor: { actorUserId: string; actorLabel: string }) {
    const entry = this.ledger.getEntry(originalId);
    if (entry?.invoiceId && this.invoice) {
      const posting = this.ledger.getEntry(settlementPostingId);
      if (!posting || Money.parse(posting.signedAmountDzd).compare(Money.parse(amountDzd).negate()) !== 0) throw new ExactDebtError("Linked invoice settlement amount does not match its recorded portion", "CONFLICT");
      return this.invoice.appendReversal(originalId, settlementPostingId, actor);
    }
    return this.financeForOriginal(originalId).appendManualSettlementPortion(originalId, amountDzd, actor);
  }
  private financeForOriginal(originalId: string) {
    const entry = this.ledger.getEntry(originalId);
    if (entry?.producerType === "INVOICE" && entry.invoiceId && this.invoice?.lookupOriginal(originalId)) return this.finance.forProducer({ type: "INVOICE", id: entry.invoiceId });
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
      const invoiceSource = Boolean(entry.invoiceId && this.invoice?.lookupOriginal(entry.id));
      if (entry.status !== "LIVE" || entry.targetEntryId || entry.correctionOfEntryId || (entry.invoiceId && !invoiceSource)
        || (invoiceSource && (account.direction !== direction || account.externalCounterpartyId !== input.externalCounterpartyId || !this.invoice!.validateEligible(entry.id)))
        || (producerOwned && !invoiceSource ? !this.trustedInventoryOriginal(entry, input.externalCounterpartyId, direction) : false)
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
        const payable = this.appendPortion(input.payableOriginalEntryId, amount, input.requestId, actor);
        const receivable = this.appendPortion(input.receivableOriginalEntryId, amount, input.requestId, actor);
        const settlement: ManualSettlementRecord = { id: this.dependencies.id(), externalCounterpartyId: input.externalCounterpartyId, currency: input.currency, payableOriginalEntryId: input.payableOriginalEntryId, receivableOriginalEntryId: input.receivableOriginalEntryId, payableSettlementEntryId: payable.id, receivableSettlementEntryId: receivable.id, amountDzd: input.amountDzd, recordedAt: this.dependencies.now(), ...actor, note: input.note ?? null };
        this.repository.insertSettlement(settlement);
        for (const originalId of [input.payableOriginalEntryId, input.receivableOriginalEntryId]) {
          if (this.ledger.getEntry(originalId)?.invoiceId && this.invoice) this.invoice.reconcileProjection(originalId, this.repository);
          else this.refreshSourceBalance(originalId);
        }
        return { settlement, preview };
      }, rolledBack);
    });
  }
  history(raw: { externalCounterpartyId: string; limit?: number; offset?: number }) {
    return this.listHistory(raw, false);
  }
  experimentalHistory(raw: { externalCounterpartyId: string; limit?: number; offset?: number }) {
    return this.listHistory(raw, true);
  }
  private listHistory(raw: { externalCounterpartyId: string; limit?: number; offset?: number }, exposeInvoiceSources: false): ManualSettlementHistoryOutput;
  private listHistory(raw: { externalCounterpartyId: string; limit?: number; offset?: number }, exposeInvoiceSources: true): ExperimentalSettlementHistoryOutput;
  private listHistory(raw: { externalCounterpartyId: string; limit?: number; offset?: number }, exposeInvoiceSources: boolean): ManualSettlementHistoryOutput | ExperimentalSettlementHistoryOutput {
    const input = manualSettlementHistoryInputSchema.parse(raw);
    return this.repository.withTransaction(() => {
      this.authorization.authorize(["debts:read"]);
      const canReadInventorySources = this.authorization.canReadInventorySources?.() === true;
      const canReadInvoiceSources = exposeInvoiceSources && this.authorization.canReadInvoiceSources?.() === true;
      const rows = this.repository.listSettlements(input.externalCounterpartyId, input.limit + 1, input.offset);
      return { items: rows.slice(0, input.limit).map(row => ({ ...this.withSources(row, canReadInventorySources, canReadInvoiceSources), reversal: this.repository.getReversal(row.id) })), nextOffset: rows.length > input.limit ? input.offset + input.limit : null };
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
        const payable = this.appendReversalPortion(settlement.payableOriginalEntryId, settlement.payableSettlementEntryId, settlement.amountDzd, actor);
        const receivable = this.appendReversalPortion(settlement.receivableOriginalEntryId, settlement.receivableSettlementEntryId, settlement.amountDzd, actor);
        const reversal: ManualSettlementReversalRecord = { id: this.dependencies.id(), settlementId: settlement.id, payableReversalEntryId: payable.id, receivableReversalEntryId: receivable.id, recordedAt: this.dependencies.now(), ...actor, reason: input.reason };
        this.repository.insertReversal(reversal);
        for (const originalId of [settlement.payableOriginalEntryId, settlement.receivableOriginalEntryId]) {
          if (this.ledger.getEntry(originalId)?.invoiceId && this.invoice) this.invoice.reconcileProjection(originalId, this.repository);
          else this.refreshSourceBalance(originalId);
        }
        return { settlement, reversal };
      }, rolledBack);
    });
  }
}
