import { createHash } from "node:crypto";
import { Money, sumMoneyHistory, exactSalaryCashInputSchema, exactSalaryOpeningReviewInputSchema, exactSalaryAdvanceRepaymentInputSchema, exactSalaryCorrectionInputSchema, type ExactSalaryAdvanceRepaymentInput, type ExactSalaryCashInput, type ExactSalaryCorrectionInput, type ExactSalaryOpeningReviewInput } from "@tuari/contracts";
import { ExactDebtError, type ExactDebtAudit, type ExactFinanceService } from "./exact-finance.service";
import type { ExactSalaryEarning, ExactWorkforceRepository } from "./workforce-exact.repository";
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
  listEmployeeLifecycle(employeeId: string) {
    this.requireConnection();
    return this.repository.withTransaction(() => {
      if (!this.earnings.employeeExists(employeeId)) throw new ExactDebtError("Employee not found", "NOT_FOUND");
      const opening = this.repository.getEmployeeOpening(employeeId);
      const earningRows = this.earnings.listEarnings(employeeId);
      const remainingByAccount = new Map<string, Map<string, string>>();
      const earnings = earningRows.map(earning => {
        if (!earning.debtEntryId) return { earning, remainingAmount: "0.00" };
        if (!earning.debtAccountId) throw new ExactDebtError("Live debt entry not found", "NOT_FOUND");
        let remaining = remainingByAccount.get(earning.debtAccountId);
        if (!remaining) {
          const detail = this.finance.detail(earning.debtAccountId);
          remaining = new Map(detail.entries.filter(row => row.remainingDzd !== null && row.signedAmountDzd !== "0.00").map(row => [row.id, row.remainingDzd!]));
          remainingByAccount.set(earning.debtAccountId, remaining);
        }
        const amount = remaining.get(earning.debtEntryId);
        if (amount === undefined) throw new ExactDebtError("Live debt entry not found", "NOT_FOUND");
        return { earning, remainingAmount: amount };
      });
      const cash = this.repository.listCash(employeeId);
      const settlements = this.repository.listSettlements(employeeId);
      const corrections = this.repository.listCorrections(employeeId);
      for (const payment of cash) {
        for (const allocation of payment.wageAllocations) {
          const source = allocation.source.kind === "EARNING" ? this.earnings.getEarning(allocation.source.id) : this.repository.getOpening(allocation.source.id);
          const account = this.finance.getAccount(allocation.debtAccountId);
          const detail = this.finance.detail(allocation.debtAccountId);
          const original = detail.entries.find(entry => entry.id === allocation.debtEntryId);
          const receipt = detail.entries.find(entry => entry.id === allocation.paymentEntryId);
          const producerType = allocation.source.kind === "EARNING" ? "PAYROLL_EARNINGS" : "PAYROLL_OPENING";
          const sourceAmount = allocation.source.kind === "EARNING" ? (source as ExactSalaryEarning | null)?.approvedAmount : (source as PayrollOpeningReview | null)?.wagesOwed;
          if (!source || source.employeeId !== employeeId || source.currency !== payment.currency || !original || original.status !== "LIVE" || original.producerType !== producerType || original.producerId !== allocation.source.id || original.signedAmountDzd !== sourceAmount || original.targetEntryId || original.correctionOfEntryId || !receipt || receipt.status !== "LIVE" || receipt.entryType !== "PAYMENT" || receipt.targetEntryId !== original.id || receipt.producerType !== producerType || receipt.producerId !== allocation.source.id || receipt.signedAmountDzd !== Money.parse(allocation.amount).negate().toWire() || account.workerId !== employeeId || account.direction !== "PAYABLE" || account.currency !== payment.currency) throw new ExactDebtError("Payroll cash source ledger mismatch");
        }
        if (payment.advance) {
          const account = this.finance.getAccount(payment.advance.debtAccountId);
          const entry = this.finance.detail(payment.advance.debtAccountId).entries.find(row => row.id === payment.advance!.debtEntryId);
          if (!entry || entry.status !== "LIVE" || entry.entryType !== "ADVANCE" || entry.producerType !== "PAYROLL_ADVANCE" || entry.producerId !== payment.advance.id || entry.signedAmountDzd !== payment.advance.amount || account.workerId !== employeeId || account.direction !== "RECEIVABLE" || account.currency !== payment.currency) throw new ExactDebtError("Payroll advance source ledger mismatch");
        }
      }
      for (const settlement of settlements) {
        const target = settlement.source.kind === "ADVANCE" ? this.repository.getAdvance(settlement.source.id) : this.repository.getOpening(settlement.source.id);
        const advanceTarget = target as { debtAccountId: string; debtEntryId: string } | null;
        const debtAccountId = settlement.source.kind === "ADVANCE" ? advanceTarget?.debtAccountId : (target as PayrollOpeningReview | null)?.advanceDebtAccountId;
        const debtEntryId = settlement.source.kind === "ADVANCE" ? advanceTarget?.debtEntryId : (target as PayrollOpeningReview | null)?.advanceDebtEntryId;
        const detail = debtAccountId ? this.finance.detail(debtAccountId) : null;
        const original = detail?.entries.find(row => row.id === debtEntryId);
        const payment = detail?.entries.find(row => row.id === settlement.paymentEntryId);
        if (!target || target.employeeId !== employeeId || target.currency !== settlement.currency || !original || original.status !== "LIVE" || original.producerType !== (settlement.source.kind === "ADVANCE" ? "PAYROLL_ADVANCE" : "PAYROLL_OPENING") || original.producerId !== settlement.source.id || !payment || payment.status !== "LIVE" || payment.targetEntryId !== original.id || payment.signedAmountDzd !== Money.parse(settlement.amount).negate().toWire()) throw new ExactDebtError("Payroll settlement source ledger mismatch");
      }
      for (const correction of corrections) {
        const earning = this.earnings.getEarning(correction.earningId);
        const detail = earning?.debtAccountId ? this.finance.detail(earning.debtAccountId) : null;
        const entry = detail?.entries.find(row => row.id === correction.correctionEntryId);
        const delta = Money.parse(correction.newAmount).subtract(Money.parse(correction.previousAmount));
        if (!earning || earning.employeeId !== employeeId || earning.debtEntryId !== entry?.correctionOfEntryId || entry?.producerType !== "PAYROLL_EARNINGS" || entry.producerId !== earning.id || Money.parse(entry.signedAmountDzd).compare(delta) !== 0) throw new ExactDebtError("Payroll correction source ledger mismatch");
      }
      return { opening, earnings, cash, settlements, corrections };
    });
  }
  correctEarning(raw: ExactSalaryCorrectionInput & ExactDebtAudit) {
    exactFinanceJson(raw);
    const { actorUserId = null, actorLabel = null, transactionId = null, ...domain } = raw;
    const input = exactSalaryCorrectionInputSchema.parse(domain);
    const audit = { actorUserId, actorLabel, transactionId };
    this.requireConnection();
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "PAYROLL_EARNINGS", id: command(input.requestId, "correction") }, intent: { kind: "correct-payroll-earning", input }, ...audit }, this.repository, () => {
      const earning = this.earnings.getEarning(input.earningId);
      if (!earning || earning.employeeId !== input.employeeId || earning.currency !== input.currency || !earning.debtEntryId || !earning.debtAccountId || Money.parse(earning.approvedAmount).compare(Money.parse("0")) <= 0) throw new ExactDebtError("Positive original earning not found", "NOT_FOUND");
      const detail = this.finance.detail(earning.debtAccountId);
      const original = detail.entries.find(row => row.id === earning.debtEntryId);
      if (!original || original.status !== "LIVE" || original.producerType !== "PAYROLL_EARNINGS" || original.producerId !== earning.id || original.signedAmountDzd !== earning.approvedAmount || original.targetEntryId || original.correctionOfEntryId) throw new ExactDebtError("Earning source ledger mismatch");
      const previousAmount = sumMoneyHistory(detail.entries.filter(row => row.status === "LIVE" && (row.id === original.id || row.correctionOfEntryId === original.id)).map(row => Money.parse(row.signedAmountDzd)));
      const paidAmount = Money.parse(previousAmount).subtract(Money.parse(this.finance.remaining(original.id)));
      if (Money.parse(input.newAmount).compare(paidAmount) < 0) throw new ExactDebtError("Correction below paid amount requires an owner-selected treatment", "CONFLICT");
      const entry = this.finance.forProducer({ type: "PAYROLL_EARNINGS", id: earning.id }).correctEntry({ requestId: command(input.requestId, "ledger-correction"), entryId: original.id, amountDzd: input.newAmount, currency: input.currency, reason: input.reason, ...audit });
      const correction = { id: this.dependencies.id(), employeeId: input.employeeId, earningId: earning.id, currency: input.currency, previousAmount, newAmount: input.newAmount, reason: input.reason, correctionEntryId: entry.id, ...audit, createdAt: this.dependencies.now() };
      this.repository.saveCorrection(correction);
      return correction;
    });
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
