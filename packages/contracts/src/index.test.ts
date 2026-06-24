import { describe, expect, it } from "vitest";
import {
  appErrorSchema,
  authSetupStatusSchema,
  debtAccountCreateInputSchema,
  debtAccountSchema,
  debtPartyDetailSchema,
  debtEntryCreateInputSchema,
  debtEntryRecordPaymentInputSchema,
  debtEntrySchema,
  debtConsolidationInputSchema,
  debtEntryVoidInputSchema,
  debtReasonCategoryDirectionMap,
  debtSummaryItemSchema,
  debtsSummarySchema,
  directDebtEntryCreateInputSchema,
  externalCounterpartyCreateInputSchema,
  externalCounterpartySchema,
  employeeBatchCreateInputSchema,
  employeeBatchLimit,
  employeeProjectAssignmentSchema,
  employeeSalaryPaymentCreateInputSchema,
  employeeWarehouseAssignmentSchema,
  employeeSchema,
  invoiceCreateInputSchema,
  invoiceDirectionSchema,
  invoiceMarkPaidInputSchema,
  invoiceSchema,
  managerAssignmentCreateInputSchema,
  phonePasswordSignInSchema,
  projectAssignmentCreateInputSchema,
  projectSchema,
  roleCreateInputSchema,
  sessionUserSchema,
  systemLogEntrySchema,
  warehouseSchema,
} from "./index";

