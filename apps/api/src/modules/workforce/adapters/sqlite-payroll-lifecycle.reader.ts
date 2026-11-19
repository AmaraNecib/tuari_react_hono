import { Money, sumMoneyHistory } from "@tuari/contracts";
import type { ExactDebtAccount, ExactDebtEntry, ExactFinanceRepository } from "../../company/exact-finance.repository";
import type { ExactFinanceService } from "../../company/exact-finance.service";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import { SqliteEmployeeEarningRepository } from "./sqlite-employee-earning.repository";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { PayrollCashRepository, PayrollCashRecord, PayrollSettlementRecord } from "../payroll-cash.repository";
import type { PayrollOffsetRepository, PayrollOffsetRecord } from "../payroll-offset.repository";
import type { PayrollSourceRepository } from "../payroll-source.repository";
import type { PayrollLifecycle, PayrollOpeningReview, PayrollOpeningReviewProvider, PayrollOpeningSource } from "../payroll-lifecycle";

const LIMIT = 10000;
const ZERO = Money.parse("0.00");
type LedgerSource = { readonly kind: "WAGE" | "ADVANCE"; readonly id: string; readonly employeeId: string; readonly currency: string; readonly amount: string; readonly account: ExactDebtAccount; readonly original: ExactDebtEntry };

function report(values: readonly string[]): string {
  return sumMoneyHistory(values.map(value => Money.parse(value, "DZD")));
}
function boundedCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > LIMIT) throw new RangeError(`${label} row count is not a bounded nonnegative integer`);
  return value;
}
function identityMatches(left: { connection: object; lock: object }, right: { connection: object; lock: object }): boolean {
  return left.connection === right.connection && left.lock === right.lock;
}

/** Internal synchronous read seam. Every adapter and optional provider must share one connection and FIFO. */
export class SqlitePayrollLifecycleReader {
  constructor(
    private readonly db: BetterSqliteDatabase,
    private readonly lock: FifoLock,
    private readonly finance: ExactFinanceService,
    private readonly financeRepository: ExactFinanceRepository,
    private readonly sources: PayrollSourceRepository,
    private readonly cash: PayrollCashRepository,
    private readonly offsets: PayrollOffsetRepository,
    private readonly opening?: PayrollOpeningReviewProvider,
  ) {
    const identity = finance.transactionIdentity;
    for (const participant of [financeRepository, sources, cash, offsets, ...(opening ? [opening] : [])]) {
      if (!identityMatches(identity, participant.transactionIdentity)) throw new TypeError("Payroll lifecycle participants require the same connection and shared FIFO");
    }
    if (identity.connection !== db || identity.lock !== lock) throw new TypeError("Payroll lifecycle requires finance's physical database connection and FIFO");
  }

  getEmployeePayroll(employeeId: string): PayrollLifecycle {
    if (!employeeId || employeeId.trim() !== employeeId) throw new TypeError("Invalid employee identity");
    const earnings = new SqliteEmployeeEarningRepository(this.db, this.lock);
    return this.cash.withTransaction(() => this.readInTransaction(employeeId, earnings));
  }

