import { createHash } from "node:crypto";
import { z } from "zod";
import { Money, auditActorUserIdSchema, auditTransactionIdSchema, timestampSchema } from "@tuari/contracts";
import type { ExactFinanceService } from "../company/exact-finance.service";
import type { ExactDebtAccount, ExactDebtEntry } from "../company/exact-finance.repository";
import type { PayrollCashRepository, PayrollCashRecord, PayrollSettlementRecord } from "./payroll-cash.repository";
import type { PayrollSourceRepository } from "./payroll-source.repository";

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
  wages: z.array(z.object({ earningId: entityId, amount: positiveMoney }).strict()).max(9999), advanceAmount: positiveMoney.optional() }).strict().superRefine((input, context) => {
  if (new Set(input.wages.map(row => row.earningId)).size !== input.wages.length) context.addIssue({ code: "custom", message: "Duplicate earning allocation" });
  if (1 + input.wages.length + (input.advanceAmount ? 1 : 0) > 10000) context.addIssue({ code: "custom", message: "Payroll cash materialization limit exceeded" });
  try {
    const total = input.wages.reduce((sum, row) => sum + BigInt(Money.parse(row.amount).toMinorUnits()), input.advanceAmount ? BigInt(Money.parse(input.advanceAmount).toMinorUnits()) : 0n);
    if (total !== BigInt(Money.parse(input.amount).toMinorUnits())) context.addIssue({ code: "custom", message: "Cash total must equal explicit wage allocations and advance" });
  } catch { context.addIssue({ code: "custom", message: "Invalid cash reconciliation" }); }
});
const repaymentSchema = z.object({ ...command, employeeId: entityId, advanceId: entityId, amount: positiveMoney, paymentDate: timestamp }).strict();
export type PayrollAudit = Pick<z.input<typeof registrationSchema>, "actorUserId" | "actorLabel" | "transactionId">;
export type PayrollCashInput = z.input<typeof cashSchema>;
export type PayrollRepaymentInput = z.input<typeof repaymentSchema>;
type Dependencies = { readonly id: () => string; readonly now: () => string };
const key = (...parts: string[]) => `payroll:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
const accountMatches = (account: ExactDebtAccount, employeeId: string, direction: "PAYABLE" | "RECEIVABLE") => account.partyType === "INTERNAL_WORKER" && account.workerId === employeeId && account.direction === direction && account.currency === "DZD";

/** Internal commands only. Finance owns balances, transaction reservation and replay. */
export class PayrollService {
  constructor(private readonly finance: ExactFinanceService, private readonly cash: PayrollCashRepository, private readonly sources: PayrollSourceRepository, private readonly dependencies: Dependencies) {
    const identity = finance.transactionIdentity;
    for (const participant of [cash, sources]) {
      if (participant.transactionIdentity.connection !== identity.connection || participant.transactionIdentity.lock !== identity.lock) throw new TypeError("Payroll participants require the same connection and shared FIFO");
    }
  }

  private registerSelectedEarning(earningId: string, requestId: string, audit: PayrollAudit, employeeId?: string): ExactDebtEntry | null {
    const source = this.sources.getEarning(earningId);
    if (!source || source.id !== earningId || source.currency !== "DZD" || (employeeId !== undefined && source.employeeId !== employeeId)) throw new Error("Invalid approved earning source");
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
        const original = this.registerSelectedEarning(row.earningId, requestId, audit, input.employeeId);
        if (!original) throw new Error("Positive earning original is required");
        const producer = this.finance.forProducer({ type: "PAYROLL_EARNINGS", id: row.earningId });
        const payment = producer.recordPayment({ requestId: key(requestId, "wage", row.earningId), debtEntryId: original.id, amountDzd: row.amount, currency: "DZD", paymentMethod: "CASH", ...audit });
        return { id: this.dependencies.id(), source: { kind: "EARNING" as const, id: row.earningId }, amount: row.amount, debtAccountId: original.debtAccountId, debtEntryId: original.id, paymentEntryId: payment.id };
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
    });
  }

  repayAdvance(raw: PayrollRepaymentInput): PayrollSettlementRecord {
    const input = repaymentSchema.parse(raw);
    const { requestId, actorUserId, actorLabel, transactionId, ...intent } = input;
    const audit = { actorUserId, actorLabel, transactionId };
    return this.finance.runAggregate({ requestId, producer: { type: "PAYROLL_ADVANCE", id: key("repay", requestId) }, intent: { kind: "advance-cash-repayment", ...intent }, ...audit }, this.cash, () => {
      const source = this.sources.getAdvance(input.advanceId);
      const cashSource = this.cash.getAdvance(input.advanceId);
      if (!source || !cashSource || source.id !== input.advanceId || source.employeeId !== input.employeeId || cashSource.employeeId !== input.employeeId || source.currency !== "DZD" || !accountMatches(source.account, input.employeeId, "RECEIVABLE") || source.original.debtAccountId !== source.account.id || source.original.id !== cashSource.advance.debtEntryId || source.account.id !== cashSource.advance.debtAccountId || source.original.entryType !== "ADVANCE" || source.original.producerType !== "PAYROLL_ADVANCE" || source.original.producerId !== input.advanceId || source.original.status !== "LIVE" || source.original.targetEntryId || source.original.correctionOfEntryId || Money.parse(source.original.signedAmountDzd).compare(Money.parse(cashSource.advance.amount)) !== 0) throw new Error("Selected advance source is invalid");
      const producer = this.finance.forProducer({ type: "PAYROLL_ADVANCE", id: input.advanceId });
      const payment = producer.recordPayment({ requestId: key(requestId, "repayment"), debtEntryId: source.original.id, amountDzd: input.amount, currency: "DZD", paymentMethod: "CASH", ...audit });
      const settlement: PayrollSettlementRecord = { id: this.dependencies.id(), employeeId: input.employeeId, currency: "DZD", amount: input.amount, paymentDate: input.paymentDate, ...audit, createdAt: timestamp.parse(this.dependencies.now()), source: { kind: "ADVANCE", id: input.advanceId }, debtAccountId: source.account.id, debtEntryId: source.original.id, paymentEntryId: payment.id };
      this.cash.saveSettlement(settlement);
      return settlement;
    });
  }
}
