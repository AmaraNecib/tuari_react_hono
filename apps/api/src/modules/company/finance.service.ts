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
  type DebtSettlementInput,
  type ExternalCounterpartyCreateInput,
} from "@tuari/contracts";

import { CompanyError } from "./company.errors";
import {
  assertDebtEntryDateNotBackdated,
  buildDebtPartyKey,
  getDebtAccountBalanceLabel,
  getDebtAccountNetContribution,
  getDebtAccountStatus,
  getDebtBalanceLabel,
  getNetDebtBalance,
  normalizeSignedMoneyAmount,
  normalizeText,
  successResult,
} from "./company.helpers";
import { WorkspaceMutationContext } from "./workspace-mutation-context";
import type { CompanyRepository } from "./company.repository";
import {
  type DebtAccountListFilters,
  type DebtEntryListFilters,
  type ExternalCounterpartyListFilters,
  type MutationAuditContext,
} from "./company.types";
import { normalizeAlgeriaTimestamp } from "./company-time";
import {
  requireDebtAccount,
  requireEmployee,
  requireEmployeeWorker,
  requireExternalCounterparty,
} from "./company.entity-resolvers";

export class FinanceService {
  constructor(
    private readonly repository: CompanyRepository,
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
    requireEmployee(this.repository, employeeId);
    const accounts = this.listDebtAccounts({ workerId: employeeId }).items;
    return accounts[0] ?? null;
  }

  createEmployeeDebtEntry(
    input: {
      employeeId: string;
      entryType: "OPENING" | "PAYMENT" | "ADJUSTMENT" | "ADVANCE";
      amountDzd: number;
      entryDate?: string;
      note?: string;
      reasonCategory?: DebtEntry["reasonCategory"];
    },
    auditContext?: MutationAuditContext,
  ) {
    const employee = requireEmployee(this.repository, input.employeeId);

    let account = this.getEmployeeDebtAccount(input.employeeId);
    if (!account) {
      const createResult = this.createDebtAccount(
        {
          partyType: "INTERNAL_WORKER",
          workerId: input.employeeId,
          note: `حساب الدين للعامل: ${employee.firstName} ${employee.lastName}`,
        },
        auditContext,
      );
      account = createResult.item;
    }

    const result = this.createDebtEntry(
      {
        debtAccountId: account.id,
        entryType: input.entryType,
        signedAmountDzd: input.amountDzd,
        entryDate: input.entryDate,
        note: input.note || `${input.entryType}: ${employee.firstName} ${employee.lastName}`,
        reasonCategory: input.reasonCategory,
      },
      auditContext,
    );

    return result.item;
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
    return this.mutation.withTransaction(() => {
      this.mutation.createMutationAuditContext(auditContext);

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
      requireEmployeeWorker(this.repository, workerId!, "workerId");
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

    const existingAccount =
      input.partyType === "INTERNAL_WORKER"
        ? this.repository.getDebtAccountByWorkerId(workerId!)
        : input.direction === "RECEIVABLE"
          ? this.repository.getDebtAccountByExternalCounterpartyIdAndDirection(
              externalCounterpartyId!,
              "RECEIVABLE",
            )
          : this.repository.getDebtAccountByExternalCounterpartyIdAndDirection(
              externalCounterpartyId!,
              "PAYABLE",
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
    const account = this.repository.withTransaction(() => {
      const createdAccount = this.repository.createDebtAccount(
        {
          partyType: input.partyType,
          workerId,
          externalCounterpartyId,
          direction: input.direction ?? "PAYABLE",
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
    assertDebtEntryDateNotBackdated(entryDate, latestEntry?.entryDate ?? null, "entryDate");
    const nextBalance = account.currentBalance + signedAmountDzd;
    const nextStatus = getDebtAccountStatus(nextBalance);

    const entry = this.repository.withTransaction(() => {
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

  recordDebtPayment(input: DebtEntryRecordPaymentInput, auditContext?: MutationAuditContext) {
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
    if (entry.entryType !== "OPENING") {
      throw new CompanyError("BUSINESS_RULE", "يمكن تسديد حركات الفتح فقط.");
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
    assertDebtEntryDateNotBackdated(entryDate, latestEntry?.entryDate ?? null, "entryDate");
    const nextBalance = account.currentBalance + signedAmountDzd;
    const nextStatus = getDebtAccountStatus(nextBalance);

    const payment = this.repository.withTransaction(() => {
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

    this.repository.withTransaction(() => {
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
    assertDebtEntryDateNotBackdated(entryDate, latestEntry?.entryDate ?? null, "entryDate");
    const settlementAmount = -account.currentBalance;
    const entry = this.repository.withTransaction(() => {
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

    this.repository.withTransaction(() => {
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
        const liveBalance = this.repository
          .listDebtEntries({ debtAccountId: payableAccount.id })
          .filter((e) => e.status === "LIVE")
          .reduce((sum, e) => sum + e.signedAmountDzd, 0);

        this.repository.createDebtEntry(
          {
            debtAccountId: payableAccount.id,
            entryType: "OPENING",
            signedAmountDzd: netAmount,
            entryDate,
            note: `رصيد متبقي بعد تجميد ${receivableEntry.id.slice(0, 8)}`,
            balanceAfterDzd: liveBalance + netAmount,
            reasonCategory: "INVOICE_DRIVEN",
          },
          audit,
        );
      } else if (netAmount < 0) {
        const liveBalance = this.repository
          .listDebtEntries({ debtAccountId: receivableAccount.id })
          .filter((e) => e.status === "LIVE")
          .reduce((sum, e) => sum + e.signedAmountDzd, 0);

        this.repository.createDebtEntry(
          {
            debtAccountId: receivableAccount.id,
            entryType: "OPENING",
            signedAmountDzd: Math.abs(netAmount),
            entryDate,
            note: `رصيد متبقي بعد تجميد ${payableEntry.id.slice(0, 8)}`,
            balanceAfterDzd: liveBalance + Math.abs(netAmount),
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

      for (const accountId of [payableAccount.id, receivableAccount.id]) {
        const sortedLive = this.repository
          .listDebtEntries({ debtAccountId: accountId })
          .filter((e) => e.status === "LIVE")
          .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id));
        let running = 0;
        for (const entry of sortedLive) {
          running += entry.signedAmountDzd;
          this.repository.updateDebtEntryBalanceAfter(entry.id, running);
        }
      }
    });

    return successResult(
      "تم تجميد الحركتين بنجاح.",
      this.repository.getDebtEntryById(payableEntry.id)!,
    );
  }

  getDebtPartyDetail(input: DebtPartyDetailInput) {
    if (input.partyType === "INTERNAL_WORKER") {
      const employee = requireEmployeeWorker(this.repository, input.workerId!, "workerId");
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
      this.repository.listEmployees().map((employee) => [employee.id, employee]),
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
}
