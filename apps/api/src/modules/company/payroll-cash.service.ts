import { createHash } from "node:crypto";
import { Money, exactSalaryCashInputSchema, exactSalaryOpeningReviewInputSchema, exactSalaryAdvanceRepaymentInputSchema, type ExactSalaryAdvanceRepaymentInput, type ExactSalaryCashInput, type ExactSalaryOpeningReviewInput } from "@tuari/contracts";
import { ExactDebtError, type ExactDebtAudit, type ExactFinanceService } from "./exact-finance.service";
import type { ExactWorkforceRepository } from "./workforce-exact.repository";
import type { PayrollCash, PayrollCashRepository, PayrollOpeningReview, PayrollSettlement } from "./payroll-cash.repository";
import { exactFinanceJson } from "./exact-finance-json";

const command = (root: string, part: string) => `payroll:${createHash("sha256").update(JSON.stringify(["cash", root, part])).digest("hex")}`;

/** Actual cash provenance and ledger mutations commit under the ledger's single durable receipt. */
export class PayrollCashService {
  constructor(private readonly repository: PayrollCashRepository, private readonly earnings: ExactWorkforceRepository, private readonly finance: ExactFinanceService, private readonly dependencies: { id(): string; now(): string }) {}
  private requireConnection(): void {
    const ledger = this.finance.transactionIdentity;
    for (const source of [this.repository.transactionIdentity, this.earnings.transactionIdentity]) {
      if (source.connection !== ledger.connection || source.lock !== ledger.lock) throw new ExactDebtError("Payroll cash requires the same connection and shared FIFO");
    }
  }
  getOpeningStatus(employeeId: string) {
    this.requireConnection();
    return this.repository.withTransaction(() => {
      if (!this.earnings.employeeExists(employeeId)) throw new ExactDebtError("Employee not found", "NOT_FOUND");
      const review = this.repository.getEmployeeOpening(employeeId);
      return { status: review?.status ?? "UNREVIEWED", reminder: review?.status !== "REVIEWED", review };
    });
  }
  reviewOpening(raw: ExactSalaryOpeningReviewInput & ExactDebtAudit): PayrollOpeningReview {
    exactFinanceJson(raw);
    const { actorUserId = null, actorLabel = null, transactionId = null, ...domain } = raw;
    const input = exactSalaryOpeningReviewInputSchema.parse(domain);
    const audit = { actorUserId, actorLabel, transactionId };
    this.requireConnection();
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "PAYROLL_OPENING", id: command(input.requestId, "opening-review") }, intent: { kind: "review-payroll-opening", input }, ...audit }, this.repository, () => {
      if (!this.earnings.employeeExists(input.employeeId)) throw new ExactDebtError("Employee not found", "NOT_FOUND");
      this.finance.requireParty("INTERNAL_WORKER", input.employeeId);
      if (this.repository.getEmployeeOpening(input.employeeId)?.status === "REVIEWED") throw new ExactDebtError("Payroll opening already reviewed", "CONFLICT");
      const id = this.dependencies.id();
      const scoped = this.finance.forProducer({ type: "PAYROLL_OPENING", id });
      const post = (amount: string, direction: "PAYABLE" | "RECEIVABLE") => {
        if (amount === "0.00") return { accountId: null, entryId: null };
        const account = scoped.createAccount({ requestId: command(input.requestId, `opening-account:${direction}`), partyType: "INTERNAL_WORKER", workerId: input.employeeId, direction, currency: input.currency, ...audit });
        // The reviewed source may be entered after cash. It is an explicit obligation, not the account's initial balance.
        const entry = scoped.postEntry({ requestId: command(input.requestId, `opening-original:${direction}`), debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: amount, currency: input.currency, ...audit });
        return { accountId: account.id, entryId: entry.id };
      };
      const wages = input.review.status === "REVIEWED" ? post(input.review.wagesOwed, "PAYABLE") : { accountId: null, entryId: null };
      const advances = input.review.status === "REVIEWED" ? post(input.review.advancesOwed, "RECEIVABLE") : { accountId: null, entryId: null };
      const review: PayrollOpeningReview = { id, employeeId: input.employeeId, currency: input.currency, status: input.review.status, wagesOwed: input.review.status === "REVIEWED" ? input.review.wagesOwed : null, advancesOwed: input.review.status === "REVIEWED" ? input.review.advancesOwed : null, wageDebtAccountId: wages.accountId, wageDebtEntryId: wages.entryId, advanceDebtAccountId: advances.accountId, advanceDebtEntryId: advances.entryId, ...audit, createdAt: this.dependencies.now() };
      this.repository.saveOpening(review);
      return review;
    });
  }
  repayAdvance(raw: ExactSalaryAdvanceRepaymentInput & ExactDebtAudit): PayrollSettlement {
    exactFinanceJson(raw);
    const { actorUserId = null, actorLabel = null, transactionId = null, ...domain } = raw;
    const input = exactSalaryAdvanceRepaymentInputSchema.parse(domain);
    const audit = { actorUserId, actorLabel, transactionId };
    this.requireConnection();
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "PAYROLL_ADVANCE", id: command(input.requestId, "repay-advance") }, intent: { kind: "repay-payroll-advance", input }, ...audit }, this.repository, () => {
      if (!this.earnings.employeeExists(input.employeeId)) throw new ExactDebtError("Employee not found", "NOT_FOUND");
      const advance = input.source.kind === "ADVANCE" ? this.repository.getAdvance(input.source.id) : null;
      const opening = input.source.kind === "OPENING_ADVANCE" ? this.repository.getOpening(input.source.id) : null;
      const target = advance ?? (opening?.status === "REVIEWED" ? { employeeId: opening.employeeId, currency: opening.currency, amount: opening.advancesOwed, debtAccountId: opening.advanceDebtAccountId, debtEntryId: opening.advanceDebtEntryId } : null);
      if (!target || target.employeeId !== input.employeeId || target.currency !== input.currency || !target.debtAccountId || !target.debtEntryId) throw new ExactDebtError("Advance source not found", "NOT_FOUND");
      const producerType = input.source.kind === "ADVANCE" ? "PAYROLL_ADVANCE" : "PAYROLL_OPENING";
      const account = this.finance.detail(target.debtAccountId);
      if (account.account.workerId !== input.employeeId || account.account.partyType !== "INTERNAL_WORKER" || account.account.direction !== "RECEIVABLE" || account.account.currency !== input.currency) throw new ExactDebtError("Advance source account mismatch");
      const original = account.entries.find(row => row.id === target.debtEntryId);
      if (!original || original.status !== "LIVE" || original.producerType !== producerType || original.producerId !== input.source.id || original.signedAmountDzd !== target.amount || original.targetEntryId || original.correctionOfEntryId) throw new ExactDebtError("Advance source ledger mismatch");
      const payment = this.finance.forProducer({ type: producerType, id: input.source.id }).recordPayment({ requestId: command(input.requestId, "advance-repayment"), debtEntryId: target.debtEntryId, amountDzd: input.amount, currency: input.currency, ...audit });
      const settlement: PayrollSettlement = { id: this.dependencies.id(), employeeId: input.employeeId, currency: input.currency, source: input.source, amount: input.amount, paymentDate: input.paymentDate, debtAccountId: target.debtAccountId, debtEntryId: target.debtEntryId, paymentEntryId: payment.id, ...audit, createdAt: this.dependencies.now() };
      this.repository.saveSettlement(settlement);
      return settlement;
    });
  }
  recordCash(raw: ExactSalaryCashInput & ExactDebtAudit): PayrollCash {
    exactFinanceJson(raw);
    const { actorUserId = null, actorLabel = null, transactionId = null, ...domain } = raw;
    const input = exactSalaryCashInputSchema.parse(domain);
    const audit = { actorUserId, actorLabel, transactionId };
    this.requireConnection();
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "PAYROLL_EARNINGS", id: command(input.requestId, "aggregate") }, intent: { kind: "actual-payroll-cash", input }, ...audit }, this.repository, () => {
      if (!this.earnings.employeeExists(input.employeeId)) throw new ExactDebtError("Employee not found", "NOT_FOUND");
      this.finance.requireParty("INTERNAL_WORKER", input.employeeId);
      const id = this.dependencies.id();
      const wageAllocations = input.wageAllocations.map(row => {
        const earning = row.source.kind === "EARNING" ? this.earnings.getEarning(row.source.id) : null;
        const opening = row.source.kind === "OPENING" ? this.repository.getOpening(row.source.id) : null;
        const earned = earning ?? (opening?.status === "REVIEWED" ? { id: opening.id, employeeId: opening.employeeId, currency: opening.currency, approvedAmount: opening.wagesOwed, debtAccountId: opening.wageDebtAccountId, debtEntryId: opening.wageDebtEntryId } : null);
        const producerType = row.source.kind === "EARNING" ? "PAYROLL_EARNINGS" : "PAYROLL_OPENING";
        if (!earned || earned.employeeId !== input.employeeId || earned.currency !== input.currency || !earned.debtAccountId || !earned.debtEntryId) throw new ExactDebtError("Wage source not found", "NOT_FOUND");
        const account = this.finance.getAccount(earned.debtAccountId);
        if (account.workerId !== input.employeeId || account.partyType !== "INTERNAL_WORKER" || account.direction !== "PAYABLE" || account.currency !== input.currency) throw new ExactDebtError("Wage source account mismatch");
        const detail = this.finance.detail(account.id);
        const original = detail.entries.find(entry => entry.id === earned.debtEntryId);
        if (!original || original.status !== "LIVE" || original.producerType !== producerType || original.producerId !== earned.id || original.targetEntryId || original.correctionOfEntryId || original.signedAmountDzd !== earned.approvedAmount) throw new ExactDebtError("Wage source ledger mismatch");
        const payment = this.finance.forProducer({ type: producerType, id: earned.id }).recordPayment({ requestId: command(input.requestId, `allocation:${row.id}`), debtEntryId: earned.debtEntryId, amountDzd: row.amount, currency: input.currency, ...audit });
        return { ...row, debtAccountId: earned.debtAccountId, debtEntryId: earned.debtEntryId, paymentEntryId: payment.id };
      });
      let advance: PayrollCash["advance"] = null;
      if (input.advance) {
        const row = input.advance;
        const scoped = this.finance.forProducer({ type: "PAYROLL_ADVANCE", id: row.id });
        const account = scoped.createAccount({ requestId: command(input.requestId, "advance-account"), partyType: "INTERNAL_WORKER", workerId: input.employeeId, direction: "RECEIVABLE", currency: input.currency, ...audit });
        const entry = scoped.postEntry({ requestId: command(input.requestId, "advance-original"), debtAccountId: account.id, entryType: "ADVANCE", signedAmountDzd: Money.parse(row.amount).toWire(), currency: input.currency, ...audit });
        advance = { ...row, debtAccountId: account.id, debtEntryId: entry.id };
      }
      const cash: PayrollCash = { id, employeeId: input.employeeId, currency: input.currency, amount: input.amount, paymentDate: input.paymentDate, wageAllocations, advance, ...audit, createdAt: this.dependencies.now() };
      this.repository.saveCash(cash);
      return cash;
    });
  }
}
