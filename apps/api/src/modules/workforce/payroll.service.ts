import { Money, timestampSchema } from "@tuari/contracts";
import type { ExactFinanceService } from "../company/exact-finance.service";
import type { ExactDebtAccount, ExactDebtEntry } from "../company/exact-finance.repository";
import type { PayrollCashRepository, PayrollCashRecord } from "./payroll-cash.repository";
import type { PayrollSourceRepository } from "./payroll-source.repository";

export type PayrollAudit = { readonly actorUserId: string | null; readonly actorLabel: string | null; readonly transactionId: string | null };
type Dependencies = { readonly id: () => string; readonly now: () => string };
type WageInput = { readonly earningId: string; readonly amount: string };
type CashInput = PayrollAudit & { readonly requestId: string; readonly employeeId: string; readonly amount: string; readonly paymentDate: string; readonly wages: readonly WageInput[]; readonly advanceAmount?: string };
type RepaymentInput = PayrollAudit & { readonly requestId: string; readonly advanceId: string; readonly amount: string; readonly paymentDate: string };
const zero = Money.parse("0");
const payable = (account: ExactDebtAccount, worker: string, currency: string) => account.partyType === "INTERNAL_WORKER" && account.workerId === worker && account.direction === "PAYABLE" && account.currency === currency;
const receivable = (account: ExactDebtAccount, worker: string, currency: string) => account.partyType === "INTERNAL_WORKER" && account.workerId === worker && account.direction === "RECEIVABLE" && account.currency === currency;

/** Internal payroll commands. Every write joins finance's immediate transaction and replay receipt. */
export class PayrollService {
  constructor(private readonly finance: ExactFinanceService, private readonly cash: PayrollCashRepository, private readonly sources: PayrollSourceRepository, private readonly dependencies: Dependencies) {
    const identity = finance.transactionIdentity;
    for (const participant of [cash, sources]) if (participant.transactionIdentity.connection !== identity.connection || participant.transactionIdentity.lock !== identity.lock) throw new TypeError("Payroll participants require the same connection and shared FIFO");
  }

