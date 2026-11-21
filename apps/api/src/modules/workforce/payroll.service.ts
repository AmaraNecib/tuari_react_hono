import { createHash } from "node:crypto";
import { z } from "zod";
import { Money, auditActorUserIdSchema, auditTransactionIdSchema, timestampSchema } from "@tuari/contracts";
import { ExactDebtError, type ExactFinanceService } from "../company/exact-finance.service";
import type { ExactDebtAccount, ExactDebtEntry } from "../company/exact-finance.repository";
import type { PayrollCashRepository, PayrollCashRecord, PayrollSettlementRecord } from "./payroll-cash.repository";
import type { PayrollSourceRepository } from "./payroll-source.repository";
import type { PayrollOffsetRecord, PayrollOffsetRepository } from "./payroll-offset.repository";
import type { PayrollOpeningReviewProvider } from "./payroll-lifecycle";

export class PayrollDomainError extends Error {
  constructor(message: string, readonly code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT") {
    super(message);
    this.name = "PayrollDomainError";
  }
}

export class PayrollNotCommittedError extends PayrollDomainError {}

function confirmedRefusal(cause: unknown): unknown {
  return cause instanceof PayrollDomainError || cause instanceof ExactDebtError
    ? new PayrollNotCommittedError(cause.message, cause.code)
    : cause;
}

const entityId = z.string().min(1).max(128);
const positiveMoney = z.string().max(96).transform((value, context) => {
  try {
    const amount = Money.parse(value, "DZD");
    if (amount.compare(Money.parse("0")) <= 0) throw new Error("Nonpositive payroll amount");
    return amount.toWire();
  } catch { context.addIssue({ code: "custom", message: "Payroll amount must be positive bounded exact money" }); return z.NEVER; }
});
const timestamp = timestampSchema.transform(value => new Date(value).toISOString());
const command = { requestId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/), actorUserId: auditActorUserIdSchema, actorLabel: z.string().max(1000).nullable(), transactionId: auditTransactionIdSchema };
const registrationSchema = z.object({ ...command, earningId: entityId }).strict();
const cashSchema = z.object({ ...command, employeeId: entityId, amount: positiveMoney, paymentDate: timestamp,
  wages: z.array(z.union([z.object({ earningId: entityId, amount: positiveMoney }).strict(), z.object({ openingId: entityId, amount: positiveMoney }).strict()])).max(9999), advanceAmount: positiveMoney.optional() }).strict().superRefine((input, context) => {
  if (new Set(input.wages.map(row => "earningId" in row ? `EARNING:${row.earningId}` : `OPENING:${row.openingId}`)).size !== input.wages.length) context.addIssue({ code: "custom", message: "Duplicate earning allocation" });
  if (1 + input.wages.length + (input.advanceAmount ? 1 : 0) > 10000) context.addIssue({ code: "custom", message: "Payroll cash materialization limit exceeded" });
  try {
    const total = input.wages.reduce((sum, row) => sum + BigInt(Money.parse(row.amount).toMinorUnits()), input.advanceAmount ? BigInt(Money.parse(input.advanceAmount).toMinorUnits()) : 0n);
    if (total !== BigInt(Money.parse(input.amount).toMinorUnits())) context.addIssue({ code: "custom", message: "Cash total must equal explicit wage allocations and advance" });
  } catch { context.addIssue({ code: "custom", message: "Invalid cash reconciliation" }); }
});
const repaymentSchema = z.object({ ...command, employeeId: entityId, advanceId: entityId.optional(), openingAdvanceId: entityId.optional(), amount: positiveMoney, paymentDate: timestamp }).strict().refine(value => Boolean(value.advanceId) !== Boolean(value.openingAdvanceId), "Choose exactly one advance source");
const offsetSchema = z.object({ ...command, employeeId: entityId, amount: positiveMoney, settlementDate: timestamp,
  wageSource: z.object({ kind: z.enum(["EARNING", "OPENING"]), id: entityId }).strict(),
  advanceSource: z.object({ kind: z.enum(["ADVANCE", "OPENING_ADVANCE"]), id: entityId }).strict() }).strict();
