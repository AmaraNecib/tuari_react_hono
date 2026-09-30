/**
 * Finance service.
 *
 * Owns debt account / debt entry CRUD, the bidirectional counterparty
 * ledger (issue #22), debt settlement, payment recording, and
 * external counterparty CRUD. It is the real implementation — not a
 * facade over `CompanyService` — and depends on a `CompanyRepository`
 * plus a `WorkspaceMutationContext` for transactions and audit
 * authorization.
 *
 * Extracted from `CompanyService` as part of Plan 005 Phase 3
* (issue #177) so the former 2k-line service stops owning every
 * domain.
 */

import {
  type DebtAccountCreateInput,
  type DebtConsolidationInput,
  type DebtEntry,
  type DebtEntryCreateInput,
  type DebtEntryRecordPaymentInput,
  type DebtEntryVoidInput,
  type DebtPartyDetailInput,
  type DebtReport,
  type DebtSettlementInput,
  type ExternalCounterpartyCreateInput,
  getDebtAccountNetContribution,
  getLockedDirectionForCategory,
  getNetDebtBalance,
} from "@tuari/contracts";

import { CompanyError } from "./company.errors";
import {
  assertDebtEntryDateNotBackdated,
  buildDebtPartyKey,
  getDebtAccountBalanceLabel,
  getDebtAccountStatus,
  getDebtBalanceLabel,
  normalizeSignedMoneyAmount,
  normalizeText,
  successResult,
} from "./company.helpers";
import { WorkspaceMutationContext } from "./workspace-mutation-context";
import type { FinanceRepository } from "./finance.repository";
import type { WorkforceRepository } from "./workforce.repository";
import {
  type DebtAccountListFilters,
  type DebtEntryListFilters,
  type DebtEntryRecord,
  type ExternalCounterpartyListFilters,
  type MutationAuditContext,
} from "./company.types";
import { createAlgeriaTimestamp, normalizeAlgeriaTimestamp } from "./company-time";
import { MS_PER_DAY, resolveReportWindow, roundMoney } from "./report.helpers";
import {
  requireDebtAccount,
  requireEmployee,
  requireEmployeeWorker,
  requireExternalCounterparty,
} from "./company.entity-resolvers";

export class FinanceService {
  constructor(
    private readonly repository: FinanceRepository,
    private readonly workforceRepo: WorkforceRepository,
    private readonly mutation: WorkspaceMutationContext,
  ) {}

  // ---------------------------------------------------------------------------
  // Cross-domain helpers (workforce + finance glue)
  //
  // These are exposed on the finance service so the finance RPC
  // handler can call them without a separate reference to
  // `CompanyService`. They do a small amount of work that spans
  // domains (look up the employee, then drive the debt account
  // lifecycle). The same logic also lives on `CompanyService` for
  // callers that prefer the cross-domain coordinator.
  // ---------------------------------------------------------------------------

  getEmployeeDebtAccount(employeeId: string) {
    requireEmployee(this.workforceRepo, employeeId);
    const accounts = this.listDebtAccounts({ workerId: employeeId }).items;
    return accounts[0] ?? null;
  }

  createEmployeeDebtEntry(
    input: {
      employeeId: string;
      entryType: "OPENING" | "PAYMENT" | "ADJUSTMENT" | "ADVANCE";
      amountDzd: number;
      direction?: DebtAccountCreateInput["direction"];
      entryDate?: string;
      note?: string | null;
      reasonCategory?: DebtEntry["reasonCategory"];
    },
    auditContext?: MutationAuditContext,
  ) {
    const employee = requireEmployee(this.workforceRepo, input.employeeId);
    const direction = this.resolveEmployeeEntryDirection(
      input.employeeId,
      input.entryType,
      input.direction,
    );

    const account = this.createDebtAccount(
      {
        partyType: "INTERNAL_WORKER",
        workerId: input.employeeId,
        direction,
        note: `حساب الدين للعامل: ${employee.firstName} ${employee.lastName}`,
      },
      auditContext,
    ).item;

    // D7: sign by entry type. A PAYMENT reduces the outstanding balance;
    // every other type increases it in the ledger's own direction.
    const signedAmountDzd = input.entryType === "PAYMENT" ? -input.amountDzd : input.amountDzd;

    const result = this.createDebtEntry(
      {
        debtAccountId: account.id,
        entryType: input.entryType,
        signedAmountDzd,
        entryDate: input.entryDate,
        note: input.note || `${input.entryType}: ${employee.firstName} ${employee.lastName}`,
        reasonCategory: input.reasonCategory,
      },
      auditContext,
    );

    return result.item;
  }

  /**
   * Resolve which worker ledger an employee-debt entry targets. An ADVANCE is a
   * worker receivable (D1a); a PAYMENT follows the ledger that still has a
   * balance so a repayment offsets the advance instead of opening a second
   * account; everything else lands on the PAYABLE ledger.
   */
  private resolveEmployeeEntryDirection(
    workerId: string,
    entryType: "OPENING" | "PAYMENT" | "ADJUSTMENT" | "ADVANCE",
    explicit?: DebtAccountCreateInput["direction"],
  ): "PAYABLE" | "RECEIVABLE" {
    if (explicit) {
      return explicit;
    }
    if (entryType === "ADVANCE") {
      return "RECEIVABLE";
    }
    if (entryType === "PAYMENT") {
      const receivable = this.repository.getDebtAccountByWorkerIdAndDirection(workerId, "RECEIVABLE");
      if (receivable && receivable.currentBalance !== 0) {
        return "RECEIVABLE";
      }
    }
    return "PAYABLE";
  }