  private readInTransaction(employeeId: string, earningsRepository: SqliteEmployeeEarningRepository): PayrollLifecycle {
    if (!this.db.prepare("SELECT 1 FROM employee WHERE id=?").get(employeeId)) throw new Error("Employee not found");
    const counts = this.countSelectedRows(employeeId);
    const openingCost = this.opening ? boundedCount(this.opening.countRows(employeeId), "Opening provider") : 0;
    if (counts + openingCost > LIMIT) throw new RangeError("Payroll lifecycle materialization limit exceeded");

    const earnings = earningsRepository.list(employeeId);
    const cash = this.cash.listCash(employeeId);
    const repayments = this.cash.listSettlements(employeeId);
    const offsets = this.offsets.listOffsets(employeeId);
    let openingReview: PayrollOpeningReview | null = null;
    if (this.opening) {
      openingReview = this.opening.getReview(employeeId);
      if (openingReview !== null && (!Array.isArray(openingReview.sources) || openingReview.state !== "REVIEWED")) throw new TypeError("Opening provider returned invalid review metadata");
      const returnedCost = openingReview === null ? 0 : 1 + openingReview.sources.length;
      if (returnedCost !== openingCost) throw new RangeError("Opening provider row count does not match returned review and sources");
    }

    const earningById = new Map(earnings.map(earning => [earning.id, earning]));
    if (earningById.size !== earnings.length) throw new TypeError("Duplicate employee earning identity");
    const openingById = new Map((openingReview?.sources ?? []).map(source => [`${source.kind}:${source.sourceId}`, source]));
    if (openingById.size !== (openingReview?.sources.length ?? 0)) throw new TypeError("Duplicate opening source identity");

    const wageSources = new Map<string, LedgerSource>();
    const advanceSources = new Map<string, LedgerSource>();
    const details = new Map<string, ReturnType<ExactFinanceService["detail"]>>();
    const detailFor = (accountId: string) => {
      let detail = details.get(accountId);
      if (!detail) { detail = this.finance.detail(accountId); details.set(accountId, detail); }
      return detail;
    };
    for (const earning of earnings) {
      const source = this.sources.getEarning(earning.id);
      if (!source || source.employeeId !== employeeId || source.currency !== "DZD" || Money.parse(source.amount).compare(Money.parse(earning.totalAmount)) !== 0) throw new TypeError("Approved earning source mismatch");
      if (!source.original) {
        if (source.account) throw new TypeError("Unposted earning has a debt account without an original");
        if (Money.parse(source.amount).compare(ZERO) < 0) throw new TypeError("Invalid approved earning amount");
        continue;
      }
      if (!source.account) throw new TypeError("Posted earning is missing its debt account");
      wageSources.set(earning.id, { kind: "WAGE", id: earning.id, employeeId, currency: source.currency, amount: source.amount, account: source.account, original: source.original });
      detailFor(source.account.id);
    }
    for (const record of cash) if (record.advance) {
      const source = this.sources.getAdvance(record.advance.id);
      if (!source || source.employeeId !== employeeId || source.currency !== record.currency || source.account.id !== record.advance.debtAccountId || source.original.id !== record.advance.debtEntryId || Money.parse(source.amount).compare(Money.parse(record.advance.amount)) !== 0) throw new TypeError("Payroll advance source mismatch");
      advanceSources.set(source.id, { kind: "ADVANCE", id: source.id, employeeId, currency: source.currency, amount: source.amount, account: source.account, original: source.original });
      detailFor(source.account.id);
    }
    for (const source of openingReview?.sources ?? []) {
      this.validateOpeningSource(source, employeeId);
      const ledger: LedgerSource = { kind: source.kind, id: source.sourceId, employeeId, currency: source.currency, amount: source.amount, account: this.financeRepository.getAccount(source.debtAccountId)!, original: this.financeRepository.getEntry(source.debtEntryId)! };
      (source.kind === "WAGE" ? wageSources : advanceSources).set(`OPENING:${source.sourceId}`, ledger);
      detailFor(source.debtAccountId);
    }

    this.validateCashSources(cash, earningById, openingById, wageSources);
    this.validateOffsetSources(offsets, earningById, wageSources, advanceSources);
    this.validateRepaymentSources(repayments, advanceSources);

    const expectedMovements = new Map<string, Map<string, { amount: string; type: "PAYMENT" | "SETTLEMENT" }>>();
    const addMovement = (originalId: string, entryId: string, amount: string, type: "PAYMENT" | "SETTLEMENT") => {
      let movements = expectedMovements.get(originalId);
      if (!movements) { movements = new Map(); expectedMovements.set(originalId, movements); }
      if (movements.has(entryId)) throw new TypeError("Duplicate payroll ledger attribution");
      movements.set(entryId, { amount, type });
    };
    for (const row of cash) for (const allocation of row.wageAllocations) addMovement(allocation.debtEntryId, allocation.paymentEntryId, allocation.amount, "PAYMENT");
    for (const row of offsets) {
      addMovement(row.wage.debtEntryId, row.wage.settlementEntryId, row.amount, "SETTLEMENT");
      addMovement(row.advance.debtEntryId, row.advance.settlementEntryId, row.amount, "SETTLEMENT");
    }
    for (const row of repayments) addMovement(row.debtEntryId, row.paymentEntryId, row.amount, "PAYMENT");

    const postedEarnings: PayrollLifecycle["earnings"][number][] = [];
    for (const earning of earnings) {
      const source = wageSources.get(earning.id);
      if (!source) {
        postedEarnings.push({ earning, registration: "PENDING_REGISTRATION", remaining: earning.totalAmount });
        continue;
      }
      const remaining = this.validateLedgerMovements(source, detailFor(source.account.id), expectedMovements.get(source.original.id) ?? new Map());
      postedEarnings.push({ earning, registration: "POSTED", remaining });
    }
    const advances = cash.flatMap(row => {
      if (!row.advance) return [];
      const source = advanceSources.get(row.advance.id)!;
      return [{ cashId: row.id, advance: row.advance, remaining: this.validateLedgerMovements(source, detailFor(source.account.id), expectedMovements.get(source.original.id) ?? new Map()) }];
    });
    const openingBalances = (openingReview?.sources ?? []).map(source => {
      const ledger = (source.kind === "WAGE" ? wageSources : advanceSources).get(`OPENING:${source.sourceId}`)!;
      return { kind: source.kind, remaining: this.validateLedgerMovements(ledger, detailFor(ledger.account.id), expectedMovements.get(ledger.original.id) ?? new Map()) };
    });

    const wagesCash = cash.flatMap(row => row.wageAllocations.map(allocation => allocation.amount));
    const wagesOffset = offsets.map(row => row.amount);
    const advancesGiven = cash.flatMap(row => row.advance ? [row.advance.amount] : []);
    const advancesRecovered = repayments.map(row => row.amount);
    const advancesOffset = offsets.map(row => row.amount);
    const wageOwed = postedEarnings.map(row => row.remaining);
    const advanceOwed = advances.map(row => row.remaining);
    const openingWages = openingReview ? report(openingBalances.filter(row => row.kind === "WAGE").map(row => row.remaining)) : null;
    const openingAdvances = openingReview ? report(openingBalances.filter(row => row.kind === "ADVANCE").map(row => row.remaining)) : null;

    return {
      employeeId, currency: "DZD", earnings: postedEarnings, cash, repayments, offsets, advances,
      opening: { review: openingReview ? "REVIEWED" : "UNREVIEWED", reminder: !openingReview, wages: openingWages, advances: openingAdvances },
      summary: {
        approvedEarnings: report(earnings.map(row => row.totalAmount)), wageCashPaid: report(wagesCash), wagesOffset: report(wagesOffset), wagesOwed: report(wageOwed),
        advancesGiven: report(advancesGiven), advancesCashRecovered: report(advancesRecovered), advancesOffset: report(advancesOffset), advancesOwed: report(advanceOwed),
        unallocatedEarnings: report(earnings.map(row => row.unallocatedAmount)), currentAppTotalsExcludeUnknownOpening: !openingReview,
      },
    };
  }

