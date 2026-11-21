import { createHash } from "node:crypto";
import { z } from "zod";
import { Money, auditActorUserIdSchema, auditTransactionIdSchema, timestampSchema } from "@tuari/contracts";
import type { ExactFinanceService } from "../company/exact-finance.service";
import type { SqlitePayrollOpeningRepository } from "./adapters/sqlite-payroll-opening.repository";
import type { PayrollOpeningReview } from "./payroll-lifecycle";
import { PayrollDomainError, confirmedRefusal } from "./payroll.service";

const id = z.string().trim().min(1).max(128);
const money = z.string().max(96).transform((value, context) => {
  try { return Money.parse(value, "DZD").toWire(); }
  catch { context.addIssue({ code: "custom", message: "Invalid bounded exact DZD amount" }); return z.NEVER; }
}).refine(value => Money.parse(value).compare(Money.parse("0")) >= 0, "Opening amount must be nonnegative");
const audit = { actorUserId: auditActorUserIdSchema, actorLabel: z.string().max(1000).nullable(), transactionId: auditTransactionIdSchema };
const common = { ...audit, requestId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/), employeeId: id };
const reviewSchema = z.object({ ...common, wages: money, advances: money }).strict();
const correctionSchema = z.object({ ...common, kind: z.enum(["WAGE", "ADVANCE"]), expectedAmount: money, amount: money, reason: z.string().trim().min(1).max(1000) }).strict();
const reconcileSchema = z.object({ ...common, proposalId: id, expectedAmount: money, refundAmount: money.refine(value => Money.parse(value).compare(Money.parse("0")) > 0, "Refund must be positive"), refundDate: timestampSchema.transform(value => new Date(value).toISOString()), confirmCashRefund: z.literal(true) }).strict();
const cancelSchema = z.object({ ...common, proposalId: id, reason: z.string().trim().min(1).max(1000) }).strict();
const key = (...parts: string[]) => `opening:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;

/** Opening intent and linked corrections share the finance reservation and receipts. */
export class PayrollOpeningService {
  constructor(private readonly finance: ExactFinanceService, private readonly repository: SqlitePayrollOpeningRepository, private readonly dependencies: { id(): string; now(): string }) {
    if (finance.transactionIdentity.connection !== repository.transactionIdentity.connection || finance.transactionIdentity.lock !== repository.transactionIdentity.lock) throw new TypeError("Opening participants require the same connection and FIFO");
  }
  review(raw: z.input<typeof reviewSchema>): PayrollOpeningReview {
    const input = reviewSchema.parse(raw);
    const { requestId, employeeId, wages, advances, ...actor } = input;
    return this.finance.runAggregate({ requestId, producer: { type: "PAYROLL_OPENING", id: key(employeeId, "review") }, intent: { employeeId, wages, advances }, ...actor }, this.repository, () => {
      this.finance.requireParty("INTERNAL_WORKER", employeeId);
      if (this.repository.getReview(employeeId)) throw new PayrollDomainError("Opening is already reviewed; record a correction", "CONFLICT");
      const sources: PayrollOpeningReview["sources"][number][] = [];
      for (const [kind, amount] of [["WAGE", wages], ["ADVANCE", advances]] as const) {
        if (amount === "0.00") continue;
        const sourceId = this.dependencies.id();
        const producer = this.finance.forProducer({ type: "PAYROLL_OPENING", id: sourceId });
        const account = producer.createAccount({ requestId: key(requestId, kind, "account"), partyType: "INTERNAL_WORKER", workerId: employeeId, direction: kind === "WAGE" ? "PAYABLE" : "RECEIVABLE", currency: "DZD", ...actor });
        const original = producer.postEntry({ requestId: key(requestId, kind, "original"), debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: amount, currency: "DZD", ...actor });
        sources.push({ kind, amount, employeeId, currency: "DZD", sourceId, debtAccountId: account.id, debtEntryId: original.id });
      }
      const result: PayrollOpeningReview = { employeeId, state: "REVIEWED", sources };
      this.repository.save(result, actor, timestampSchema.parse(this.dependencies.now()));
      return result;
    }, confirmedRefusal);
  }
  get(employeeId: string) {
    return this.repository.withTransaction(() => {
      this.finance.requireParty("INTERNAL_WORKER", employeeId);
      const review = this.repository.getReview(employeeId);
      const history = this.history(employeeId);
      const reviewAudit = this.repository.getReviewAudit(employeeId);
      const sources = (review?.sources ?? []).map(source => {
        const account = this.finance.getAccount(source.debtAccountId);
        const entries = this.finance.listEntries(source.debtAccountId);
        const original = entries.find(row => row.id === source.debtEntryId);
        if (source.employeeId !== employeeId || source.currency !== "DZD" || account.partyType !== "INTERNAL_WORKER" || account.workerId !== employeeId || account.direction !== (source.kind === "WAGE" ? "PAYABLE" : "RECEIVABLE") || account.currency !== "DZD" || !original || original.status !== "LIVE" || original.targetEntryId || original.correctionOfEntryId || original.producerType !== "PAYROLL_OPENING" || original.producerId !== source.sourceId || original.currency !== "DZD" || original.signedAmountDzd !== Money.parse(source.amount).toWire()) throw new Error("Opening source ledger mismatch");
        const attributed = new Set(history.filter(event => event.sourceId === source.sourceId).map(event => event.id));
        const initial = source.kind === "WAGE" ? reviewAudit?.wages : reviewAudit?.advances;
        if (!initial || (initial === "0.00" ? !attributed.has(original.id) : initial !== source.amount)) throw new Error("Opening original review attribution mismatch");
        if (entries.some(row => row.correctionOfEntryId === source.debtEntryId && !attributed.has(row.id))) throw new Error("Opening correction is missing immutable audit history");
        const current = entries.filter(row => row.status === "LIVE" && (row.id === source.debtEntryId || row.correctionOfEntryId === source.debtEntryId)).reduce((sum, row) => sum.add(Money.parse(row.signedAmountDzd)), Money.parse("0"));
        return { kind: source.kind, sourceId: source.sourceId, amount: source.amount, currentAmount: current.toWire(), remaining: this.finance.forProducer({ type: "PAYROLL_OPENING", id: source.sourceId }).remaining(source.debtEntryId), debtAccountId: source.debtAccountId, debtEntryId: source.debtEntryId };
      });
      const proposals = this.repository.listProposals(employeeId);
      const refunds = this.repository.listRefunds(employeeId);
      for (const refund of refunds) {
        const source = sources.find(row => row.sourceId === refund.sourceId);
        const proposal = proposals.find(row => row.id === refund.proposalId);
        const entry = source ? this.finance.listEntries(source.debtAccountId).find(row => row.id === refund.id) : undefined;
        const correction = history.find(row => row.id === proposal?.resolution?.correctionEntryId);
        if (!source || !proposal || proposal.status !== "APPLIED" || proposal.resolution?.refundEntryId !== refund.id || proposal.requiredRefund !== refund.amount || !correction || correction.sourceId !== source.sourceId || correction.oldAmount !== proposal.oldAmount || correction.newAmount !== proposal.newAmount || !entry || entry.status !== "LIVE" || entry.entryType !== "ADJUSTMENT" || entry.targetEntryId !== source.debtEntryId || entry.producerType !== "PAYROLL_OPENING" || entry.producerId !== source.sourceId || entry.paymentMethod !== "CASH" || entry.signedAmountDzd !== refund.amount || entry.note !== proposal.reason || entry.actorUserId !== refund.actorUserId || entry.actorLabel !== refund.actorLabel || entry.transactionId !== refund.transactionId || entry.createdAt !== refund.createdAt || refund.direction !== (source.kind === "WAGE" ? "IN" : "OUT")) throw new Error("Opening refund history ledger mismatch");
      }
      return { employeeId, review: review ? "REVIEWED" as const : "UNREVIEWED" as const, reviewAudit, proposals, refunds, wages: review ? sources.find(row => row.kind === "WAGE")?.currentAmount ?? "0.00" : null, advances: review ? sources.find(row => row.kind === "ADVANCE")?.currentAmount ?? "0.00" : null, sources, history };
    });
  }
  history(employeeId: string) {
    return this.repository.withTransaction(() => {
      const reviewed = this.repository.getReview(employeeId);
      const entries = new Map((reviewed?.sources ?? []).flatMap(source => this.finance.listEntries(source.debtAccountId)).map(row => [row.id, row]));
      return this.repository.listCorrections(employeeId).map(event => {
        const source = reviewed?.sources.find(row => row.sourceId === event.sourceId);
        const ledger = entries.get(event.id);
        if (!source || !ledger || !(ledger.correctionOfEntryId === source.debtEntryId || (ledger.id === source.debtEntryId && event.oldAmount === "0.00")) || ledger.producerType !== "PAYROLL_OPENING" || ledger.producerId !== source.sourceId || ledger.debtAccountId !== source.debtAccountId || Money.parse(event.newAmount).subtract(Money.parse(event.oldAmount)).toWire() !== ledger.signedAmountDzd || ledger.actorUserId !== event.actorUserId || ledger.actorLabel !== event.actorLabel || ledger.createdAt !== event.createdAt || ledger.note !== event.reason) throw new Error("Opening correction history ledger mismatch");
        return { ...event, status: ledger.status, voidedAt: ledger.voidedAt, voidedBy: ledger.voidedBy, voidReason: ledger.voidReason };
      });
    });
  }
  reconcile(raw: z.input<typeof reconcileSchema>) {
    const input = reconcileSchema.parse(raw);
    const { requestId, employeeId, proposalId, expectedAmount, refundAmount, refundDate, confirmCashRefund, ...actor } = input;
    return this.finance.runAggregate({ requestId, producer: { type: "PAYROLL_OPENING", id: key(employeeId, "reconcile") }, intent: { employeeId, proposalId, expectedAmount, refundAmount, refundDate, confirmCashRefund }, ...actor }, this.repository, () => {
      const state = this.get(employeeId);
      const proposal = state.proposals.find(row => row.id === proposalId);
      if (!proposal || proposal.status !== "PENDING") throw new PayrollDomainError("Pending opening correction was not found", "CONFLICT");
      const source = state.sources.find(row => row.sourceId === proposal.sourceId);
      if (!source || source.currentAmount !== proposal.oldAmount || expectedAmount !== source.currentAmount) throw new PayrollDomainError("Opening amount changed; cancel and review the proposal", "CONFLICT");
      const required = Money.parse(source.currentAmount).subtract(Money.parse(source.remaining)).subtract(Money.parse(proposal.newAmount));
      if (required.toWire() !== proposal.requiredRefund || refundAmount !== proposal.requiredRefund) throw new PayrollDomainError("Cash settlement changed; cancel and review the proposal", "CONFLICT");
      const persistedSource = this.repository.getReview(employeeId)!.sources.find(row => row.sourceId === source.sourceId)!;
      const latestCashDate = this.repository.latestCashDate(persistedSource);
      if (!latestCashDate || refundDate < latestCashDate) throw new PayrollDomainError("Refund date cannot precede the recorded cash settlement", "BAD_REQUEST");
      const producer = this.finance.forProducer({ type: "PAYROLL_OPENING", id: source.sourceId });
      const refund = producer.recordOpeningCashRefund({ requestId: key(requestId, "refund"), debtEntryId: source.debtEntryId, amountDzd: refundAmount, currency: "DZD", paymentMethod: "CASH", note: proposal.reason, ...actor });
      this.repository.saveRefund({ id: refund.id, proposalId, sourceId: source.sourceId, employeeId, kind: source.kind, amount: refundAmount, direction: source.kind === "WAGE" ? "IN" : "OUT", refundDate, ...actor, createdAt: refund.createdAt, debtAccountId: source.debtAccountId, debtEntryId: source.debtEntryId });
      const correction = producer.correctOpeningEntry({ requestId: key(requestId, "correction"), entryId: source.debtEntryId, amountDzd: proposal.newAmount, currency: "DZD", reason: proposal.reason, ...actor });
      this.repository.saveCorrection({ id: correction.id, sourceId: source.sourceId, oldAmount: source.currentAmount, newAmount: proposal.newAmount, reason: proposal.reason, createdAt: correction.createdAt, ...actor });
      this.repository.saveResolution(proposalId, { id: this.dependencies.id(), status: "APPLIED", refundEntryId: refund.id, correctionEntryId: correction.id, reason: proposal.reason, createdAt: correction.createdAt, ...actor });
      return { proposalId, refundEntryId: refund.id, correctionEntryId: correction.id };
    }, confirmedRefusal);
  }
  cancel(raw: z.input<typeof cancelSchema>) {
    const input = cancelSchema.parse(raw);
    const { requestId, employeeId, proposalId, reason, ...actor } = input;
    return this.finance.runAggregate({ requestId, producer: { type: "PAYROLL_OPENING", id: key(employeeId, "cancel") }, intent: { employeeId, proposalId, reason }, ...actor }, this.repository, () => {
      const proposal = this.repository.listProposals(employeeId).find(row => row.id === proposalId);
      if (!proposal || proposal.status !== "PENDING") throw new PayrollDomainError("Pending opening correction was not found", "CONFLICT");
      this.repository.saveResolution(proposalId, { id: this.dependencies.id(), status: "CANCELLED", refundEntryId: null, correctionEntryId: null, reason, createdAt: timestampSchema.parse(this.dependencies.now()), ...actor });
      return { proposalId, status: "CANCELLED" as const };
    }, confirmedRefusal);
  }
  correct(raw: z.input<typeof correctionSchema>) {
    const input = correctionSchema.parse(raw);
    const { requestId, employeeId, kind, expectedAmount, amount, reason, ...actor } = input;
    return this.finance.runAggregate({ requestId, producer: { type: "PAYROLL_OPENING", id: key(employeeId, "correction") }, intent: { employeeId, kind, expectedAmount, amount, reason }, ...actor }, this.repository, () => {
      this.get(employeeId);
      const review = this.repository.getReview(employeeId);
      if (!review) throw new PayrollDomainError("Review the opening before correcting it", "NOT_FOUND");
      const source = review.sources.find(row => row.kind === kind);
      if (!source) {
        if (expectedAmount !== "0.00") throw new PayrollDomainError("Opening amount changed; refresh before confirming", "CONFLICT");
        if (amount === "0.00") throw new PayrollDomainError("Correction must change the opening amount", "BAD_REQUEST");
        const sourceId = this.dependencies.id();
        const producer = this.finance.forProducer({ type: "PAYROLL_OPENING", id: sourceId });
        const account = producer.createAccount({ requestId: key(requestId, "zero-source-account"), partyType: "INTERNAL_WORKER", workerId: employeeId, direction: kind === "WAGE" ? "PAYABLE" : "RECEIVABLE", currency: "DZD", ...actor });
        const original = producer.postEntry({ requestId: key(requestId, "zero-source-original"), debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: amount, currency: "DZD", note: reason, ...actor });
        this.repository.saveSource({ kind, amount, employeeId, currency: "DZD", sourceId, debtAccountId: account.id, debtEntryId: original.id });
        this.repository.saveCorrection({ id: original.id, sourceId, oldAmount: "0.00", newAmount: amount, reason, createdAt: original.createdAt, ...actor });
        return { id: original.id, oldAmount: "0.00", newAmount: amount };
      }
      const entries = this.finance.listEntries(source.debtAccountId);
      const current = entries.filter(row => row.status === "LIVE" && (row.id === source.debtEntryId || row.correctionOfEntryId === source.debtEntryId)).reduce((sum, row) => sum.add(Money.parse(row.signedAmountDzd)), Money.parse("0"));
      if (current.toWire() !== expectedAmount) throw new PayrollDomainError("Opening amount changed; refresh before confirming", "CONFLICT");
      if (this.repository.listProposals(employeeId).some(row => row.sourceId === source.sourceId && row.status === "PENDING")) throw new PayrollDomainError("Resolve or cancel the pending correction first", "CONFLICT");
      const producer = this.finance.forProducer({ type: "PAYROLL_OPENING", id: source.sourceId });
      const requiredRefund = current.subtract(Money.parse(producer.remaining(source.debtEntryId))).subtract(Money.parse(amount));
      if (requiredRefund.compare(Money.parse("0")) > 0) {
        const proposal = { id: this.dependencies.id(), sourceId: source.sourceId, employeeId, kind, oldAmount: current.toWire(), newAmount: amount, requiredRefund: requiredRefund.toWire(), reason, ...actor, createdAt: timestampSchema.parse(this.dependencies.now()), status: "PENDING" as const, resolution: null };
        this.repository.saveProposal(proposal);
        return { id: proposal.id, oldAmount: proposal.oldAmount, newAmount: amount, pending: true };
      }
      const saved = producer.correctOpeningEntry({ requestId: key(requestId, "ledger"), entryId: source.debtEntryId, amountDzd: amount, currency: "DZD", reason, ...actor });
      this.repository.saveCorrection({ id: saved.id, sourceId: source.sourceId, oldAmount: current.toWire(), newAmount: amount, reason, createdAt: saved.createdAt, ...actor });
      return { id: saved.id, oldAmount: current.toWire(), newAmount: amount };
    }, confirmedRefusal);
  }
}
