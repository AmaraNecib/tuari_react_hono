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
      return { employeeId, review: review ? "REVIEWED" as const : "UNREVIEWED" as const, reviewAudit, wages: review ? sources.find(row => row.kind === "WAGE")?.currentAmount ?? "0.00" : null, advances: review ? sources.find(row => row.kind === "ADVANCE")?.currentAmount ?? "0.00" : null, sources, history };
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
      const producer = this.finance.forProducer({ type: "PAYROLL_OPENING", id: source.sourceId });
      const saved = producer.correctOpeningEntry({ requestId: key(requestId, "ledger"), entryId: source.debtEntryId, amountDzd: amount, currency: "DZD", reason, ...actor });
      this.repository.saveCorrection({ id: saved.id, sourceId: source.sourceId, oldAmount: current.toWire(), newAmount: amount, reason, createdAt: saved.createdAt, ...actor });
      return { id: saved.id, oldAmount: current.toWire(), newAmount: amount };
    }, confirmedRefusal);
  }
}