  private countSelectedRows(employeeId: string): number {
    const count = (query: string, ...params: string[]) => Number((this.db.prepare(`SELECT count(*) AS count FROM (${query} LIMIT ${LIMIT + 1})`).get(...params) as { count: number }).count);
    const selected = [
      count("SELECT id FROM employee_earning WHERE employee_id=?", employeeId),
      count("SELECT s.id FROM employee_earning_segment s JOIN employee_earning e ON e.id=s.earning_id WHERE e.employee_id=?", employeeId),
      count("SELECT id FROM employee_salary_cash WHERE employee_id=?", employeeId),
      count("SELECT a.id FROM employee_salary_payment_allocation a JOIN employee_salary_cash c ON c.id=a.cash_id WHERE c.employee_id=?", employeeId),
      count("SELECT a.id FROM employee_salary_advance a JOIN employee_salary_cash c ON c.id=a.cash_id WHERE c.employee_id=?", employeeId),
      count("SELECT id FROM employee_salary_settlement WHERE employee_id=?", employeeId),
      count("SELECT id FROM employee_salary_advance_offset WHERE employee_id=?", employeeId),
      count("SELECT id FROM debt_account WHERE party_type='INTERNAL_WORKER' AND worker_id=? AND currency='DZD'", employeeId),
      count("SELECT e.id FROM debt_entry e JOIN debt_account a ON a.id=e.debt_account_id WHERE a.party_type='INTERNAL_WORKER' AND a.worker_id=? AND a.currency='DZD'", employeeId),
    ];
    const total = selected.reduce((sum, value) => sum + value, 0);
    if (selected.some(value => value > LIMIT) || total > LIMIT) throw new RangeError("Payroll lifecycle materialization limit exceeded");
    return total;
  }

  private validateOpeningSource(source: PayrollOpeningSource, employeeId: string): void {
    if ((source.kind !== "WAGE" && source.kind !== "ADVANCE") || !source.sourceId || source.employeeId !== employeeId || source.currency !== "DZD") throw new TypeError("Opening source worker or currency mismatch");
    const account = this.financeRepository.getAccount(source.debtAccountId);
    const original = this.financeRepository.getEntry(source.debtEntryId);
    const expectedDirection = source.kind === "WAGE" ? "PAYABLE" : "RECEIVABLE";
    if (!account || !original || account.partyType !== "INTERNAL_WORKER" || account.workerId !== employeeId || account.currency !== "DZD" || account.direction !== expectedDirection
      || original.debtAccountId !== account.id || original.currency !== "DZD" || original.status !== "LIVE" || original.targetEntryId || original.correctionOfEntryId
      || original.producerType !== "PAYROLL_OPENING" || original.producerId !== source.sourceId || Money.parse(original.signedAmountDzd).compare(Money.parse(source.amount)) !== 0
      || Money.parse(source.amount).compare(ZERO) <= 0 || (source.kind === "ADVANCE" && original.entryType !== "ADVANCE")) throw new TypeError("Opening source ledger linkage mismatch");
  }