describe("contracts", () => {
  it("accepts a valid phone password sign-in payload", () => {
    expect(
        phonePasswordSignInSchema.parse({
        phone: "0612345678",
        password: "password123",
        rememberMe: true,
      }),
    ).toEqual({
      phone: "0612345678",
      password: "password123",
      rememberMe: true,
    });
  });

  it("rejects invalid sign-in payloads", () => {
    expect(() =>
      phonePasswordSignInSchema.parse({
        phone: "",
        password: "short",
      }),
    ).toThrowError();
  });

  it("exposes auth setup status with optional bootstrap secret gating", () => {
    expect(
      authSetupStatusSchema.parse({
        hasUsers: false,
        requiresSetupKey: true,
      }),
    ).toEqual({
      hasUsers: false,
      requiresSetupKey: true,
    })
  })

  it("accepts a session user with phone identity", () => {
    expect(
        sessionUserSchema.parse({
          id: "user-1",
          name: null,
          phone: "0612345678",
        }),
      ).toEqual({
        id: "user-1",
        name: null,
        phone: "0612345678",
    });
  });

  it("keeps optional manager references nullable in project and warehouse schemas", () => {
    expect(
      projectSchema.parse({
        id: "project-1",
        name: "North Site",
        location: null,
        managerId: null,
        status: "ACTIVE",
        notes: null,
        createdAt: "2026-03-13T10:00:00.000Z",
        updatedAt: "2026-03-13T10:00:00.000Z",
      }).managerId,
    ).toBeNull();

    expect(
      warehouseSchema.parse({
        id: "warehouse-1",
        name: "Main Store",
        address: null,
        managerId: null,
        status: "ACTIVE",
        notes: null,
        createdAt: "2026-03-13T10:00:00.000Z",
        updatedAt: "2026-03-13T10:00:00.000Z",
      }).managerId,
    ).toBeNull();
  });

  it("keeps employee project assignment employeeId generic", () => {
    expect(
      employeeProjectAssignmentSchema.parse({
        id: "assignment-1",
        employeeId: "employee-1",
        projectId: "project-1",
        status: "ACTIVE",
        startDate: "2026-03-13T10:00:00.000Z",
        endDate: null,
        notes: null,
        actorUserId: null,
        transactionId: null,
        createdAt: "2026-03-13T10:00:00.000Z",
        updatedAt: "2026-03-13T10:00:00.000Z",
      }).employeeId,
    ).toBe("employee-1");
  });

  it("rejects malformed app errors", () => {
    expect(() =>
      appErrorSchema.parse({
        code: "VALIDATION",
        message: "",
      }),
    ).toThrowError();
  });

  it("accepts a required employee identity shape", () => {
    expect(
        employeeSchema.parse({
          id: "employee-1",
          firstName: "Amara",
          lastName: "Necib",
          phone: "0612345678",
          roleId: "role-worker",
          status: "ACTIVE",
          salaryAmountDzd: 4500,
          salaryPeriod: "DAILY",
        notes: null,
        createdAt: "2026-03-13T10:00:00.000Z",
        updatedAt: "2026-03-13T10:00:00.000Z",
      }).phone,
    ).toBe("0612345678");
  });

  it("accepts create payloads for core company entities", () => {
    expect(
      roleCreateInputSchema.parse({
        key: "site_admin",
        name: "Site Admin",
        description: null,
      }).key,
    ).toBe("site_admin");

    expect(
      managerAssignmentCreateInputSchema.parse({
        workerId: "employee-1",
        managerId: "employee-2",
        status: "ACTIVE",
      }).status,
    ).toBe("ACTIVE");

    expect(
      projectAssignmentCreateInputSchema.parse({
        employeeId: "employee-1",
        projectId: "project-1",
        status: "ACTIVE",
      }).employeeId,
    ).toBe("employee-1");
  });

  it("keeps employee warehouse assignment employeeId generic", () => {
    expect(
      employeeWarehouseAssignmentSchema.parse({
        id: "assignment-1",
        employeeId: "employee-1",
        warehouseId: "warehouse-1",
        status: "ACTIVE",
        startDate: "2026-03-13T10:00:00.000Z",
        endDate: null,
        notes: null,
        actorUserId: null,
        transactionId: null,
        createdAt: "2026-03-13T10:00:00.000Z",
        updatedAt: "2026-03-13T10:00:00.000Z",
      }).employeeId,
    ).toBe("employee-1");
  });

  it("accepts employee batch payloads with optional manager references", () => {
    expect(
      employeeBatchCreateInputSchema.parse({
        employees: [
          {
            firstName: "Yacine",
            lastName: "Belaid",
            phone: "0612345678",
            roleId: "role-worker",
            status: "ACTIVE",
            managerId: "employee-manager-1",
            projectId: "project-1",
          },
        ],
      }).employees[0]?.managerId,
    ).toBe("employee-manager-1");
  });

  it("accepts salary payment payloads without client-supplied expected amount", () => {
    expect(
      employeeSalaryPaymentCreateInputSchema.parse({
        employeeId: "employee-1",
        actualAmountDzd: 8200,
        paymentDate: "2026-03-17T10:00:00.000Z",
        note: "دفعة مارس",
      }).actualAmountDzd,
    ).toBe(8200)
  })

  it("accepts external counterparties and debt ledger payloads", () => {
    expect(
      externalCounterpartyCreateInputSchema.parse({
        fullName: "شركة البركة",
        phoneNumber: "0612345678",
        note: "مورد خارجي",
      }).fullName,
    ).toBe("شركة البركة")

    expect(
      debtAccountCreateInputSchema.parse({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: "counterparty-1",
        openingBalanceDzd: 1200,
      }).partyType,
    ).toBe("EXTERNAL_COUNTERPARTY")

    expect(
      debtEntryCreateInputSchema.parse({
        debtAccountId: "debt-account-1",
        entryType: "PAYMENT",
        signedAmountDzd: -500,
      }).entryType,
    ).toBe("PAYMENT")
  })

  it("rejects invalid debt account party linkage", () => {
    expect(() =>
      debtAccountCreateInputSchema.parse({
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        externalCounterpartyId: "counterparty-1",
      }),
    ).toThrowError()
  })

  it("accepts debt entities in the shared contract", () => {
    expect(
      externalCounterpartySchema.parse({
        id: "counterparty-1",
        fullName: "عميل خارجي",
        phoneNumber: "0612345678",
        note: null,
        createdAt: "2026-03-17T10:00:00.000Z",
        updatedAt: "2026-03-17T10:00:00.000Z",
      }).id,
    ).toBe("counterparty-1")

    expect(
      debtAccountSchema.parse({
        id: "debt-account-1",
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        externalCounterpartyId: null,
        status: "OPEN",
        direction: "PAYABLE",
        currentBalance: 1500,
        note: null,
        settledAt: null,
        actorUserId: "user-1",
        actorLabel: "Admin",
        transactionId: "550e8400-e29b-41d4-a716-446655440000",
        createdAt: "2026-03-17T10:00:00.000Z",
        updatedAt: "2026-03-17T10:00:00.000Z",
      }).partyType,
    ).toBe("INTERNAL_WORKER")

    // Issue #22: every debt account carries a `direction` (PAYABLE or
    // RECEIVABLE). The schema must reject unknown values.
    expect(() =>
      debtAccountSchema.parse({
        id: "debt-account-bad",
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        externalCounterpartyId: null,
        status: "OPEN",
        direction: "BOGUS",
        currentBalance: 0,
        note: null,
        settledAt: null,
        actorUserId: "user-1",
        actorLabel: "Admin",
        transactionId: "550e8400-e29b-41d4-a716-446655440000",
        createdAt: "2026-03-17T10:00:00.000Z",
        updatedAt: "2026-03-17T10:00:00.000Z",
      }),
    ).toThrow()

    // The summary item is a projection of debtAccount and inherits
    // the same direction enum.
    expect(
      debtSummaryItemSchema.parse({
        accountId: "debt-account-1",
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        externalCounterpartyId: null,
        displayName: "عامل واحد",
        phoneNumber: "0612345678",
        status: "OPEN",
        direction: "RECEIVABLE",
        currentBalance: 500,
        balanceLabel: "لنا عنده",
        createdAt: "2026-03-17T10:00:00.000Z",
        updatedAt: "2026-03-17T10:00:00.000Z",
      }).direction,
    ).toBe("RECEIVABLE")

    expect(
      debtEntrySchema.parse({
        id: "debt-entry-1",
        debtAccountId: "debt-account-1",
        entryType: "SETTLEMENT",
        signedAmountDzd: -1500,
        entryDate: "2026-03-17T10:00:00.000Z",
        note: null,
        balanceAfterDzd: 0,
        actorUserId: "user-1",
        actorLabel: "Admin",
        transactionId: "550e8400-e29b-41d4-a716-446655440000",
        createdAt: "2026-03-17T10:00:00.000Z",
        updatedAt: "2026-03-17T10:00:00.000Z",
        // Issue #25: reason category, payment method, void metadata
        reasonCategory: "INVOICE_DRIVEN",
        reasonDetail: null,
        paymentMethod: null,
        status: "LIVE",
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
      }).entryType,
    ).toBe("SETTLEMENT")

  })

  it("accepts aggregate debt payloads", () => {
    expect(
      debtPartyDetailSchema.parse({
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        externalCounterpartyId: null,
        displayName: "عامل واحد",
        phoneNumber: "0612345678",
        note: null,
        totalBalanceDzd: 200,
        balanceLabel: "لنا عنده",
        debtAccounts: [],
      }).totalBalanceDzd,
    ).toBe(200)

    expect(
      debtsSummarySchema.parse({
        parties: [
          {
            partyType: "INTERNAL_WORKER",
            workerId: "worker-1",
            externalCounterpartyId: null,
            displayName: "عامل واحد",
            phoneNumber: "0612345678",
            totalBalanceDzd: 200,
            balanceLabel: "لنا عنده",
            openDebtCasesCount: 1,
            settledDebtCasesCount: 1,
            latestActivityAt: "2026-03-17T10:00:00.000Z",
          },
        ],
        debtAccounts: [],
      }).parties[0]?.openDebtCasesCount,
    ).toBe(1)
  })

  it("accepts grouped system log entries", () => {
    expect(
      systemLogEntrySchema.parse({
        id: "log-1",
        transactionId: "550e8400-e29b-41d4-a716-446655440000",
        actorUserId: "user-1",
        actorLabel: "Admin One",
        actionType: "DEBT_ENTRY_RECORDED",
        entityType: "DEBT_ENTRY",
        entityId: "assignment-1",
        entityLabel: "North Site",
        summary: "تم إسناد العامل إلى المشروع",
        detail: null,
        createdAt: "2026-03-17T10:00:00.000Z",
      }).actionType,
    ).toBe("DEBT_ENTRY_RECORDED")
  })

  it("derives direction from reason category (category locks direction)", () => {
    // SALARY_ADVANCE and REIMBURSEMENT are PAYABLE
    expect(debtReasonCategoryDirectionMap.SALARY_ADVANCE).toBe("PAYABLE");
    expect(debtReasonCategoryDirectionMap.REIMBURSEMENT).toBe("PAYABLE");
    expect(debtReasonCategoryDirectionMap.DIRECT_LOAN_TAKEN).toBe("PAYABLE");

    // CASH_TAKE, EQUIPMENT_DAMAGE, PERSONAL_LOAN, DIRECT_LOAN_GIVEN are RECEIVABLE
    expect(debtReasonCategoryDirectionMap.CASH_TAKE).toBe("RECEIVABLE");
    expect(debtReasonCategoryDirectionMap.EQUIPMENT_DAMAGE).toBe("RECEIVABLE");
    expect(debtReasonCategoryDirectionMap.PERSONAL_LOAN).toBe("RECEIVABLE");
    expect(debtReasonCategoryDirectionMap.DIRECT_LOAN_GIVEN).toBe("RECEIVABLE");

    // OTHER is unconstrained (caller provides direction)
    expect(debtReasonCategoryDirectionMap.OTHER).toBe("UNCONSTRAINED");

    // INVOICE_DRIVEN is unconstrained (derived from invoice direction)
    expect(debtReasonCategoryDirectionMap.INVOICE_DRIVEN).toBe("UNCONSTRAINED");
  });

  it("validates reason category on debt entry create input", () => {
    // Valid: required reason category for direct debts
    const validInput = directDebtEntryCreateInputSchema.parse({
      partyType: "INTERNAL_WORKER",
      workerId: "worker-1",
      reasonCategory: "SALARY_ADVANCE",
      amountDzd: 5000,
      entryDate: "2026-03-17T10:00:00.000Z",
    });
    expect(validInput.reasonCategory).toBe("SALARY_ADVANCE");

    // OTHER category requires reasonDetail
    expect(() =>
      directDebtEntryCreateInputSchema.parse({
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        reasonCategory: "OTHER",
        amountDzd: 1000,
      }),
    ).toThrow();

    // OTHER category with reasonDetail is valid
    const validOther = directDebtEntryCreateInputSchema.parse({
      partyType: "INTERNAL_WORKER",
      workerId: "worker-1",
      reasonCategory: "OTHER",
      amountDzd: 1000,
      reasonDetail: "قرض شخصي لشراء مواد",
    });
    expect(validOther.reasonDetail).toBe("قرض شخصي لشراء مواد");
  });

  it("validates inline debt payment input", () => {
    expect(
      debtEntryRecordPaymentInputSchema.parse({
        debtEntryId: "debt-entry-1",
        amountDzd: 500,
      }),
    ).toEqual({
      debtEntryId: "debt-entry-1",
      amountDzd: 500,
      paymentMethod: "CASH",
    });

    expect(
      debtEntryRecordPaymentInputSchema.parse({
        debtEntryId: "debt-entry-1",
        amountDzd: 500,
        paymentMethod: "BANK_TRANSFER",
        note: "دفعة جزئية",
      }),
    ).toMatchObject({
      paymentMethod: "BANK_TRANSFER",
      note: "دفعة جزئية",
    });

    expect(() =>
      debtEntryRecordPaymentInputSchema.parse({
        debtEntryId: "debt-entry-1",
        amountDzd: 0,
      }),
    ).toThrow();
  });

  it("validates debt entry void input", () => {
    expect(
      debtEntryVoidInputSchema.parse({
        entryId: "debt-entry-1",
        voidReason: "تم التسجيل بالخطأ",
      }),
    ).toEqual({
      entryId: "debt-entry-1",
      voidReason: "تم التسجيل بالخطأ",
    });

    expect(() =>
      debtEntryVoidInputSchema.parse({
        entryId: "debt-entry-1",
        voidReason: "   ",
      }),
    ).toThrow();
  });

  it("validates debt consolidation input", () => {
    expect(
      debtConsolidationInputSchema.parse({
        payableEntryId: "entry-payable-1",
        receivableEntryId: "entry-receivable-1",
      }),
    ).toEqual({
      payableEntryId: "entry-payable-1",
      receivableEntryId: "entry-receivable-1",
    });

    // Missing receivable entry should fail
    expect(() =>
      debtConsolidationInputSchema.parse({
        payableEntryId: "entry-payable-1",
      }),
    ).toThrow();
  });

  it("validates payment method on debt entry", () => {
    const entry = debtEntrySchema.parse({
      id: "debt-entry-1",
      debtAccountId: "debt-account-1",
      entryType: "PAYMENT",
      signedAmountDzd: -500,
      entryDate: "2026-03-17T10:00:00.000Z",
      note: null,
      balanceAfterDzd: 0,
      actorUserId: "user-1",
      actorLabel: "Admin",
      transactionId: "550e8400-e29b-41d4-a716-446655440000",
      createdAt: "2026-03-17T10:00:00.000Z",
      updatedAt: "2026-03-17T10:00:00.000Z",
      reasonCategory: "INVOICE_DRIVEN",
      status: "LIVE",
      paymentMethod: null,
      reasonDetail: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
    });
    expect(entry.reasonCategory).toBe("INVOICE_DRIVEN");
    expect(entry.status).toBe("LIVE");
    expect(entry.paymentMethod).toBeNull();
  });

  it("rejects duplicate phones inside the same employee batch", () => {
    expect(() =>
      employeeBatchCreateInputSchema.parse({
        employees: [
          {
            firstName: "Yacine",
            lastName: "Belaid",
            phone: "0612345678",
            roleId: "role-worker",
            status: "ACTIVE",
          },
          {
            firstName: "Meriem",
            lastName: "Saidi",
            phone: "0612345678",
            roleId: "role-worker",
            status: "ACTIVE",
          },
        ],
      }),
    ).toThrowError();

    expect(employeeBatchLimit).toBe(24);
  });

  describe("invoice direction (#26 PURCHASE/SALE)", () => {
    describe("invoiceDirectionSchema", () => {
      it("accepts PURCHASE", () => {
        expect(invoiceDirectionSchema.parse("PURCHASE")).toBe("PURCHASE");
      });

      it("accepts SALE", () => {
        expect(invoiceDirectionSchema.parse("SALE")).toBe("SALE");
      });

      it("rejects invalid direction values", () => {
        expect(() => invoiceDirectionSchema.parse("INVALID")).toThrow();
        expect(() => invoiceDirectionSchema.parse("PAYABLE")).toThrow();
        expect(() => invoiceDirectionSchema.parse("")).toThrow();
      });
    });

    describe("invoiceCreateInputSchema", () => {
      const baseInput = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        supplierName: "Supplier Co",
        lineItems: [
          { description: "Item", quantity: 10, unitPrice: 100 },
        ],
      };

      it("defaults direction to PURCHASE when omitted", () => {
        const result = invoiceCreateInputSchema.parse(baseInput);
        expect(result.direction).toBe("PURCHASE");
      });

      it("accepts explicit SALE direction", () => {
        const result = invoiceCreateInputSchema.parse({
          ...baseInput,
          direction: "SALE",
        });
        expect(result.direction).toBe("SALE");
      });

      it("accepts explicit PURCHASE direction", () => {
        const result = invoiceCreateInputSchema.parse({
          ...baseInput,
          direction: "PURCHASE",
        });
        expect(result.direction).toBe("PURCHASE");
      });

      it("rejects invalid direction values", () => {
        expect(() =>
          invoiceCreateInputSchema.parse({
            ...baseInput,
            direction: "INVALID",
          }),
        ).toThrow();
      });
    });

    describe("invoiceMarkPaidInputSchema", () => {
      const baseInput = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        amountDzd: 500,
      };

      it("direction is undefined when omitted (no default, unlike create)", () => {
        const result = invoiceMarkPaidInputSchema.parse(baseInput);
        expect(result.direction).toBeUndefined();
      });

      it("accepts explicit direction", () => {
        const result = invoiceMarkPaidInputSchema.parse({
          ...baseInput,
          direction: "SALE",
        });
        expect(result.direction).toBe("SALE");
      });

      it("rejects invalid direction values", () => {
        expect(() =>
          invoiceMarkPaidInputSchema.parse({
            ...baseInput,
            direction: "INVALID",
          }),
        ).toThrow();
      });
    });

    describe("invoiceSchema", () => {
      const baseInvoice = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        invoiceNumber: null,
        supplierName: "Supplier Co",
        supplierPhone: null,
        warehouseId: null,
        projectId: null,
        status: "DRAFT" as const,
        invoiceDate: null,
        dueDate: null,
        currency: "DZD" as const,
        totalAmount: 1000,
        paidAmount: 0,
        remainingAmount: 1000,
        notes: null,
        debtAccountId: null,
        createdAt: "2026-03-17T10:00:00.000Z",
        updatedAt: "2026-03-17T10:00:00.000Z",
        lineItems: [],
      };

      it("requires direction (no default — entity schema reflects stored data)", () => {
        expect(() => invoiceSchema.parse(baseInvoice)).toThrow();
      });

      it("accepts invoice with SALE direction", () => {
        const result = invoiceSchema.parse({
          ...baseInvoice,
          direction: "SALE",
        });
        expect(result.direction).toBe("SALE");
      });

      it("accepts invoice with PURCHASE direction", () => {
        const result = invoiceSchema.parse({
          ...baseInvoice,
          direction: "PURCHASE",
        });
        expect(result.direction).toBe("PURCHASE");
      });

      it("rejects invalid direction", () => {
        expect(() =>
          invoiceSchema.parse({
            ...baseInvoice,
            direction: "INVALID",
          }),
        ).toThrow();
      });
    });
  });
});