  // ---------------------------------------------------------------------------
  // External counterparties
  // ---------------------------------------------------------------------------

  listExternalCounterparties(filters?: ExternalCounterpartyListFilters) {
    return { items: this.repository.listExternalCounterparties(filters) };
  }

  getExternalCounterparty(id: string) {
    const counterparty = this.repository.getExternalCounterpartyById(id);
    if (!counterparty) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على الطرف الخارجي المطلوب.");
    }

    return successResult("تم تحميل الطرف الخارجي بنجاح.", counterparty);
  }

  createExternalCounterparty(
    input: ExternalCounterpartyCreateInput,
    auditContext?: MutationAuditContext,
  ) {
    this.mutation.createMutationAuditContext(auditContext);
    return this.mutation.withTransaction(() => {
      const counterparty = this.repository.createExternalCounterparty({
        fullName: input.fullName.trim(),
        phoneNumber: input.phoneNumber.trim(),
        note: normalizeText(input.note),
      });

      return successResult("تم إنشاء الطرف الخارجي بنجاح.", counterparty);
    });
  }

  // ---------------------------------------------------------------------------
  // Debt accounts
  // ---------------------------------------------------------------------------

  listDebtAccounts(filters?: DebtAccountListFilters) {
    return { items: this.repository.listDebtAccounts(filters) };
  }

  getDebtAccount(id: string) {
    const account = this.repository.getDebtAccountById(id);
    if (!account) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على حساب الدين المطلوب.");
    }

    return successResult("تم تحميل حساب الدين بنجاح.", account);
  }

  listDebtEntries(filters: DebtEntryListFilters) {
    requireDebtAccount(this.repository, filters.debtAccountId);
    return { items: this.repository.listDebtEntries(filters) };
  }

  createDebtAccount(input: DebtAccountCreateInput, auditContext?: MutationAuditContext) {
    const audit = this.mutation.createMutationAuditContext(auditContext);

    const workerId = input.workerId ?? null;
    const externalCounterpartyId = input.externalCounterpartyId ?? null;

    if (
      (workerId === null && externalCounterpartyId === null) ||
      (workerId !== null && externalCounterpartyId !== null)
    ) {
      throw new CompanyError("VALIDATION", "يجب ربط الحساب بطرف واحد فقط.", [
        {
          field: workerId !== null ? "externalCounterpartyId" : "workerId",
          message: "يجب ربط الحساب بطرف واحد فقط.",
        },
      ]);
    }

    if (input.partyType === "INTERNAL_WORKER") {
      requireEmployeeWorker(this.workforceRepo, workerId!, "workerId");
    }

    if (input.partyType === "EXTERNAL_COUNTERPARTY") {
      requireExternalCounterparty(
        this.repository,
        externalCounterpartyId!,
        "externalCounterpartyId",
      );
    }

    const openingBalance = input.openingBalanceDzd ?? 0;
    if (!Number.isFinite(openingBalance)) {
      throw new CompanyError("VALIDATION", "يجب إدخال رصيد افتتاحي صالح.", [
        { field: "openingBalanceDzd", message: "يجب إدخال رصيد افتتاحي صالح." },
      ]);
    }
    const entryDate = normalizeAlgeriaTimestamp(input.openingEntryDate);

    // D2: the reason category locks the direction. A supplied direction that
    // contradicts it is rejected, so no writer can store the intent backwards.
    const lockedDirection = input.reasonCategory
      ? getLockedDirectionForCategory(input.reasonCategory)
      : null;
    if (lockedDirection && input.direction && input.direction !== lockedDirection) {
      throw new CompanyError(
        "VALIDATION",
        `اتجاه الحساب محدد حسب سبب الدين (${lockedDirection}).`,
        [{ field: "direction", message: "اتجاه الحساب لا يطابق سبب الدين المحدد." }],
      );
    }
    const direction = lockedDirection ?? input.direction ?? "PAYABLE";

    const existingAccount =
      input.partyType === "INTERNAL_WORKER"
        ? this.repository.getDebtAccountByWorkerIdAndDirection(workerId!, direction)
        : this.repository.getDebtAccountByExternalCounterpartyIdAndDirection(
            externalCounterpartyId!,
            direction,
          );

    if (existingAccount) {
      if (openingBalance !== 0) {
        this.createDebtEntry(
          {
            debtAccountId: existingAccount.id,
            entryType: "ADJUSTMENT",
            signedAmountDzd: openingBalance,
            entryDate,
            note: normalizeText(input.openingEntryNote) ?? normalizeText(input.note),
            reasonCategory: input.reasonCategory ?? "INVOICE_DRIVEN",
            reasonDetail: input.reasonDetail ?? null,
          },
          audit,
        );
      }

      return successResult(
        "تم تحديث حساب الدين الحالي بنجاح.",
        requireDebtAccount(this.repository, existingAccount.id),
      );
    }

    const status = getDebtAccountStatus(openingBalance);
    const account = this.mutation.withTransaction(() => {
      const createdAccount = this.repository.createDebtAccount(
        {
          partyType: input.partyType,
          workerId,
          externalCounterpartyId,
          direction,
          status,
          currentBalance: openingBalance,
          note: normalizeText(input.note),
          settledAt: status === "SETTLED" ? entryDate : null,
        },
        audit,
      );

      if (openingBalance !== 0) {
        this.repository.createDebtEntry(
          {
            debtAccountId: createdAccount.id,
            entryType: "OPENING",
            signedAmountDzd: openingBalance,
            entryDate,
            note: normalizeText(input.openingEntryNote) ?? normalizeText(input.note),
            balanceAfterDzd: openingBalance,
            reasonCategory: input.reasonCategory ?? "INVOICE_DRIVEN",
            reasonDetail: input.reasonDetail ?? null,
          },
          audit,
        );
      }

      return createdAccount;
    });

    return successResult(
      "تم إنشاء حساب الدين بنجاح.",
      requireDebtAccount(this.repository, account.id),
    );
  }

  createDebtEntry(input: DebtEntryCreateInput, auditContext?: MutationAuditContext) {
    const audit = this.mutation.createMutationAuditContext(auditContext);
    const account = requireDebtAccount(this.repository, input.debtAccountId);
    const latestEntry = this.repository.getLatestDebtEntry(account.id);

    if (input.entryType === "OPENING" && latestEntry !== null) {
      throw new CompanyError(
        "BUSINESS_RULE",
        "يمكن تسجيل رصيد افتتاحي فقط كأول حركة على الحساب.",
        [
          {
            field: "entryType",
            message: "يمكن تسجيل رصيد افتتاحي فقط كأول حركة على الحساب.",
          },
        ],
      );
    }

    const reasonCategory = input.reasonCategory ?? "INVOICE_DRIVEN";
    const reasonDetail = input.reasonDetail ?? null;

    const signedAmountDzd = normalizeSignedMoneyAmount(input.signedAmountDzd);
    const entryDate = normalizeAlgeriaTimestamp(input.entryDate);
    assertDebtEntryDateNotBackdated(entryDate, latestEntry?.entryDate, "entryDate");
    const nextBalance = account.currentBalance + signedAmountDzd;
    const nextStatus = getDebtAccountStatus(nextBalance);

    const entry = this.mutation.withTransaction(() => {
      const createdEntry = this.repository.createDebtEntry(
        {
          debtAccountId: account.id,
          entryType: input.entryType,
          signedAmountDzd,
          entryDate,
          note: normalizeText(input.note),
          balanceAfterDzd: nextBalance,
          reasonCategory,
          reasonDetail,
        },
        audit,
      );

      this.repository.updateDebtAccount(
        {
          id: account.id,
          currentBalance: nextBalance,
          status: nextStatus,
          settledAt: nextStatus === "SETTLED" ? entryDate : null,
        },
        audit,
      );

      return createdEntry;
    });

    return successResult("تم تسجيل حركة الدين بنجاح.", entry);
  }

  recordDebtPayment(
    input: Omit<DebtEntryRecordPaymentInput, "paymentMethod"> & {
      paymentMethod?: DebtEntryRecordPaymentInput["paymentMethod"]
    },
    auditContext?: MutationAuditContext,
  ) {
    const audit = this.mutation.createMutationAuditContext(auditContext);

    if (!Number.isFinite(input.amountDzd) || input.amountDzd <= 0) {
      throw new CompanyError("VALIDATION", "يجب إدخال مبلغ دفع صحيح وموجب.", [
        { field: "amountDzd", message: "مبلغ الدفعة يجب أن يكون رقماً موجباً." },
      ]);
    }

    const entry = this.repository.getDebtEntryById(input.debtEntryId);
    if (!entry) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على حركة الدين المطلوبة.");
    }
    if (entry.status !== "LIVE") {
      throw new CompanyError("BUSINESS_RULE", "لا يمكن تسديد حركة دين ملغية.");
    }
    const account = requireDebtAccount(this.repository, entry.debtAccountId);
    if (input.amountDzd > account.currentBalance) {
      throw new CompanyError("VALIDATION", "مبلغ التسديد يتجاوز الرصيد الحالي للحساب.", [
        { field: "amountDzd", message: "مبلغ التسديد أكبر من الرصيد المتاح." },
      ]);
    }

    const signedAmountDzd = -Math.abs(input.amountDzd);
    const entryDate = normalizeAlgeriaTimestamp(undefined);
    const latestEntry = this.repository.getLatestDebtEntry(account.id);
    assertDebtEntryDateNotBackdated(entryDate, latestEntry?.entryDate, "entryDate");
    const nextBalance = account.currentBalance + signedAmountDzd;
    const nextStatus = getDebtAccountStatus(nextBalance);

    const payment = this.mutation.withTransaction(() => {
      const createdEntry = this.repository.createDebtEntry(
        {
          debtAccountId: account.id,
          entryType: "PAYMENT",
          signedAmountDzd,
          entryDate,
          note: normalizeText(input.note),
          balanceAfterDzd: nextBalance,
          reasonCategory: "INVOICE_DRIVEN",
          paymentMethod: input.paymentMethod ?? "CASH",
        },
        audit,
      );

      this.repository.updateDebtAccount(
        {
          id: account.id,
          currentBalance: nextBalance,
          status: nextStatus,
          settledAt: nextStatus === "SETTLED" ? entryDate : null,
        },
        audit,
      );

      return createdEntry;
    });

    return successResult("تم تسجيل الدفعة بنجاح.", payment);
  }

  voidDebtEntry(input: DebtEntryVoidInput, auditContext?: MutationAuditContext) {
    const audit = this.mutation.createMutationAuditContext(auditContext);
    const entry = this.repository.getDebtEntryById(input.entryId);
    if (!entry) {
      throw new CompanyError("NOT_FOUND", "تعذر العثور على حركة الدين المطلوبة.");
    }
    if (entry.status !== "LIVE") {
      throw new CompanyError("BUSINESS_RULE", "حركة الدين ملغية بالفعل.");
    }

    const account = requireDebtAccount(this.repository, entry.debtAccountId);
    const voidedAt = normalizeAlgeriaTimestamp(undefined);

    this.mutation.withTransaction(() => {
      this.repository.voidDebtEntry(
        {
          id: entry.id,
          voidedAt,
          voidedBy: audit.actorLabel ?? audit.actorUserId,
          voidReason: input.voidReason,
        },
        audit,
      );

      if (entry.entryType === "OPENING") {
        const entries = this.repository.listDebtEntries({ debtAccountId: account.id });
        const livePayments = entries.filter(
          (e) => e.entryType === "PAYMENT" && e.status === "LIVE",
        );
        for (const payment of livePayments) {
          this.repository.voidDebtEntry(
            {
              id: payment.id,
              voidedAt,
              voidedBy: audit.actorLabel ?? audit.actorUserId,
              voidReason: `ملغاة تلقائياً مع فتح الحركة #${entry.id.slice(0, 8)}`,
            },
            audit,
          );
        }
      }

      const liveEntries = this.repository
        .listDebtEntries({ debtAccountId: account.id })
        .filter((e) => e.status === "LIVE");
      const recomputedBalance = liveEntries.reduce((sum, e) => sum + e.signedAmountDzd, 0);
      const recomputedStatus = getDebtAccountStatus(recomputedBalance);

      this.repository.updateDebtAccount(
        {
          id: account.id,
          currentBalance: recomputedBalance,
          status: recomputedStatus,
          settledAt: recomputedStatus === "SETTLED" ? voidedAt : null,
        },
        audit,
      );

      const sortedLiveEntries = [...liveEntries].sort(
        (a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id),
      );
      let runningBalance = 0;
      for (const liveEntry of sortedLiveEntries) {
        runningBalance += liveEntry.signedAmountDzd;
        this.repository.updateDebtEntryBalanceAfter(liveEntry.id, runningBalance);
      }
    });

    return successResult(
      "تم إلغاء حركة الدين بنجاح.",
      this.repository.getDebtEntryById(entry.id)!,
    );
  }

  settleDebtAccount(input: DebtSettlementInput, auditContext?: MutationAuditContext) {
    const audit = this.mutation.createMutationAuditContext(auditContext);
    const account = requireDebtAccount(this.repository, input.id);

    if (account.currentBalance === 0) {
      throw new CompanyError(
        "BUSINESS_RULE",
        "الحساب مسوّى بالفعل ولا يحتاج إلى تسوية جديدة.",
      );
    }

    const entryDate = normalizeAlgeriaTimestamp(input.entryDate);
    const latestEntry = this.repository.getLatestDebtEntry(account.id);
    assertDebtEntryDateNotBackdated(entryDate, latestEntry?.entryDate, "entryDate");
    const settlementAmount = -account.currentBalance;
    const entry = this.mutation.withTransaction(() => {
      const createdEntry = this.repository.createDebtEntry(
        {
          debtAccountId: account.id,
          entryType: "SETTLEMENT",
          signedAmountDzd: settlementAmount,
          entryDate,
          note: normalizeText(input.note),
          balanceAfterDzd: 0,
        },
        audit,
      );

      this.repository.updateDebtAccount(
        {
          id: account.id,
          currentBalance: 0,
          status: "SETTLED",
          settledAt: entryDate,
        },
        audit,
      );

      return createdEntry;
    });

    return successResult("تمت تسوية حساب الدين بنجاح.", entry);
  }

  consolidateDebtEntries(input: DebtConsolidationInput, auditContext?: MutationAuditContext) {
    const audit = this.mutation.createMutationAuditContext(auditContext);

    const payableEntry = this.repository.getDebtEntryById(input.payableEntryId);
    if (!payableEntry) {
      throw new CompanyError("NOT_FOUND", "الحركة القابلة للدفع المطلوبة غير موجودة.");
    }
    const receivableEntry = this.repository.getDebtEntryById(input.receivableEntryId);
    if (!receivableEntry) {
      throw new CompanyError("NOT_FOUND", "الحركة المستحقة القبض المطلوبة غير موجودة.");
    }

    if (payableEntry.status !== "LIVE") {
      throw new CompanyError("BUSINESS_RULE", "الحركة القابلة للدفع ملغاة ولا يمكن تجميدها.");
    }
    if (receivableEntry.status !== "LIVE") {
      throw new CompanyError("BUSINESS_RULE", "الحركة المستحقة القبض ملغاة ولا يمكن تجميدها.");
    }

    if (payableEntry.entryType !== "OPENING") {
      throw new CompanyError(
        "BUSINESS_RULE",
        "يمكن تجميد الحركات الافتتاحية فقط. الحركة المحددة ليست افتتاحية.",
      );
    }
    if (receivableEntry.entryType !== "OPENING") {
      throw new CompanyError(
        "BUSINESS_RULE",
        "يمكن تجميد الحركات الافتتاحية فقط. الحركة المحددة ليست افتتاحية.",
      );
    }

    const payableAccount = requireDebtAccount(this.repository, payableEntry.debtAccountId);
    const receivableAccount = requireDebtAccount(this.repository, receivableEntry.debtAccountId);

    if (
      payableAccount.direction !== "PAYABLE" ||
      receivableAccount.direction !== "RECEIVABLE"
    ) {
      throw new CompanyError(
        "BUSINESS_RULE",
        "يجب أن تكون الحركتان من اتجاهين متعاكسين (واحدة دائن وأخرى مدين) للتجميد.",
      );
    }

    const payablePartyRef = payableAccount.workerId ?? payableAccount.externalCounterpartyId;
    const receivablePartyRef =
      receivableAccount.workerId ?? receivableAccount.externalCounterpartyId;
    if (payablePartyRef !== receivablePartyRef) {
      throw new CompanyError(
        "BUSINESS_RULE",
        "يجب أن تنتمي الحركتان لنفس الطرف لتجميدهما.",
      );
    }

    const payableAmount = Math.abs(payableEntry.signedAmountDzd);
    const receivableAmount = Math.abs(receivableEntry.signedAmountDzd);
    const consolidationAmount = Math.min(payableAmount, receivableAmount);
    const netAmount = payableAmount - receivableAmount;

    if (consolidationAmount <= 0) {
      throw new CompanyError("BUSINESS_RULE", "لا يمكن تجميد حركات برصيد صفري.");
    }

    const entryDate = normalizeAlgeriaTimestamp(undefined);

    this.mutation.withTransaction(() => {
      // The live-count guards run inside the transaction so the "no other live
      // entries" invariant they establish is read-consistent with the voids
      // below (single-connection better-sqlite3 is already serialized, but the
      // in-transaction read keeps the remainder-entry math provably correct).
      const payableLiveCount = this.repository
        .listDebtEntries({ debtAccountId: payableAccount.id })
        .filter((e) => e.status === "LIVE" && e.id !== payableEntry.id).length;
      if (payableLiveCount > 0) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "لا يمكن تجميد رصيد افتتاحي لديه حركات دين نشطة أخرى على الحساب الدائن.",
        );
      }

      const receivableLiveCount = this.repository
        .listDebtEntries({ debtAccountId: receivableAccount.id })
        .filter((e) => e.status === "LIVE" && e.id !== receivableEntry.id).length;
      if (receivableLiveCount > 0) {
        throw new CompanyError(
          "BUSINESS_RULE",
          "لا يمكن تجميد رصيد افتتاحي لديه حركات دين نشطة أخرى على الحساب المدين.",
        );
      }

      this.repository.voidDebtEntry(
        {
          id: payableEntry.id,
          voidedAt: entryDate,
          voidReason: `تجميد مع ${receivableEntry.id.slice(0, 8)}`,
        },
        audit,
      );

      this.repository.voidDebtEntry(
        {
          id: receivableEntry.id,
          voidedAt: entryDate,
          voidReason: `تجميد مع ${payableEntry.id.slice(0, 8)}`,
        },
        audit,
      );

      if (netAmount > 0) {
        // The payableLiveCount guard above guarantees the payable account had
        // no other live entries before voiding, so the remainder entry restarts
        // the running balance from zero: balanceAfterDzd === netAmount.
        this.repository.createDebtEntry(
          {
            debtAccountId: payableAccount.id,
            entryType: "OPENING",
            signedAmountDzd: netAmount,
            entryDate,
            note: `رصيد متبقي بعد تجميد ${receivableEntry.id.slice(0, 8)}`,
            balanceAfterDzd: netAmount,
            reasonCategory: "INVOICE_DRIVEN",
          },
          audit,
        );
      } else if (netAmount < 0) {
        // Mirror of the payable side: the receivableLiveCount guard guarantees
        // the receivable account has no other live entries here.
        this.repository.createDebtEntry(
          {
            debtAccountId: receivableAccount.id,
            entryType: "OPENING",
            signedAmountDzd: Math.abs(netAmount),
            entryDate,
            note: `رصيد متبقي بعد تجميد ${payableEntry.id.slice(0, 8)}`,
            balanceAfterDzd: Math.abs(netAmount),
            reasonCategory: "INVOICE_DRIVEN",
          },
          audit,
        );
      }

      const payableBalance = this.repository
        .listDebtEntries({ debtAccountId: payableAccount.id })
        .filter((e) => e.status === "LIVE")
        .reduce((sum, e) => sum + e.signedAmountDzd, 0);
      const payableStatus = getDebtAccountStatus(payableBalance);

      const receivableBalance = this.repository
        .listDebtEntries({ debtAccountId: receivableAccount.id })
        .filter((e) => e.status === "LIVE")
        .reduce((sum, e) => sum + e.signedAmountDzd, 0);
      const receivableStatus = getDebtAccountStatus(receivableBalance);

      this.repository.updateDebtAccount(
        {
          id: payableAccount.id,
          currentBalance: payableBalance,
          status: payableStatus,
          settledAt: payableStatus === "SETTLED" ? entryDate : null,
        },
        audit,
      );
      this.repository.updateDebtAccount(
        {
          id: receivableAccount.id,
          currentBalance: receivableBalance,
          status: receivableStatus,
          settledAt: receivableStatus === "SETTLED" ? entryDate : null,
        },
        audit,
      );
    });

    return successResult(
      "تم تجميد الحركتين بنجاح.",
      this.repository.getDebtEntryById(payableEntry.id)!,
    );
  }

  getDebtPartyDetail(input: DebtPartyDetailInput) {
    if (input.partyType === "INTERNAL_WORKER") {
      const employee = requireEmployeeWorker(this.workforceRepo, input.workerId!, "workerId");
      const debtAccounts = this.repository.listDebtAccounts({ workerId: employee.id });
      const totalBalanceDzd = getNetDebtBalance(debtAccounts);
      return successResult("تم تحميل تفاصيل ديون العامل بنجاح.", {
        partyType: "INTERNAL_WORKER" as const,
        workerId: employee.id,
        externalCounterpartyId: null,
        displayName: `${employee.firstName} ${employee.lastName}`,
        phoneNumber: employee.phone,
        note: employee.notes,
        totalBalanceDzd,
        balanceLabel: getDebtBalanceLabel(totalBalanceDzd),
        debtAccounts,
      });
    }

    const counterparty = requireExternalCounterparty(
      this.repository,
      input.externalCounterpartyId!,
      "externalCounterpartyId",
    );
    const debtAccounts = this.repository.listDebtAccounts({
      externalCounterpartyId: counterparty.id,
    });
    const totalBalanceDzd = getNetDebtBalance(debtAccounts);
    return successResult("تم تحميل تفاصيل ديون الطرف الخارجي بنجاح.", {
      partyType: "EXTERNAL_COUNTERPARTY" as const,
      workerId: null,
      externalCounterpartyId: counterparty.id,
      displayName: counterparty.fullName,
      phoneNumber: counterparty.phoneNumber,
      note: counterparty.note,
      totalBalanceDzd,
      balanceLabel: getDebtBalanceLabel(totalBalanceDzd),
      debtAccounts,
    });
  }

  listDebtsSummary() {
    const allDebtAccounts = this.repository.listDebtAccounts();
    const employeesById = new Map(
      this.workforceRepo.listEmployees().map((employee) => [employee.id, employee]),
    );
    const counterpartiesById = new Map(
      this.repository
        .listExternalCounterparties()
        .map((counterparty) => [counterparty.id, counterparty]),
    );

    const debtAccounts = allDebtAccounts.map((account) => {
      const employee = account.workerId ? employeesById.get(account.workerId) : null;
      const counterparty = account.externalCounterpartyId
        ? counterpartiesById.get(account.externalCounterpartyId)
        : null;

      return {
        accountId: account.id,
        partyType: account.partyType,
        workerId: account.workerId,
        externalCounterpartyId: account.externalCounterpartyId,
        displayName: employee
          ? `${employee.firstName} ${employee.lastName}`
          : counterparty?.fullName ?? account.id,
        phoneNumber: employee?.phone ?? counterparty?.phoneNumber ?? null,
        status: account.status,
        direction: account.direction,
        currentBalance: account.currentBalance,
        balanceLabel: getDebtAccountBalanceLabel(account),
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      };
    });

    const partyMap = new Map<
      string,
      {
        partyType: "INTERNAL_WORKER" | "EXTERNAL_COUNTERPARTY";
        workerId: string | null;
        externalCounterpartyId: string | null;
        displayName: string;
        phoneNumber: string | null;
        totalBalanceDzd: number;
        openDebtCasesCount: number;
        settledDebtCasesCount: number;
        latestActivityAt: string;
      }
    >();

    for (const account of allDebtAccounts) {
      const key = buildDebtPartyKey(account);
      const employee = account.workerId ? employeesById.get(account.workerId) : null;
      const counterparty = account.externalCounterpartyId
        ? counterpartiesById.get(account.externalCounterpartyId)
        : null;
      const current = partyMap.get(key);
      const nextLatestActivityAt = current
        ? Date.parse(current.latestActivityAt) > Date.parse(account.updatedAt)
          ? current.latestActivityAt
          : account.updatedAt
        : account.updatedAt;

      partyMap.set(key, {
        partyType: account.partyType,
        workerId: account.workerId,
        externalCounterpartyId: account.externalCounterpartyId,
        displayName: employee
          ? `${employee.firstName} ${employee.lastName}`
          : counterparty?.fullName ?? account.id,
        phoneNumber: employee?.phone ?? counterparty?.phoneNumber ?? null,
        totalBalanceDzd: (current?.totalBalanceDzd ?? 0) + getDebtAccountNetContribution(account),
        openDebtCasesCount:
          (current?.openDebtCasesCount ?? 0) + (account.status === "OPEN" ? 1 : 0),
        settledDebtCasesCount:
          (current?.settledDebtCasesCount ?? 0) + (account.status === "SETTLED" ? 1 : 0),
        latestActivityAt: nextLatestActivityAt,
      });
    }

    const parties = Array.from(partyMap.values())
      .map((party) => ({
        ...party,
        balanceLabel: getDebtBalanceLabel(party.totalBalanceDzd),
      }))
      .sort((left, right) => Date.parse(right.latestActivityAt) - Date.parse(left.latestActivityAt));

    return { parties, debtAccounts };
  }

  /**
   * Generate the DEBT report.
   *
   * Real aggregation over debt accounts + LIVE entries — the dashboard's
   * outstanding/overdue/aging/top-debtor cards. Semantics (documented in
   * issue #242 design):
   *  - An account participates iff it has at least one LIVE entry whose
   *    `entryDate` falls inside [startDate, endDate]; unbounded sides are open.
   *    Balances are point-in-time as of now/endDate.
   *  - Age = whole days from the account's OLDEST live entry to the report
   *    date (clamped ≥ 0). No due date exists in the domain, so "overdue" is
   *    defined operationally as OPEN balances aged ≥ 60 days (the 60+ bucket).
   *  - Settled = |signedAmount| of LIVE SETTLEMENT entries per account.
   *  - topDebtors `daysSinceLastPayment` = days since the party's latest LIVE
   *    PAYMENT entry; when no payment exists it falls back to days since the
   *    latest LIVE entry (a documented proxy, never a fabricated payment date).
   *  - Direction semantics: `totalOutstandingDzd`, `overdueDzd` and the aging
   *    amounts aggregate GROSS open balances across BOTH PAYABLE and RECEIVABLE
   *    directions (exposure magnitude, always non-negative). The net sign
   *    convention lives in `getDebtAccountNetContribution`/`getNetDebtBalance`
   *    in @tuari/contracts and is used elsewhere; this report deliberately does
   *    not net directions (a net figure can go negative, which the contract's
   *    non-negative schema cannot represent).
   */
  generateDebtReport(input: { startDate?: string; endDate?: string }): DebtReport {
    const { startMs, endMs, reportDateMs } = resolveReportWindow(input);

    const accounts = this.repository.listDebtAccounts();

    const liveEntriesByAccount = new Map<string, DebtEntryRecord[]>();
    for (const entry of this.repository.listAllDebtEntries()) {
      if (entry.status !== "LIVE") {
        continue;
      }
      const list = liveEntriesByAccount.get(entry.debtAccountId) ?? [];
      list.push(entry);
      liveEntriesByAccount.set(entry.debtAccountId, list);
    }

    const employeesById = new Map(
      this.workforceRepo.listEmployees().map((employee) => [employee.id, employee]),
    );
    const counterpartiesById = new Map(
      this.repository
        .listExternalCounterparties()
        .map((counterparty) => [counterparty.id, counterparty]),
    );

    const includedAccounts = accounts.filter((account) => {
      const entries = liveEntriesByAccount.get(account.id) ?? [];
      return entries.some((entry) => {
        const entryMs = Date.parse(entry.entryDate);
        return entryMs >= startMs && entryMs <= endMs;
      });
    });

    const agingAccumulators: Record<
      "0-30_DAYS" | "31-60_DAYS" | "60+_DAYS",
      { countOpen: number; amountDzd: number }
    > = {
      "0-30_DAYS": { countOpen: 0, amountDzd: 0 },
      "31-60_DAYS": { countOpen: 0, amountDzd: 0 },
      "60+_DAYS": { countOpen: 0, amountDzd: 0 },
    };

    const partyMap = new Map<
      string,
      {
        partyId: string;
        partyName: string;
        partyType: "INTERNAL_WORKER" | "EXTERNAL_COUNTERPARTY";
        outstandingDzd: number;
        settledDzd: number;
        lastTransaction: string | null;
        /** Milliseconds of the latest LIVE entry (any type) — topDebtors fallback. */
        latestEntryMs: number;
        /** Milliseconds of the latest LIVE PAYMENT entry — topDebtors. */
        latestPaymentMs: number;
      }
    >();

    let totalOutstandingDzd = 0;
    let totalSettledDzd = 0;
    let overdueDzd = 0;

    for (const account of includedAccounts) {
      // includedAccounts guarantees >= 1 live entry; fallback is defensive and unreachable
      /* v8 ignore start */
      const entries = liveEntriesByAccount.get(account.id) ?? [];
      /* v8 ignore stop */
      const oldestMs = Math.min(...entries.map((entry) => Date.parse(entry.entryDate)));
      const age = Math.max(0, Math.floor((reportDateMs - oldestMs) / MS_PER_DAY));

      const accountOutstanding = account.status === "OPEN" ? account.currentBalance : 0;
      const accountSettled =
        account.status === "SETTLED"
          ? entries
              .filter((entry) => entry.entryType === "SETTLEMENT")
              .reduce((sum, entry) => sum + Math.abs(entry.signedAmountDzd), 0)
          : 0;

      totalOutstandingDzd += accountOutstanding;
      totalSettledDzd += accountSettled;

      if (account.status === "OPEN") {
        // Boundary: age 60 lands in "60+_DAYS" so the 60+ bucket always equals
        // the overdue figure (both mean age >= 60). 30 stays in "0-30_DAYS".
        const ageCategory =
          age <= 30 ? "0-30_DAYS" : age <= 59 ? "31-60_DAYS" : "60+_DAYS";
        agingAccumulators[ageCategory].countOpen += 1;
        agingAccumulators[ageCategory].amountDzd += account.currentBalance;
        if (age >= 60) {
          overdueDzd += account.currentBalance;
        }
      }

      const key = buildDebtPartyKey(account);
      const employee = account.workerId ? employeesById.get(account.workerId) : null;
      const counterparty = account.externalCounterpartyId
        ? counterpartiesById.get(account.externalCounterpartyId)
        : null;
      // entries is provably non-empty; entry_date is NOT NULL, so the empty-string fallback never fires
      /* v8 ignore start */
      const latestTransaction = [...entries]
        .sort((a, b) => b.entryDate.localeCompare(a.entryDate))[0]?.entryDate ?? "";
      /* v8 ignore stop */
      const entryMs = Math.max(0, ...entries.map((entry) => Date.parse(entry.entryDate)));
      const paymentMs = Math.max(
        0,
        ...entries
          .filter((entry) => entry.entryType === "PAYMENT")
          .map((entry) => Date.parse(entry.entryDate)),
      );
      const current = partyMap.get(key);
      const previous = current?.lastTransaction ?? null;

      partyMap.set(key, {
        // debt_account CHECK enforces exactly one party ref; the account.id fallback is unreachable
        /* v8 ignore start */
        partyId: account.workerId ?? account.externalCounterpartyId ?? account.id,
        /* v8 ignore stop */
        partyName: employee
          ? `${employee.firstName} ${employee.lastName}`
          : counterparty?.fullName ?? account.id,
        partyType: account.partyType,
        outstandingDzd: (current?.outstandingDzd ?? 0) + accountOutstanding,
        settledDzd: (current?.settledDzd ?? 0) + accountSettled,
        lastTransaction:
          !previous || Date.parse(latestTransaction) > Date.parse(previous)
            ? latestTransaction
            : previous,
        latestEntryMs: Math.max(current?.latestEntryMs ?? 0, entryMs),
        latestPaymentMs: Math.max(current?.latestPaymentMs ?? 0, paymentMs),
      });
    }

    const byParty = Array.from(partyMap.values())
      .map((party) => ({
        partyId: party.partyId,
        partyName: party.partyName,
        partyType: party.partyType,
        outstandingDzd: roundMoney(party.outstandingDzd),
        settledDzd: roundMoney(party.settledDzd),
        lastTransaction: party.lastTransaction,
      }))
      .sort(
        (a, b) => b.outstandingDzd - a.outstandingDzd || a.partyName.localeCompare(b.partyName, "ar"),
      );

    const topDebtors = Array.from(partyMap.values())
      .filter((party) => party.outstandingDzd > 0)
      .sort((a, b) => b.outstandingDzd - a.outstandingDzd)
      .slice(0, 10)
      .map((party) => {
        const referenceMs = party.latestPaymentMs > 0 ? party.latestPaymentMs : party.latestEntryMs;
        return {
          partyName: party.partyName,
          amountDzd: roundMoney(party.outstandingDzd),
          daysSinceLastPayment: Math.max(0, Math.floor((reportDateMs - referenceMs) / MS_PER_DAY)),
        };
      });

    return {
      type: "DEBT",
      generatedAt: createAlgeriaTimestamp(),
      summary: {
        totalOutstandingDzd: roundMoney(totalOutstandingDzd),
        totalSettledDzd: roundMoney(totalSettledDzd),
        overdueDzd: roundMoney(overdueDzd),
        partyCount: byParty.length,
      },
      agingBreakdown: (["0-30_DAYS", "31-60_DAYS", "60+_DAYS"] as const).map((ageCategory) => ({
        ageCategory,
        countOpen: agingAccumulators[ageCategory].countOpen,
        amountDzd: roundMoney(agingAccumulators[ageCategory].amountDzd),
      })),
      byParty,
      topDebtors,
    };
  }
}