  private validateCashSources(cash: readonly PayrollCashRecord[], earnings: Map<string, unknown>, openings: Map<string, PayrollOpeningSource>, wages: Map<string, LedgerSource>): void {
    for (const row of cash) for (const allocation of row.wageAllocations) {
      if (allocation.source.kind === "EARNING") {
        if (!earnings.has(allocation.source.id)) throw new TypeError("Cash earning source does not exist for this employee");
        const source = wages.get(allocation.source.id);
        if (!source || source.account.id !== allocation.debtAccountId || source.original.id !== allocation.debtEntryId) throw new TypeError("Cash earning ledger attribution mismatch");
      } else {
        const opening = openings.get(`WAGE:${allocation.source.id}`);
        if (!opening || opening.debtAccountId !== allocation.debtAccountId || opening.debtEntryId !== allocation.debtEntryId) throw new TypeError("Cash opening source is not reviewed and linked");
      }
    }
  }

  private validateOffsetSources(offsets: readonly PayrollOffsetRecord[], earnings: Map<string, unknown>, wages: Map<string, LedgerSource>, advances: Map<string, LedgerSource>): void {
    for (const row of offsets) {
      if (row.wageSource.kind !== "EARNING" || !earnings.has(row.wageSource.id)) throw new TypeError("Offset earning source does not exist for this employee");
      const wage = wages.get(row.wageSource.id);
      const advance = advances.get(row.advanceSource.id);
      if (!wage || !advance || wage.original.id !== row.wage.debtEntryId || wage.account.id !== row.wage.debtAccountId || advance.original.id !== row.advance.debtEntryId || advance.account.id !== row.advance.debtAccountId) throw new TypeError("Payroll offset source linkage mismatch");
    }
  }

  private validateRepaymentSources(rows: readonly PayrollSettlementRecord[], advances: Map<string, LedgerSource>): void {
    for (const row of rows) {
      const key = row.source.kind === "ADVANCE" ? row.source.id : `OPENING:${row.source.id}`;
      const source = advances.get(key);
      if (!source || source.original.id !== row.debtEntryId || source.account.id !== row.debtAccountId) throw new TypeError("Payroll repayment source linkage mismatch");
    }
  }

  private validateLedgerMovements(source: LedgerSource, detail: ReturnType<ExactFinanceService["detail"]>, expected: Map<string, { amount: string; type: "PAYMENT" | "SETTLEMENT" }>): string {
    const original = detail.entries.find(row => row.id === source.original.id);
    if (!original || original.status !== "LIVE" || original.targetEntryId || original.correctionOfEntryId || Money.parse(original.signedAmountDzd).compare(Money.parse(source.amount)) !== 0) throw new TypeError("Payroll original no longer matches its source amount");
    if (detail.entries.some(row => row.status === "LIVE" && row.correctionOfEntryId === source.original.id)) throw new TypeError("Payroll original has an unattributed correction");
    const children = detail.entries.filter(row => row.status === "LIVE" && row.targetEntryId === source.original.id);
    if (children.some(row => row.entryType !== "PAYMENT" && row.entryType !== "SETTLEMENT")) throw new TypeError("Payroll original has an unattributed ledger movement");
    const actual = children;
    const seen = new Set<string>();
    for (const movement of actual) {
      const expectedMovement = expected.get(movement.id);
      if (!expectedMovement || expectedMovement.type !== movement.entryType || Money.parse(movement.signedAmountDzd).compare(Money.parse(expectedMovement.amount).negate()) !== 0) throw new TypeError("Unattributed or mismatched payroll ledger movement");
      if (seen.has(movement.id)) throw new TypeError("Duplicate payroll ledger movement");
      seen.add(movement.id);
    }
    if (seen.size !== expected.size) throw new TypeError("Payroll provenance references a missing ledger movement");
    const remaining = original.remainingDzd;
    if (remaining === null) throw new TypeError("Payroll original has no live remaining amount");
    const computed = Money.parse(sumMoneyHistory([Money.parse(source.amount), ...actual.map(row => Money.parse(row.signedAmountDzd))]));
    if (Money.parse(remaining).compare(computed) !== 0 || Money.parse(remaining).compare(ZERO) < 0) throw new TypeError("Payroll ledger remaining disagrees with source movements");
    return remaining;
  }
}
