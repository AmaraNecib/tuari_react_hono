import { describe, expect, it } from "vitest";
import {
  appContract,
  appErrorSchema,
  authBootstrapInputSchema,
  authSetupStatusSchema,
  changeDbKeyInputSchema,
  changeDbKeyOutputSchema,
  consumeRecoveryKeyInputSchema,
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
  recurringPatternSchema,
  reportFilterInputSchema,
  paymentAmountSchema,
  paymentListLimitSchema,
  paymentListInputSchema,
  revokeRecoveryKeyInputSchema,
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

  // #230/#321: the visible-character policy applies where credentials are
  // CREATED (bootstrap); sign-in only VERIFIES against an existing hash, so
  // it must accept legacy all-invisible passwords (a pre-#230 hash can only
  // be matched by the exact all-invisible value it was created from) — that
  // is the #321 recovery channel. The two matrices below pin the split.
  const blankPasswords = [
    { label: "spaces", password: "        " },
    { label: "tabs", password: "\t\t\t\t\t\t\t\t" },
    { label: "newlines", password: "\n\n\n\n\n\n\n\n" },
    { label: "NBSP", password: "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0" },
    { label: "zero-width format chars", password: "\u200B\u200B\u200B\u200B\u200B\u200B\u200B\u200B" },
    { label: "control chars", password: "\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001" },
    { label: "variation selectors", password: "\uFE0F\uFE0F\uFE0F\uFE0F\uFE0F\uFE0F\uFE0F\uFE0F" },
    { label: "combining marks", password: "\u0308\u0308\u0308\u0308\u0308\u0308\u0308\u0308" },
    { label: "mixed invisible chars", password: " \t\u00A0\u200B\n\r\uFEFF\u0002" },
  ] as const;

  // #321: sign-in is verification-only — an all-invisible input is the only
  // thing that can match a pre-#230 hash, so it must be allowed through the
  // wire gate (min/max length still apply, enforced below).
  it.each(blankPasswords)("accepts a $label sign-in password (legacy verification)", ({ password }) => {
    expect(() =>
      phonePasswordSignInSchema.parse({
        phone: "0612345678",
        password,
      }),
    ).not.toThrow();
  });

  // #230 intact for NEW inputs: bootstrap creates the credential, so the
  // visible-character refine must still reject every all-invisible class.
  it.each(blankPasswords)("rejects a $label bootstrap password (#230)", ({ password }) => {
    expect(() =>
      authBootstrapInputSchema.parse({
        name: "المدير الأول",
        phone: "0612345678",
        password,
      }),
    ).toThrow();
  });

  // Internal spaces are legitimate password characters (NIST 800-63B) — only
  // all-invisible values are rejected, never a space inside a real password.
  it("accepts a password with internal spaces", () => {
    expect(
      phonePasswordSignInSchema.parse({
        phone: "0612345678",
        password: "pass word 123",
      }).password,
    ).toBe("pass word 123");
  });

  // #230 must NOT normalize: a padded-but-visible password is accepted and
  // round-trips untrimmed in both schemas — the stored hash must be computed
  // over exactly what the user typed, or existing hashes would break.
  it("accepts a padded password untrimmed in both schemas", () => {
    const padded = " password123 ";
    expect(
      phonePasswordSignInSchema.parse({ phone: "0612345678", password: padded }).password,
    ).toBe(padded);
    expect(
      authBootstrapInputSchema.parse({
        name: "المدير الأول",
        phone: "0612345678",
        password: padded,
      }).password,
    ).toBe(padded);
  });

  // The visible-character rule must defer to .min(8) for ALL too-short values
  // (not just empty): a short+blank password (e.g. 6 spaces) yields a single
  // "too short" issue instead of doubled too_small + custom issues.
  it("reports only the too-short issue for a short blank sign-in password", () => {
    const result = phonePasswordSignInSchema.safeParse({
      phone: "0612345678",
      password: "      ",
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    const passwordIssues = result.error.issues.filter((issue) => issue.path[0] === "password");
    expect(passwordIssues).toHaveLength(1);
    expect(passwordIssues[0]?.code).toBe("too_small");
  });

  // Long-side analog of the length guard: an over-long blank password yields
  // a single too_big issue, not doubled too_big + custom issues.
  it("reports only the too-long issue for an over-long blank sign-in password", () => {
    const result = phonePasswordSignInSchema.safeParse({
      phone: "0612345678",
      password: " ".repeat(129),
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    const passwordIssues = result.error.issues.filter((issue) => issue.path[0] === "password");
    expect(passwordIssues).toHaveLength(1);
    expect(passwordIssues[0]?.code).toBe("too_big");
  });

  // #321: the strict bootstrap schema keeps the #230 length guard — a
  // short+blank (6 spaces) or over-long+blank (129 spaces) bootstrap
  // password yields a single length issue, not doubled length + custom.
  it("reports only the too-short issue for a short blank bootstrap password", () => {
    const result = authBootstrapInputSchema.safeParse({
      name: "المدير الأول",
      phone: "0612345678",
      password: "      ",
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    const passwordIssues = result.error.issues.filter((issue) => issue.path[0] === "password");
    expect(passwordIssues).toHaveLength(1);
    expect(passwordIssues[0]?.code).toBe("too_small");
  });

  it("reports only the too-long issue for an over-long blank bootstrap password", () => {
    const result = authBootstrapInputSchema.safeParse({
      name: "المدير الأول",
      phone: "0612345678",
      password: " ".repeat(129),
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    const passwordIssues = result.error.issues.filter((issue) => issue.path[0] === "password");
    expect(passwordIssues).toHaveLength(1);
    expect(passwordIssues[0]?.code).toBe("too_big");
  });

  // The Mn exclusion must only reject ALL-invisible strings — combining marks
  // alongside visible base characters are legitimate password characters, and
  // the app is Arabic-first so a tightening to ASCII-only must not pass CI.
  it("accepts passwords with combining marks or Arabic alongside visible bases", () => {
    const diacritics = "a\u0301b\u0301c\u0301d\u0301";
    expect(
      phonePasswordSignInSchema.parse({ phone: "0612345678", password: diacritics }).password,
    ).toBe(diacritics);
    expect(
      phonePasswordSignInSchema.parse({
        phone: "0612345678",
        password: "كلمةالمرور123",
      }).password,
    ).toBe("كلمةالمرور123");
  });

  // Pin the max-length acceptance boundary of the shared schema (128).
  it("accepts the max-length password in both schemas", () => {
    const long = "x".repeat(128);
    expect(
      phonePasswordSignInSchema.parse({ phone: "0612345678", password: long }).password,
    ).toBe(long);
    expect(
      authBootstrapInputSchema.parse({
        name: "المدير الأول",
        phone: "0612345678",
        password: long,
      }).password,
    ).toBe(long);
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

  it("rejects a bootstrap name made only of invisible format characters", () => {
    // #250/#234 hygiene: trim() keeps format chars (ZWSP), so the name
    // schema itself must reject an invisible-only display name.
    expect(() =>
      authBootstrapInputSchema.parse({
        name: "\u200B\u200B",
        phone: "0612345678",
        password: "password123",
      }),
    ).toThrow()
    expect(() =>
      authBootstrapInputSchema.parse({
        name: " \u200B ",
        phone: "0612345678",
        password: "password123",
      }),
    ).toThrow()
  })

  // #230: same blank-password rule as sign-in — bootstrap must not create the
  // first admin with a whitespace-only credential. Full shared class list (the
  // schema is the same passwordSchema, so the matrices must not drift).
  it.each(blankPasswords)("rejects a $label bootstrap password", ({ password }) => {
    expect(() =>
      authBootstrapInputSchema.parse({
        name: "المدير الأول",
        phone: "0612345678",
        password,
      }),
    ).toThrow()
  })

  it("accepts a bootstrap password with internal spaces", () => {
    expect(
      authBootstrapInputSchema.parse({
        name: "المدير الأول",
        phone: "0612345678",
        password: "pass word 123",
      }).password,
    ).toBe("pass word 123")
  })

  it("accepts a session user with phone identity and app version", () => {
    expect(
        sessionUserSchema.parse({
          id: "user-1",
          name: null,
          phone: "0612345678",
          version: "1.2.3",
        }),
      ).toEqual({
        id: "user-1",
        name: null,
        phone: "0612345678",
        version: "1.2.3",
    });
  });

  it("rejects session user without version", () => {
    expect(() =>
      sessionUserSchema.parse({
        id: "user-1",
        name: null,
        phone: "0612345678",
      }),
    ).toThrowError();
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

  describe("security and report filter inputs are exported for handler derivation (#206)", () => {
    it("trims and validates recovery key inputs from the package index", () => {
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a1b2-c3d4-e5f6" })).toEqual({
        key: "a1b2-c3d4-e5f6",
      });

      expect(revokeRecoveryKeyInputSchema.parse({ keyId: "key-1" })).toEqual({
        keyId: "key-1",
      });

      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "" })).toThrow();
      expect(() => revokeRecoveryKeyInputSchema.parse({ keyId: "" })).toThrow();

      // #221: copied keys with accidental leading/trailing whitespace are
      // trimmed before validation, so whitespace-only inputs are rejected.
      expect(consumeRecoveryKeyInputSchema.parse({ key: "  a1b2-c3d4-e5f6  " })).toEqual({
        key: "a1b2-c3d4-e5f6",
      });
      expect(revokeRecoveryKeyInputSchema.parse({ keyId: "  key-1  " })).toEqual({
        keyId: "key-1",
      });
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "   " })).toThrow();
      expect(() => revokeRecoveryKeyInputSchema.parse({ keyId: "   " })).toThrow();

      // Trim covers every JS whitespace class (tabs, NBSP, line separators,
      // BOM) — a key made only of those is empty after trimming and rejected.
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "\t\n" })).toThrow();
      expect(consumeRecoveryKeyInputSchema.parse({
        key: "\u00A0a1b2-c3d4-e5f6\u2028",
      })).toEqual({ key: "a1b2-c3d4-e5f6" });
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "\uFEFF\u00A0" })).toThrow();

      // Trim is leading/trailing only — internal whitespace (e.g. a key
      // wrapped across an email line) is preserved, not normalized.
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a1b2-c3d4\ne5f6" })).toEqual({
        key: "a1b2-c3d4\ne5f6",
      });

      // Missing required fields and non-string values are rejected.
      expect(() => consumeRecoveryKeyInputSchema.parse({})).toThrow();
      expect(() => revokeRecoveryKeyInputSchema.parse({})).toThrow();
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: 123 })).toThrow();
      expect(() => revokeRecoveryKeyInputSchema.parse({ keyId: null })).toThrow();
    });

    it("rejects recovery keys containing invisible format characters (#234)", () => {
      // #234: trim() keeps Cf (format) chars — a ZWSP-only key passes min(1).
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "\u200B" })).toThrow();
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "\u200B\u200B\u200B" })).toThrow();
      expect(() => revokeRecoveryKeyInputSchema.parse({ keyId: "\u200B\u200B" })).toThrow();

      // Cf chars embedded inside an otherwise-valid key are rejected too —
      // these are exact-match secrets, so there is no "visible enough"
      // (stricter than the auth.ts name rule, which only rejects
      // all-invisible strings). Category members beyond ZWSP: LRM (U+200E),
      // RLM (U+200F), ZWNJ (U+200C), ZWJ (U+200D).
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a1b2\u200Bc3d4" })).toThrow();
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a1b2\u200Ec3d4" })).toThrow();
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a1b2\u200Fc3d4" })).toThrow();
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a1b2\u200Cc3d4" })).toThrow();
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a1b2\u200Dc3d4" })).toThrow();

      // Surrounding whitespace is trimmed first; the embedded Cf survives
      // trim and is still rejected.
      expect(() =>
        consumeRecoveryKeyInputSchema.parse({ key: "  a1b2\u200Bc3d4  " }),
      ).toThrow();

      // A ZWSP-only key wrapped in whitespace is still rejected after trim
      // (trim keeps the ZWSP — it is not WhiteSpace).
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: " \u200B " })).toThrow();

      // Leading/trailing Cf on an otherwise-valid key is rejected too.
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "\u200Ba1b2-c3d4" })).toThrow();
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a1b2-c3d4\u200B" })).toThrow();

      // Mid-string U+FEFF: FEFF IS ECMAScript WhiteSpace, so trim only strips
      // it at the edges — an embedded one survives trim and is caught by the
      // Cf check (comment claim pinned).
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a\uFEFFb" })).toThrow();

      // Valid keys are unaffected (regression).
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a1b2-c3d4-e5f6" })).toEqual({
        key: "a1b2-c3d4-e5f6",
      });
      expect(revokeRecoveryKeyInputSchema.parse({ keyId: "key-1" })).toEqual({ keyId: "key-1" });
    });

    it("rejects DB key change inputs containing invisible format characters (#234)", () => {
      // The exact issue case: 8 ZWSP passes min(8) and would become the
      // PRAGMA rekey value.
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u200B".repeat(8) }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "\u200B", newKey: "new-key-123" }),
      ).toThrow();

      // Embedded Cf in either field is rejected (exact-match secret semantics).
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old\u200Bkey", newKey: "new-key-123" }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "new\u200Bkey-123" }),
      ).toThrow();

      // The Cf-as-sole-extra-char boundary: 7 visible + 1 ZWSP = length 8
      // reaches the refine (custom issue), while 6 + 1 = 7 defers to
      // too_small (pinned in the next test).
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "abcde12\u200B" }),
      ).toThrow();

      // Astral-plane Cf (surrogate pairs, each 2 UTF-16 units): 4x U+1BCA0
      // = length 8 and 4x tag chars U+E0020-E007F = length 8 both reach the
      // refine, so the length guard cannot be gamed with non-BMP codepoints.
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u{1BCA0}".repeat(4) }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({
          currentKey: "old-key",
          newKey: "\u{E0020}\u{E0021}\u{E0022}\u{E0023}",
        }),
      ).toThrow();

      // Valid values are unaffected (regression).
      expect(
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "new-key-123" }),
      ).toEqual({ currentKey: "old-key", newKey: "new-key-123" });
    });

    it("reports only the too-short issue for a too-short invisible newKey (#234)", () => {
      // 3 ZWSP < min(8): the Cf refine must defer to .min(8) — a single
      // too_small issue, not doubled too_small + custom issues.
      const result = changeDbKeyInputSchema.safeParse({
        currentKey: "old-key",
        newKey: "\u200B\u200B\u200B",
      });
      expect(result.success).toBe(false);
      if (result.success) throw new Error("unreachable");
      const newKeyIssues = result.error.issues.filter((issue) => issue.path[0] === "newKey");
      expect(newKeyIssues).toHaveLength(1);
      expect(newKeyIssues[0]?.code).toBe("too_small");

      // Same deferral with a visible+Cf mix below the boundary (6 + 1 = 7).
      const mixed = changeDbKeyInputSchema.safeParse({
        currentKey: "old-key",
        newKey: "abcde1\u200B",
      });
      expect(mixed.success).toBe(false);
      if (mixed.success) throw new Error("unreachable");
      expect(mixed.error.issues.filter((issue) => issue.path[0] === "newKey")).toHaveLength(1);
    });

    it("surfaces a user-facing message naming the invisible characters (#234)", () => {
      // The issue asks for an error message telling the user the key contains
      // invisible characters; the schema errors surface verbatim in the UI
      // toast, so the message text is contract surface, not internal detail.
      const result = consumeRecoveryKeyInputSchema.safeParse({ key: "\u200B" });
      expect(result.success).toBe(false);
      if (result.success) throw new Error("unreachable");
      const keyIssue = result.error.issues.find((issue) => issue.path[0] === "key");
      expect(keyIssue?.code).toBe("custom");
      expect(keyIssue?.message).toMatch(/invisible format characters/);
    });

    it("accepts non-Cf invisible characters (documented residual class #334)", () => {
      // #234 scopes the rejection to \p{Cf}. Invisible codepoints OUTSIDE Cf
      // — U+2800 braille blank (So), combining marks (Mn), controls (Cc),
      // mid-string NBSP (Zs) — still pass by design. This pins the current
      // boundary so a future widening (issue #334) is a deliberate change.
      expect(
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u2800".repeat(8) }),
      ).toEqual({ currentKey: "old-key", newKey: "\u2800".repeat(8) });
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a\u2800b" })).toEqual({
        key: "a\u2800b",
      });
    });

    it("validates the database encryption key change input", () => {
      expect(
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "new-key-123" }),
      ).toEqual({ currentKey: "old-key", newKey: "new-key-123" });

      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "", newKey: "new-key-123" }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "short" }),
      ).toThrow();

      // #221: both key fields are trimmed — copied keys with trailing
      // whitespace normalize, and whitespace-only values cannot become a
      // PRAGMA key / rekey value.
      expect(
        changeDbKeyInputSchema.parse({
          currentKey: "  old-key  ",
          newKey: "  new-key-123  ",
        }),
      ).toEqual({ currentKey: "old-key", newKey: "new-key-123" });
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "   ", newKey: "new-key-123" }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "        " }),
      ).toThrow();
      // Tab padding is trimmed too: 8 chars after trim pass, 7 fail.
      expect(
        changeDbKeyInputSchema.parse({ currentKey: "old", newKey: "\t12345678" }),
      ).toEqual({ currentKey: "old", newKey: "12345678" });
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "\t", newKey: "12345678" }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old", newKey: "1234567\t" }),
      ).toThrow();

      // Pin the newKey min(8) boundary on the TRIMMED value: 8 after trim
      // passes, 7 fails.
      expect(
        changeDbKeyInputSchema.parse({ currentKey: "old", newKey: " 12345678 " }),
      ).toEqual({ currentKey: "old", newKey: "12345678" });
      expect(
        changeDbKeyInputSchema.parse({ currentKey: "old", newKey: "12345678" }),
      ).toEqual({ currentKey: "old", newKey: "12345678" });
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old", newKey: "  1234567  " }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old", newKey: "1234567" }),
      ).toThrow();

      // Missing required fields and non-string values are rejected.
      expect(() => changeDbKeyInputSchema.parse({ currentKey: "old" })).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old", newKey: 12345678 }),
      ).toThrow();
    });

    it("discriminates changeDbKey output: success carries no error, failure requires one", () => {
      // The two valid pairs the handler can emit.
      expect(changeDbKeyOutputSchema.parse({ success: true })).toEqual({ success: true });
      expect(
        changeDbKeyOutputSchema.parse({ success: false, error: "Current encryption key is invalid" }),
      ).toEqual({ success: false, error: "Current encryption key is invalid" });

      // #221: logically invalid combinations are rejected — a failure without
      // an error message, and a success that carries an error.
      expect(() => changeDbKeyOutputSchema.parse({ success: false })).toThrow();
      expect(() => changeDbKeyOutputSchema.parse({ success: true, error: "boom" })).toThrow();
      expect(() => changeDbKeyOutputSchema.parse({ success: "maybe" })).toThrow();
      // A failure must carry a non-empty, non-blank error message.
      expect(() => changeDbKeyOutputSchema.parse({ success: false, error: "" })).toThrow();
      expect(() => changeDbKeyOutputSchema.parse({ success: false, error: "   " })).toThrow();
      // Strict members reject unknown keys on either branch.
      expect(() => changeDbKeyOutputSchema.parse({ success: true, extra: "x" })).toThrow();
      expect(() =>
        changeDbKeyOutputSchema.parse({ success: false, error: "e", extra: 1 }),
      ).toThrow();
    });

    it("validates the report filter input (type + ISO date range)", () => {
      expect(reportFilterInputSchema.parse({ type: "INVENTORY" })).toEqual({
        type: "INVENTORY",
      });

      expect(
        reportFilterInputSchema.parse({
          type: "DEBT",
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-01-31T23:59:59.000Z",
        }),
      ).toEqual({
        type: "DEBT",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-31T23:59:59.000Z",
      });

      expect(() => reportFilterInputSchema.parse({ type: "BOGUS" })).toThrow();
      expect(() =>
        reportFilterInputSchema.parse({ type: "INVENTORY", startDate: "not-a-date" }),
      ).toThrow();

      // Pin the datetime({ offset: true }) semantics: naive datetimes are
      // rejected, explicit non-UTC offsets are accepted.
      expect(() =>
        reportFilterInputSchema.parse({ type: "INVENTORY", startDate: "2026-01-01T00:00:00" }),
      ).toThrow();
      expect(
        reportFilterInputSchema.parse({
          type: "INVENTORY",
          startDate: "2026-01-01T00:00:00+01:00",
        }),
      ).toEqual({ type: "INVENTORY", startDate: "2026-01-01T00:00:00+01:00" });

      // Missing required fields and non-string enum values are rejected.
      expect(() => reportFilterInputSchema.parse({})).toThrow();
      expect(() => reportFilterInputSchema.parse({ type: null })).toThrow();
    });
  });

  describe("payment amount + limit schemas (#289 shared primitives)", () => {
    it("paymentAmountSchema rejects non-positive, non-finite, and unsafe-integer amounts", () => {
      for (const bad of [0, -1, -0, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 2 ** 53]) {
        expect(paymentAmountSchema.safeParse(bad).success).toBe(false);
      }
      for (const good of [1, 0.5, Number.MAX_SAFE_INTEGER]) {
        expect(paymentAmountSchema.safeParse(good).success).toBe(true);
      }
    });

    it("paymentListLimitSchema requires an integer between 1 and 100", () => {
      // Fractional limits (2.5) are rejected: sqlite LIMIT ? throws a datatype
      // mismatch on fractional bounds — a wire-reachable 500 without .int().
      for (const bad of [0, -1, 101, 2.5, 99.9, NaN, Infinity]) {
        expect(paymentListLimitSchema.safeParse(bad).success).toBe(false);
      }
      for (const good of [1, 50, 100]) {
        expect(paymentListLimitSchema.safeParse(good).success).toBe(true);
      }
    });

    it("paymentListInputSchema defaults the limit to 50 and still enforces the shared limit schema", () => {
      expect(paymentListInputSchema.parse({}).limit).toBe(50);
      expect(paymentListInputSchema.safeParse({ limit: 2.5 }).success).toBe(false);
    });
  });

  describe("recurring patterns contract surface", () => {
    // #239: the recurring-patterns procedures were advertised in the client
    // contract with no server handlers; the router hid the gap with `as any`.
    // Resolved by deleting the procedures until the feature lands. This test
    // pins the contract truth: if the spread is re-added without handlers,
    // this fails at the contract level instead of at runtime.
    it("does not advertise recurring procedures until server handlers exist", () => {
      expect("recurringPatternsList" in appContract).toBe(false);
      expect("recurringPatternsGet" in appContract).toBe(false);
    });

    it("keeps the recurring pattern domain schema exported for the future feature", () => {
      const input = {
        id: "pat-1",
        name: "Monthly rent",
        description: null,
        frequency: "MONTHLY",
        amountType: "FIXED",
        fixedAmountDzd: 50000,
        partyId: "party-1",
        isActive: true,
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: null,
        nextOccurrenceDate: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      } as const;

      // Pins the schema's `requiresApproval: z.boolean().default(true)` — the
      // input omits it, the parsed output carries it.
      expect(recurringPatternSchema.parse(input)).toEqual({
        ...input,
        requiresApproval: true,
      });

      // The schema survives as a validator, not just a shape: invalid data
      // is still rejected (would catch a future regression making it permissive).
      expect(() =>
        recurringPatternSchema.parse({ ...input, frequency: "YEARLY" }),
      ).toThrow();
    });
  });
});