export type PayrollAudit = Pick<z.input<typeof registrationSchema>, "actorUserId" | "actorLabel" | "transactionId">;
export type PayrollCashInput = z.input<typeof cashSchema>;
export type PayrollRepaymentInput = z.input<typeof repaymentSchema>;
export type PayrollOffsetInput = z.input<typeof offsetSchema>;
type Dependencies = { readonly id: () => string; readonly now: () => string };
const key = (...parts: string[]) => `payroll:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
const accountMatches = (account: ExactDebtAccount, employeeId: string, direction: "PAYABLE" | "RECEIVABLE") => account.partyType === "INTERNAL_WORKER" && account.workerId === employeeId && account.direction === direction && account.currency === "DZD";

/** Internal commands only. Finance owns balances, transaction reservation and replay. */
export class PayrollService {
  constructor(private readonly finance: ExactFinanceService, private readonly cash: PayrollCashRepository, private readonly sources: PayrollSourceRepository, private readonly dependencies: Dependencies, private readonly offsets?: PayrollOffsetRepository, private readonly opening?: PayrollOpeningReviewProvider) {
    const identity = finance.transactionIdentity;
    for (const participant of [cash, sources, ...(offsets ? [offsets] : []), ...(opening ? [opening] : [])]) {
      if (participant.transactionIdentity.connection !== identity.connection || participant.transactionIdentity.lock !== identity.lock) throw new TypeError("Payroll participants require the same connection and shared FIFO");
    }
  }

  private registerSelectedEarning(earningId: string, requestId: string, audit: PayrollAudit, employeeId?: string): ExactDebtEntry | null {
    const source = this.sources.getEarning(earningId);
    if (!source || source.id !== earningId || (employeeId !== undefined && source.employeeId !== employeeId)) throw new PayrollDomainError("Approved earning was not found for this employee", "NOT_FOUND");
    if (source.currency !== "DZD") throw new PayrollDomainError("Approved earning uses an unsupported currency", "BAD_REQUEST");
    const amount = Money.parse(source.amount);
    if (amount.compare(Money.parse("0")) < 0) throw new Error("Invalid approved earning amount");
    if (source.original) {
      const original = source.original;
      if (!source.account || !accountMatches(source.account, source.employeeId, "PAYABLE") || original.debtAccountId !== source.account.id || original.producerType !== "PAYROLL_EARNINGS" || original.producerId !== earningId || original.currency !== "DZD" || original.status !== "LIVE" || original.targetEntryId || original.correctionOfEntryId || Money.parse(original.signedAmountDzd).compare(amount) !== 0 || amount.compare(Money.parse("0")) <= 0) throw new Error("Earning debt linkage mismatch");
      return original;
    }
    if (source.account) throw new Error("Earning debt linkage mismatch");
    if (amount.compare(Money.parse("0")) === 0) return null;
    const producer = this.finance.forProducer({ type: "PAYROLL_EARNINGS", id: earningId });
    const account = producer.createAccount({ requestId: key(requestId, "earning-account", earningId), partyType: "INTERNAL_WORKER", workerId: source.employeeId, direction: "PAYABLE", currency: "DZD", ...audit });
    return producer.postEntry({ requestId: key(requestId, "earning-original", earningId), debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: amount.toWire(), currency: "DZD", ...audit });
  }

  registerEarning(raw: z.input<typeof registrationSchema>): ExactDebtEntry | null {
    const input = registrationSchema.parse(raw);
    const { requestId, earningId, ...audit } = input;
    return this.finance.runAggregate({ requestId, producer: { type: "PAYROLL_EARNINGS", id: key("register", requestId) }, intent: { kind: "register-earning", earningId }, ...audit }, this.sources,
      () => this.registerSelectedEarning(earningId, requestId, audit));
  }

  recordCash(raw: PayrollCashInput): PayrollCashRecord {
    const input = cashSchema.parse(raw);
    const { requestId, actorUserId, actorLabel, transactionId, ...intent } = input;
    const audit = { actorUserId, actorLabel, transactionId };
    return this.finance.runAggregate({ requestId, producer: { type: "PAYROLL_EARNINGS", id: key("cash", requestId) }, intent: { kind: "cash-payment", ...intent }, ...audit }, this.cash, () => {
      const wageAllocations = input.wages.map(row => {
        const source = "earningId" in row ? { kind: "EARNING" as const, id: row.earningId } : { kind: "OPENING" as const, id: row.openingId };
        const original = "earningId" in row ? this.registerSelectedEarning(row.earningId, requestId, audit, input.employeeId) : this.selectedOpening(row.openingId, input.employeeId, "WAGE").original;
        if (!original) throw new PayrollDomainError("A positive approved earning is required", "BAD_REQUEST");
        const producer = this.finance.forProducer({ type: source.kind === "EARNING" ? "PAYROLL_EARNINGS" : "PAYROLL_OPENING", id: source.id });
        const payment = producer.recordPayment({ requestId: source.kind === "EARNING" ? key(requestId, "wage", source.id) : key(requestId, "opening-wage", source.id), debtEntryId: original.id, amountDzd: row.amount, currency: "DZD", paymentMethod: "CASH", ...audit });
        return { id: this.dependencies.id(), source, amount: row.amount, debtAccountId: original.debtAccountId, debtEntryId: original.id, paymentEntryId: payment.id };
      });
      let advance: PayrollCashRecord["advance"] = null;
      if (input.advanceAmount) {
        const sourceId = this.dependencies.id();
        const producer = this.finance.forProducer({ type: "PAYROLL_ADVANCE", id: sourceId });
        const account = producer.createAccount({ requestId: key(requestId, "advance-account"), partyType: "INTERNAL_WORKER", workerId: input.employeeId, direction: "RECEIVABLE", currency: "DZD", ...audit });
        const original = producer.postEntry({ requestId: key(requestId, "advance-original"), debtAccountId: account.id, entryType: "ADVANCE", signedAmountDzd: input.advanceAmount, currency: "DZD", ...audit });
        advance = { id: sourceId, amount: input.advanceAmount, debtAccountId: account.id, debtEntryId: original.id };
      }
      const record: PayrollCashRecord = { id: this.dependencies.id(), employeeId: input.employeeId, currency: "DZD", amount: input.amount, paymentDate: input.paymentDate, ...audit, createdAt: timestamp.parse(this.dependencies.now()), wageAllocations, advance };
      this.cash.saveCash(record);
      return record;
    }, confirmedRefusal);
  }

  private selectedOpening(sourceId: string, employeeId: string, kind: "WAGE" | "ADVANCE") {
    const review = this.opening?.getReview(employeeId);
    const source = review?.state === "REVIEWED" ? review.sources.find(row => row.sourceId === sourceId && row.kind === kind) : undefined;
    if (!source || source.employeeId !== employeeId || source.currency !== "DZD") throw new PayrollDomainError("Reviewed opening source was not found", "NOT_FOUND");
    const account = this.finance.getAccount(source.debtAccountId);
    const original = this.finance.listEntries(account.id).find(row => row.id === source.debtEntryId);
    if (!original || !accountMatches(account, employeeId, kind === "WAGE" ? "PAYABLE" : "RECEIVABLE") || original.status !== "LIVE" || original.targetEntryId || original.correctionOfEntryId || original.producerType !== "PAYROLL_OPENING" || original.producerId !== sourceId || original.currency !== "DZD" || original.signedAmountDzd !== Money.parse(source.amount).toWire()) throw new PayrollDomainError("Opening ledger linkage mismatch", "CONFLICT");
    return { account, original };
  }

  private selectedAdvance(advanceId: string, employeeId: string) {
    const source = this.sources.getAdvance(advanceId);
    const cashSource = this.cash.getAdvance(advanceId);
    if (!source || !cashSource || source.id !== advanceId || source.employeeId !== employeeId || cashSource.employeeId !== employeeId) throw new PayrollDomainError("Advance was not found for this employee", "NOT_FOUND");
    if (source.currency !== "DZD" || cashSource.currency !== "DZD" || !accountMatches(source.account, employeeId, "RECEIVABLE") || source.original.debtAccountId !== source.account.id || source.original.id !== cashSource.advance.debtEntryId || source.account.id !== cashSource.advance.debtAccountId || source.original.entryType !== "ADVANCE" || source.original.producerType !== "PAYROLL_ADVANCE" || source.original.producerId !== advanceId || source.original.currency !== "DZD" || source.original.status !== "LIVE" || source.original.targetEntryId || source.original.correctionOfEntryId || Money.parse(source.original.signedAmountDzd).compare(Money.parse(cashSource.advance.amount)) !== 0 || Money.parse(source.amount).compare(Money.parse(cashSource.advance.amount)) !== 0) throw new Error("Payroll advance ledger linkage mismatch");
    return source;
  }

  offsetAdvance(raw: PayrollOffsetInput): PayrollOffsetRecord {
    const input = offsetSchema.parse(raw);
    const offsets = this.offsets;
    if (!offsets) throw new Error("Payroll offset persistence is not configured");
    if (input.wageSource.kind !== "EARNING" || input.advanceSource.kind !== "ADVANCE") throw new PayrollDomainError("Reviewed opening sources are not available for settlement", "BAD_REQUEST");
    const { requestId, actorUserId, actorLabel, transactionId, ...intent } = input;
    const audit = { actorUserId, actorLabel, transactionId };
    return this.finance.runAggregate({ requestId, producer: { type: "PAYROLL_ADVANCE", id: key("offset", requestId) }, intent: { kind: "explicit-wage-advance-offset", ...intent }, ...audit }, offsets, () => {
      const wageOriginal = this.registerSelectedEarning(input.wageSource.id, requestId, audit, input.employeeId);
      if (!wageOriginal) throw new PayrollDomainError("A positive approved earning is required", "BAD_REQUEST");
      const advance = this.selectedAdvance(input.advanceSource.id, input.employeeId);
      const wages = this.finance.forProducer({ type: "PAYROLL_EARNINGS", id: input.wageSource.id });
      const advances = this.finance.forProducer({ type: "PAYROLL_ADVANCE", id: input.advanceSource.id });
      const amount = Money.parse(input.amount);
      if (amount.compare(Money.parse(wages.remaining(wageOriginal.id))) > 0 || amount.compare(Money.parse(advances.remaining(advance.original.id))) > 0) throw new PayrollDomainError("Offset exceeds the remaining wages or advance", "CONFLICT");
      const wageEntry = wages.recordSettlement({ requestId: key(requestId, "offset-wage", input.wageSource.id), debtEntryId: wageOriginal.id, amountDzd: input.amount, currency: "DZD", ...audit });
      const advanceEntry = advances.recordSettlement({ requestId: key(requestId, "offset-advance", input.advanceSource.id), debtEntryId: advance.original.id, amountDzd: input.amount, currency: "DZD", ...audit });
      const record: PayrollOffsetRecord = { id: this.dependencies.id(), employeeId: input.employeeId, currency: "DZD", amount: input.amount, settlementDate: input.settlementDate, ...audit, createdAt: timestamp.parse(this.dependencies.now()),
        wageSource: input.wageSource, advanceSource: input.advanceSource,
        wage: { debtAccountId: wageOriginal.debtAccountId, debtEntryId: wageOriginal.id, settlementEntryId: wageEntry.id },
        advance: { debtAccountId: advance.account.id, debtEntryId: advance.original.id, settlementEntryId: advanceEntry.id } };
      offsets.saveOffset(record);
      return record;
    }, confirmedRefusal);
  }

  repayAdvance(raw: PayrollRepaymentInput): PayrollSettlementRecord {
    const input = repaymentSchema.parse(raw);
    const { requestId, actorUserId, actorLabel, transactionId, ...intent } = input;
    const audit = { actorUserId, actorLabel, transactionId };
    return this.finance.runAggregate({ requestId, producer: { type: "PAYROLL_ADVANCE", id: key("repay", requestId) }, intent: { kind: "advance-cash-repayment", ...intent }, ...audit }, this.cash, () => {
      const source = input.advanceId ? this.selectedAdvance(input.advanceId, input.employeeId) : this.selectedOpening(input.openingAdvanceId!, input.employeeId, "ADVANCE");
      const sourceId = input.advanceId ?? input.openingAdvanceId!;
      const producer = this.finance.forProducer({ type: input.advanceId ? "PAYROLL_ADVANCE" : "PAYROLL_OPENING", id: sourceId });
      const payment = producer.recordPayment({ requestId: key(requestId, "repayment"), debtEntryId: source.original.id, amountDzd: input.amount, currency: "DZD", paymentMethod: "CASH", ...audit });
      const settlement: PayrollSettlementRecord = { id: this.dependencies.id(), employeeId: input.employeeId, currency: "DZD", amount: input.amount, paymentDate: input.paymentDate, ...audit, createdAt: timestamp.parse(this.dependencies.now()), source: { kind: input.advanceId ? "ADVANCE" : "OPENING_ADVANCE", id: sourceId }, debtAccountId: source.account.id, debtEntryId: source.original.id, paymentEntryId: payment.id };
      this.cash.saveSettlement(settlement);
      return settlement;
    }, confirmedRefusal);
  }
}
