import { createHash } from "node:crypto";
import { Money, sumMoney, exactSalaryApprovalInputSchema, exactSalaryMonthlyApprovalInputSchema, type ExactSalaryApprovalInput, type ExactSalaryMonthlyApprovalInput } from "@tuari/contracts";
import { ExactFinanceService, ExactDebtError, type ExactDebtAudit } from "./exact-finance.service";
import { exactFinanceJson } from "./exact-finance-json";
import type { ExactSalaryEarning, ExactWorkforceRepository } from "./workforce-exact.repository";

const request = (root: string, kind: string) => `payroll:${createHash("sha256").update(JSON.stringify([root, kind])).digest("hex")}`;
const auditOf = (value: ExactDebtAudit): Required<ExactDebtAudit> => ({
  actorUserId: value.actorUserId ?? null, actorLabel: value.actorLabel ?? null, transactionId: value.transactionId ?? null,
});

/** Opt-in payroll composition. Source and ledger writes share the merged aggregate receipt. */
export class ExactWorkforceService {
  constructor(private readonly repository: ExactWorkforceRepository, private readonly finance: ExactFinanceService, private readonly dependencies: { id(): string; now(): string }) {}

  private snapshot<T>(work: () => T): T {
    const source = this.repository.transactionIdentity;
    const ledger = this.finance.transactionIdentity;
    if (source.connection !== ledger.connection || source.lock !== ledger.lock) throw new ExactDebtError("Payroll reads require the same connection and shared FIFO");
    return this.repository.withTransaction(work);
  }

  listEmployeeEarnings(employeeId: string) {
    return this.snapshot(() => {
      if (!this.repository.employeeExists(employeeId)) throw new ExactDebtError("Employee not found", "NOT_FOUND");
      const rows = this.repository.listEarnings(employeeId);
      const accounts = new Map<string, Map<string, string>>();
      return rows.map(earning => {
        if (!earning.debtEntryId) return { earning, remainingAmount: "0.00" };
        if (!earning.debtAccountId) throw new ExactDebtError("Live debt entry not found", "NOT_FOUND");
        let remaining = accounts.get(earning.debtAccountId);
        if (!remaining) {
          const detail = this.finance.detail(earning.debtAccountId);
          remaining = new Map(detail.entries.filter(entry => entry.remainingDzd !== null && entry.signedAmountDzd !== "0.00").map(entry => [entry.id, entry.remainingDzd!]));
          accounts.set(earning.debtAccountId, remaining);
        }
        const remainingAmount = remaining.get(earning.debtEntryId);
        if (remainingAmount === undefined) throw new ExactDebtError("Live debt entry not found", "NOT_FOUND");
        return { earning, remainingAmount };
      });
    });
  }

  getProjectSalaryCost(projectId: string) {
    return this.snapshot(() => {
      if (!this.repository.projectExists(projectId)) throw new ExactDebtError("Project not found", "NOT_FOUND");
      const segments = this.repository.listProjectEarnings(projectId).flatMap(earning => earning.segments.filter(segment => segment.projectId === projectId).map(segment => ({
        earningId: earning.id, employeeId: earning.employeeId, periodStart: earning.periodStart, periodEnd: earning.periodEnd, segment,
      })));
      return { projectId, currency: "DZD" as const, totalAmount: sumMoney(segments.map(row => Money.parse(row.segment.amount))), segments };
    });
  }

  approveMonthlyEarnings(raw: ExactSalaryMonthlyApprovalInput & ExactDebtAudit) {
    exactFinanceJson(raw);
    const { actorUserId, actorLabel, transactionId, ...domain } = raw;
    const input = exactSalaryMonthlyApprovalInputSchema.parse(domain);
    const audit = auditOf({ actorUserId, actorLabel, transactionId });
    const owner = { type: "PAYROLL_EARNINGS" as const, id: request(input.requestId, "monthly-approval") };
    return this.finance.runAggregate({ requestId: input.requestId, producer: owner, intent: { kind: "approve-monthly-earnings", input }, ...audit }, this.repository, () => ({
      currency: input.currency,
      totalAmount: input.totalAmount,
      months: input.months.map(row => ({
        id: row.id,
        month: row.month,
        earning: this.approveEarnings({
          requestId: request(input.requestId, `monthly-earning:${row.id}`), employeeId: input.employeeId, currency: input.currency,
          periodStart: row.periodStart, periodEnd: row.periodEnd, approvedAmount: row.amount,
          unallocatedAmount: row.unallocatedAmount, segments: row.segments, ...audit,
        }),
      })),
    }));
  }

  approveEarnings(raw: ExactSalaryApprovalInput & ExactDebtAudit): ExactSalaryEarning {
    const { actorUserId, actorLabel, transactionId, ...domain } = raw;
    const input = exactSalaryApprovalInputSchema.parse(domain);
    const audit = auditOf({ actorUserId, actorLabel, transactionId });
    const owner = { type: "PAYROLL_EARNINGS" as const, id: request(input.requestId, "approval") };
    return this.finance.runAggregate({ requestId: input.requestId, producer: owner, intent: { kind: "approve-earnings", input }, ...audit }, this.repository, () => {
      if (!this.repository.employeeExists(input.employeeId)) throw new ExactDebtError("Employee not found", "NOT_FOUND");
      this.finance.requireParty("INTERNAL_WORKER", input.employeeId);
      for (const segment of input.segments) {
        if (!this.repository.projectExists(segment.projectId)) throw new ExactDebtError("Project not found", "NOT_FOUND");
      }
      const id = this.dependencies.id();
      const scoped = this.finance.forProducer({ type: "PAYROLL_EARNINGS", id });
      const now = this.dependencies.now();
      let debtAccountId: string | null = null;
      let debtEntryId: string | null = null;
      if (Money.parse(input.approvedAmount).compare(Money.parse("0")) > 0) {
        const account = scoped.createAccount({ requestId: request(input.requestId, "wage-account"), partyType: "INTERNAL_WORKER", workerId: input.employeeId, direction: "PAYABLE", currency: input.currency, ...audit });
        debtAccountId = account.id;
        const entry = scoped.postEntry({ requestId: request(input.requestId, "wage-original"), debtAccountId, entryType: "ADJUSTMENT", signedAmountDzd: input.approvedAmount, currency: input.currency, ...audit });
        debtEntryId = entry.id;
      }
      const { requestId: _requestId, ...approved } = input;
      const earning: ExactSalaryEarning = { ...approved, id, debtAccountId, debtEntryId, ...audit, createdAt: now };
      this.repository.saveEarning(earning);
      return earning;
    });
  }
}