  registerEarning(input: PayrollAudit & { readonly requestId: string; readonly earningId: string }): ExactDebtEntry | null {
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "PAYROLL_EARNINGS", id: input.earningId }, intent: { kind: "register-earning", earningId: input.earningId }, actorUserId: input.actorUserId, actorLabel: input.actorLabel }, this.sources, () => {
      const source = this.sources.getEarning(input.earningId);
      if (!source) throw new Error("Approved earning source not found");
      if (source.original) return source.original;
      if (Money.parse(source.amount).compare(zero) === 0) return null;
      const producer = this.finance.forProducer({ type: "PAYROLL_EARNINGS", id: source.id });
      const debtAudit = { actorUserId: input.actorUserId, actorLabel: input.actorLabel, transactionId: input.transactionId };
      const account = producer.createAccount({ requestId: `payroll-account:${source.id}`, partyType: "INTERNAL_WORKER", workerId: source.employeeId, direction: "PAYABLE", currency: "DZD", ...debtAudit });
      return producer.postEntry({ requestId: `payroll-original:${source.id}`, debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: source.amount, currency: "DZD", ...debtAudit } as never);
    });
  }

  recordCash(input: CashInput): PayrollCashRecord {
    const date = timestampSchema.parse(input.paymentDate);
    const amount = Money.parse(input.amount, "DZD").toWire();
    const wages = input.wages.map(row => ({ earningId: row.earningId, amount: Money.parse(row.amount, "DZD").toWire() }));
    const advanceAmount = input.advanceAmount === undefined ? null : Money.parse(input.advanceAmount, "DZD").toWire();
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "PAYROLL_EARNINGS", id: input.employeeId }, intent: { kind: "cash-payment", employeeId: input.employeeId, amount, paymentDate: date, wages, advanceAmount }, actorUserId: input.actorUserId, actorLabel: input.actorLabel }, this.cash, () => {
      if (!wages.length && !advanceAmount) throw new Error("Cash requires an explicit wage or advance allocation");
      const sum = wages.reduce((n, row) => n + BigInt(Money.parse(row.amount).toMinorUnits()), advanceAmount ? BigInt(Money.parse(advanceAmount).toMinorUnits()) : 0n);
      if (sum !== BigInt(Money.parse(amount).toMinorUnits())) throw new Error("Cash total must equal explicit wage allocations and advance");
      if (new Set(wages.map(row => row.earningId)).size !== wages.length) throw new Error("Duplicate earning allocation");
      const timestamp = timestampSchema.parse(this.dependencies.now());
      const audit = { actorUserId: input.actorUserId, actorLabel: input.actorLabel, transactionId: input.transactionId, createdAt: timestamp };
      const wageAllocations = wages.map(row => {
        const source = this.sources.getEarning(row.earningId);
        if (!source || source.employeeId !== input.employeeId || source.currency !== "DZD" || Money.parse(source.amount).compare(zero) <= 0) throw new Error("Invalid approved earning source");
        const original = source.original ?? this.registerEarning({ ...input, requestId: `${input.requestId}:registration:${source.id}`, earningId: source.id });
        if (!original) throw new Error("Positive earning original is required");
        const account = this.finance.forProducer({ type: "PAYROLL_EARNINGS", id: source.id }).getAccount(original.debtAccountId);
        if (!payable(account, input.employeeId, "DZD") || original.producerType !== "PAYROLL_EARNINGS" || original.producerId !== source.id || original.status !== "LIVE") throw new Error("Earning debt linkage mismatch");
        const scoped = this.finance.forProducer({ type: "PAYROLL_EARNINGS", id: source.id });
        const remaining = Money.parse(scoped.remaining(original.id));
        if (Money.parse(row.amount).compare(remaining) > 0) throw new Error("Wage allocation exceeds remaining earning");
        const payment = scoped.recordPayment({ requestId: `${input.requestId}:wage:${source.id}`, debtEntryId: original.id, amountDzd: row.amount, currency: "DZD", paymentMethod: "CASH", actorUserId: input.actorUserId, actorLabel: input.actorLabel, transactionId: input.transactionId });
        return { id: this.dependencies.id(), source: { kind: "EARNING" as const, id: source.id }, amount: row.amount, debtAccountId: account.id, debtEntryId: original.id, paymentEntryId: payment.id };
      });
      let advance = null;
      if (advanceAmount) {
        const sourceId = this.dependencies.id();
        const producer = this.finance.forProducer({ type: "PAYROLL_ADVANCE", id: sourceId });
        const debtAudit = { actorUserId: input.actorUserId, actorLabel: input.actorLabel, transactionId: input.transactionId };
        const account = producer.createAccount({ requestId: `${input.requestId}:advance-account`, partyType: "INTERNAL_WORKER", workerId: input.employeeId, direction: "RECEIVABLE", currency: "DZD", ...debtAudit });
        const original = producer.postEntry({ requestId: `${input.requestId}:advance-original`, debtAccountId: account.id, entryType: "ADVANCE", signedAmountDzd: advanceAmount, currency: "DZD", ...debtAudit } as never);
        advance = { id: sourceId, amount: advanceAmount, debtAccountId: account.id, debtEntryId: original.id };
      }
      const record: PayrollCashRecord = { id: this.dependencies.id(), employeeId: input.employeeId, currency: "DZD", amount, paymentDate: date, ...audit, wageAllocations, advance };
      this.cash.saveCash(record);
      return record;
    });
  }

  repayAdvance(input: RepaymentInput): ReturnType<PayrollCashRepository["getSettlement"]> {
    const date = timestampSchema.parse(input.paymentDate);
    const amount = Money.parse(input.amount, "DZD").toWire();
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "PAYROLL_ADVANCE", id: input.advanceId }, intent: { kind: "advance-cash-repayment", advanceId: input.advanceId, amount, paymentDate: date }, actorUserId: input.actorUserId, actorLabel: input.actorLabel }, this.cash, () => {
      const source = this.sources.getAdvance(input.advanceId);
      if (!source || source.employeeId !== this.cash.getAdvance(input.advanceId)?.employeeId || !receivable(source.account, source.employeeId, "DZD")) throw new Error("Selected advance source is invalid");
      const producer = this.finance.forProducer({ type: "PAYROLL_ADVANCE", id: input.advanceId });
      if (source.original.producerId !== input.advanceId || Money.parse(amount).compare(Money.parse(producer.remaining(source.original.id))) > 0) throw new Error("Repayment exceeds selected advance");
      const timestamp = timestampSchema.parse(this.dependencies.now());
      const payment = producer.recordPayment({ requestId: `${input.requestId}:repayment`, debtEntryId: source.original.id, amountDzd: amount, currency: "DZD", paymentMethod: "CASH", actorUserId: input.actorUserId, actorLabel: input.actorLabel, transactionId: input.transactionId });
      const settlement = { id: this.dependencies.id(), employeeId: source.employeeId, currency: "DZD" as const, amount, paymentDate: date, actorUserId: input.actorUserId, actorLabel: input.actorLabel, transactionId: input.transactionId, createdAt: timestamp, source: { kind: "ADVANCE" as const, id: input.advanceId }, debtAccountId: source.account.id, debtEntryId: source.original.id, paymentEntryId: payment.id };
      this.cash.saveSettlement(settlement);
      return settlement;
    });
  }
}
