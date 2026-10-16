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
  getLockedDirectionForCategory,
  debtSummaryItemSchema,
  debtsSummarySchema,
  directDebtEntryCreateInputSchema,
  externalCounterpartyCreateInputSchema,
  externalCounterpartySchema,
  employeeBatchCreateInputSchema,
  employeeBatchCreateRowInputSchema,
  employeeBatchLimit,
  employeeCreateInputSchema,
  employeeDebtEntryCreateInputSchema,
  employeeProjectAssignmentSchema,
  employeeSalaryPaymentCreateInputSchema,
  employeeUpdateInputSchema,
  employeeWarehouseAssignmentSchema,
  employeeSchema,
  invoiceCreateInputSchema,
  invoiceDirectionSchema,
  invoiceMarkPaidInputSchema,
  invoiceSchema,
  inventoryAssetChargeDefaultSchema,
  inventoryAssetChargeRevisionSchema,
  inventoryAssetChargeSchema,
  inventoryAssetDetailSchema,
  inventoryAssetTransferInputSchema,
  inventoryAssetUnitCreateInputSchema,
  inventoryAssetUnitSchema,
  inventoryContract,
  inventoryInvoiceGroupCreateInputSchema,
  inventoryInvoiceGroupDetailSchema,
  inventoryInvoiceGroupSchema,
  inventoryConsumableEntryCreateInputSchema,
  inventoryLocationContentsSchema,
  inventoryProjectChargesSchema,
  managerAssignmentCreateInputSchema,
  phonePasswordSignInSchema,
  projectAssignmentCreateInputSchema,
  projectSchema,
  projectCostInputSchema,
  projectCostSchema,
  projectCostExpenseRowSchema,
  projectCostMaterialMovementSchema,
  projectCostPartsSchema,
  recurringPatternSchema,
  reportFilterInputSchema,
  paymentAmountSchema,
  roundMoney,
  paymentListLimitSchema,
  paymentListInputSchema,
  nonNegativePaymentAmountSchema,
  revokeRecoveryKeyInputSchema,
  storedMoneyDzdSchema,
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
        occupation: null,
        createdAt: "2026-03-13T10:00:00.000Z",
        updatedAt: "2026-03-13T10:00:00.000Z",
      }).phone,
    ).toBe("0612345678");
  });

  it("accepts an optional occupation on employee create and caps its length", () => {
    const parsed = employeeCreateInputSchema.parse({
      firstName: "Amara",
      lastName: "Necib",
      phone: "0612345678",
      roleId: "role-worker",
      occupation: "  عامل بناء  ",
    });
    expect(parsed.occupation).toBe("عامل بناء");

    expect(() =>
      employeeCreateInputSchema.parse({
        firstName: "Amara",
        lastName: "Necib",
        phone: "0612345678",
        roleId: "role-worker",
        occupation: "م".repeat(121),
      }),
    ).toThrowError();

    expect(
      employeeCreateInputSchema.parse({
        firstName: "Amara",
        lastName: "Necib",
        phone: "0612345678",
        roleId: "role-worker",
      }).occupation,
    ).toBeUndefined();
  });

  it("accepts occupation on update, batch rows, null, and whitespace-only values", () => {
    expect(
      employeeUpdateInputSchema.parse({
        id: "employee-1",
        occupation: "نقاش",
      }).occupation,
    ).toBe("نقاش");

    const batchRow = employeeBatchCreateRowInputSchema.parse({
      firstName: "Amara",
      lastName: "Necib",
      phone: "0612345678",
      roleId: "role-worker",
      occupation: "سائق",
    });
    expect(batchRow.occupation).toBe("سائق");

    expect(
      employeeUpdateInputSchema.parse({ id: "employee-1", occupation: null }).occupation,
    ).toBeNull();

    // Whitespace-only trims to "" (the API converts empty to null via
    // normalizeText before persistence).
    expect(
      employeeCreateInputSchema.parse({
        firstName: "Amara",
        lastName: "Necib",
        phone: "0612345678",
        roleId: "role-worker",
        occupation: "   ",
      }).occupation,
    ).toBe("");
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
        direction: "PAYABLE",
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
        direction: "PAYABLE",
      }),
    ).toThrowError()
  })

  it("requires a direction on createDebtAccount (no silent PAYABLE default)", () => {
    expect(() =>
      debtAccountCreateInputSchema.parse({
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        openingBalanceDzd: 500,
      }),
    ).toThrowError()

    // The direction is required even when a category locks it: the caller
    // must still state the ledger it means.
    expect(() =>
      debtAccountCreateInputSchema.parse({
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        openingBalanceDzd: 500,
        reasonCategory: "SALARY_ADVANCE",
      }),
    ).toThrowError()

    expect(
      debtAccountCreateInputSchema.parse({
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        direction: "RECEIVABLE",
        openingBalanceDzd: 500,
      }).direction,
    ).toBe("RECEIVABLE")
  })

  it("rejects a negative opening balance (the direction carries the sign)", () => {
    expect(() =>
      debtAccountCreateInputSchema.parse({
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        direction: "RECEIVABLE",
        openingBalanceDzd: -500,
      }),
    ).toThrowError()

    // Zero is not a positive opening; omit the field to open an empty account.
    expect(() =>
      debtAccountCreateInputSchema.parse({
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        direction: "RECEIVABLE",
        openingBalanceDzd: 0,
      }),
    ).toThrowError()

    // A positive opening, or no opening at all, is accepted.
    expect(
      debtAccountCreateInputSchema.parse({
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        direction: "RECEIVABLE",
        openingBalanceDzd: 500,
      }).openingBalanceDzd,
    ).toBe(500)
    expect(
      debtAccountCreateInputSchema.parse({
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        direction: "RECEIVABLE",
      }).openingBalanceDzd,
    ).toBeUndefined()
  })

  it("rejects a debt account whose direction contradicts its reason category (D2)", () => {
    expect(() =>
      debtAccountCreateInputSchema.parse({
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        direction: "PAYABLE",
        reasonCategory: "SALARY_ADVANCE",
      }),
    ).toThrowError()

    // A matching direction is accepted; the category locks it.
    expect(
      debtAccountCreateInputSchema.parse({
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        direction: "RECEIVABLE",
        reasonCategory: "SALARY_ADVANCE",
      }).direction,
    ).toBe("RECEIVABLE")

    // An explicit direction with no reason category is accepted (the debt
    // cases panel shape); the lock only applies when a category is present.
    expect(
      debtAccountCreateInputSchema.parse({
        partyType: "INTERNAL_WORKER",
        workerId: "worker-1",
        direction: "PAYABLE",
      }).direction,
    ).toBe("PAYABLE")
  })

  it("rejects an employee debt entry whose direction contradicts its reason category (D2)", () => {
    expect(() =>
      employeeDebtEntryCreateInputSchema.parse({
        employeeId: "worker-1",
        entryType: "OPENING",
        amountDzd: 500,
        direction: "PAYABLE",
        reasonCategory: "SALARY_ADVANCE",
      }),
    ).toThrowError()
  })

  it("rejects an employee ADVANCE sent as PAYABLE (D1a)", () => {
    expect(() =>
      employeeDebtEntryCreateInputSchema.parse({
        employeeId: "worker-1",
        entryType: "ADVANCE",
        amountDzd: 500,
        direction: "PAYABLE",
      }),
    ).toThrowError()

    expect(
      employeeDebtEntryCreateInputSchema.parse({
        employeeId: "worker-1",
        entryType: "ADVANCE",
        amountDzd: 500,
        direction: "RECEIVABLE",
      }).direction,
    ).toBe("RECEIVABLE")
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
        balanceLabel: "مستحق لنا",
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
        balanceLabel: "مستحق لنا",
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
            balanceLabel: "مستحق لنا",
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
    // SALARY_ADVANCE is RECEIVABLE: paying a worker ahead of earned work makes
    // the worker the debtor (owner decision D1a).
    expect(debtReasonCategoryDirectionMap.SALARY_ADVANCE).toBe("RECEIVABLE");
    // REIMBURSEMENT and DIRECT_LOAN_TAKEN stay PAYABLE.
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

    // getLockedDirectionForCategory returns null for unconstrained categories
    expect(getLockedDirectionForCategory("OTHER")).toBeNull();
    expect(getLockedDirectionForCategory("SALARY_ADVANCE")).toBe("RECEIVABLE");
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

      // Embedded Cf in the NEW key is rejected (exact-match secret semantics).
      // currentKey is exempt on purpose — see the legacy-currentKey test below.
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

    it("accepts a legacy currentKey containing blank/invisible characters so it stays rotatable (#334)", () => {
      // Greptile P2 on the widened rule: a key created BEFORE #334 may contain
      // an internal space, NBSP, or combining mark. The database still opens
      // with it (startup enforces only the new-key length; the service only
      // requires non-empty and then PROVES the key by re-opening the DB), so a
      // wire-level rejection here would leave those users unable to rotate.
      const legacyCurrentKeys = [
        "old key 2020", // internal space (issue case 4 class)
        "old\u00A0key", // NBSP
        "old\u0301key", // combining acute
        "old\u200Bkey", // ZWSP
        "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800", // braille blanks
        "old\u0001key", // invisible control
      ];
      for (const currentKey of legacyCurrentKeys) {
        expect(changeDbKeyInputSchema.parse({ currentKey, newKey: "new-key-123" })).toEqual({
          currentKey,
          newKey: "new-key-123",
        });
      }

      // The exemption is for currentKey only — a newKey of the same shape is
      // still rejected, and currentKey still cannot be empty/whitespace-only.
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old key 2020", newKey: "new key 2020" }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "   ", newKey: "new-key-123" }),
      ).toThrow();
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

    it("surfaces a user-facing message naming the invisible characters (#234/#334)", () => {
      // The issue asks for an error message telling the user the key contains
      // invisible characters; the schema errors surface verbatim in the UI
      // toast, so the message text is contract surface, not internal detail.
      const result = consumeRecoveryKeyInputSchema.safeParse({ key: "\u200B" });
      expect(result.success).toBe(false);
      if (result.success) throw new Error("unreachable");
      const keyIssue = result.error.issues.find((issue) => issue.path[0] === "key");
      expect(keyIssue?.code).toBe("custom");
      expect(keyIssue?.message).toMatch(/invisible characters/);
    });

    it("rejects braille blank, combining marks, and invisible control chars (#334)", () => {
      // #334: #234 rejected Cf only — invisible codepoints OUTSIDE Cf still
      // passed. Braille blank (U+2800, So) renders as a blank cell: 8 of them
      // pass min(8) and would become the PRAGMA rekey value (the issue's
      // headline case).
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u2800".repeat(8) }),
      ).toThrow();
      // Embedded braille blank is rejected too (blank cell inside the key).
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a\u2800b" })).toThrow();

      // Combining marks (Mn) — invisible standalone AND embedded: a key that
      // LOOKS like "abcdef" but never matches (the exact-match hazard).
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u0301".repeat(8) }),
      ).toThrow();
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a\u0301b" })).toThrow();

      // Control chars (Cc, U+0000-U+001F) — min() counts them but they render
      // nothing. DEL (U+007F) and the C1 range are invisible controls too.
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u0000".repeat(8) }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u0001".repeat(8) }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u001F".repeat(8) }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u007F".repeat(8) }),
      ).toThrow();
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a\u0001b" })).toThrow();

      // Zs separators (issue case 4): a mid-string NBSP survives trim() (it is
      // edge-only) and renders indistinguishable from a regular space in a
      // monospace key field — rejected anywhere. Plain spaces too.
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "a1b2\u00A0c3d4e5f6" }),
      ).toThrow();
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a1b2 c3d4" })).toThrow();

      // Blank-rendering Lo letters: Hangul fillers are the enumerable blank
      // cells outside the issue's named classes — same hazard as U+2800, and
      // U+3164 is a known obfuscation vector. All four fillers are pinned so
      // a silent regex typo cannot drop one.
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u3164".repeat(8) }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u115F".repeat(8) }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u1160".repeat(8) }),
      ).toThrow();
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a\uFFA0b" })).toThrow();

      // Carve-out boundaries: U+0008 (BS) is the last rejected C0 below the
      // tab/LF/VT/FF/CR carve-out; U+000E (SO) is the first rejected C0 above
      // it; the C1 range U+0080-U+009F is rejected at the far end.
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u0008".repeat(8) }),
      ).toThrow();
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a\u000Eb" })).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u0080".repeat(8) }),
      ).toThrow();
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u009F".repeat(8) }),
      ).toThrow();

      // More Zs members than the pinned space/NBSP (ideographic space).
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "a\u3000b" })).toThrow();

      // Astral-plane Mn (surrogate pairs): 4x U+1D167 = UTF-16 length 8,
      // reaching the refine — the same length-guard gaming surface #234
      // pinned for astral Cf.
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "\u{1D167}".repeat(4) }),
      ).toThrow();

      // Same gates on the other key fields (defense in depth, #234 precedent).
      expect(() => consumeRecoveryKeyInputSchema.parse({ key: "\u2800\u2800" })).toThrow();
      expect(() => revokeRecoveryKeyInputSchema.parse({ keyId: "\u0301\u0301" })).toThrow();
      // ...EXCEPT currentKey, which must accept whatever a pre-rule database is
      // encrypted with so the owner can still rotate it (dedicated test below);
      // the new key keeps the strict rule.
      expect(
        changeDbKeyInputSchema.parse({ currentKey: "\u0001", newKey: "new-key-123" }),
      ).toEqual({ currentKey: "\u0001", newKey: "new-key-123" });

      // Valid keys are unaffected (regression).
      expect(
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "new-key-123" }),
      ).toEqual({ currentKey: "old-key", newKey: "new-key-123" });
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a1b2-c3d4-e5f6" })).toEqual({
        key: "a1b2-c3d4-e5f6",
      });
    });

    it("preserves visible formatting whitespace in keys (#221 pin + #334 carve-out)", () => {
      // #334 rejects Cc controls EXCEPT tab/LF/VT/FF/CR — the ECMAScript
      // whitespace subset, which renders as visible formatting. The #221 pin
      // (a recovery key wrapped across an email line) deliberately accepts an
      // internal newline; the carve-out keeps that green.
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a1b2-c3d4\ne5f6" })).toEqual({
        key: "a1b2-c3d4\ne5f6",
      });
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a1b2\tc3d4" })).toEqual({
        key: "a1b2\tc3d4",
      });
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a1b2\rc3d4" })).toEqual({
        key: "a1b2\rc3d4",
      });
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a1b2\r\nc3d4" })).toEqual({
        key: "a1b2\r\nc3d4",
      });

      // Zl/Zp line/paragraph separators render as visible line breaks —
      // consistent with the LF carve-out (documented residual).
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a1b2\u2028c3d4" })).toEqual({
        key: "a1b2\u2028c3d4",
      });
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a1b2\u2029c3d4" })).toEqual({
        key: "a1b2\u2029c3d4",
      });

      // The full carve-out range: VT (U+000B) and FF (U+000C) are accepted
      // like tab/LF/CR — pinning all five members so a carve-out narrowing
      // trips a test.
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a1b2\u000Bc3d4" })).toEqual({
        key: "a1b2\u000Bc3d4",
      });
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a1b2\u000Cc3d4" })).toEqual({
        key: "a1b2\u000Cc3d4",
      });

      // Edge whitespace is still trimmed first — the #221 test with NBSP +
      // line-separator padding around a valid key normalizes to the key.
      expect(consumeRecoveryKeyInputSchema.parse({
        key: "\u00A0a1b2-c3d4-e5f6\u2028",
      })).toEqual({ key: "a1b2-c3d4-e5f6" });

      // No over-reach: visible So symbols (©) and Lo letters (CJK) pass —
      // only U+2800 braille blank and the blank Hangul fillers are rejected,
      // not the whole So/Lo classes. Visible spacing marks (Mc, e.g. U+0903)
      // also pass — the Mn rejection must never broaden to \p{M}.
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a\u00A9b" })).toEqual({
        key: "a\u00A9b",
      });
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a\u4E2Db" })).toEqual({
        key: "a\u4E2Db",
      });
      expect(consumeRecoveryKeyInputSchema.parse({ key: "a\u0903b" })).toEqual({
        key: "a\u0903b",
      });
    });

    it("defers to min() for too-short values of the widened classes (#334)", () => {
      // The length guard must defer to .min(8) for the NEW classes too: a
      // 7-visible + 1-rejected key (len 8) reaches the refine, while
      // 6 + 1 = 7 yields a single too_small issue (the #234 pattern).
      expect(() =>
        changeDbKeyInputSchema.parse({ currentKey: "old-key", newKey: "abcde12\u2800" }),
      ).toThrow();
      const result = changeDbKeyInputSchema.safeParse({
        currentKey: "old-key",
        newKey: "abcde1\u2800",
      });
      expect(result.success).toBe(false);
      if (result.success) throw new Error("unreachable");
      const newKeyIssues = result.error.issues.filter((issue) => issue.path[0] === "newKey");
      expect(newKeyIssues).toHaveLength(1);
      expect(newKeyIssues[0]?.code).toBe("too_small");

      // Same deferral for Mn (3 combining marks < min(8)).
      const mnResult = changeDbKeyInputSchema.safeParse({
        currentKey: "old-key",
        newKey: "\u0301\u0301\u0301",
      });
      expect(mnResult.success).toBe(false);
      if (mnResult.success) throw new Error("unreachable");
      expect(
        mnResult.error.issues.filter((issue) => issue.path[0] === "newKey"),
      ).toHaveLength(1);
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
        changeDbKeyOutputSchema.parse({
          success: false,
          error: "Current encryption key is invalid",
          rekeyed: false,
        }),
      ).toEqual({
        success: false,
        error: "Current encryption key is invalid",
        rekeyed: false,
      });
      expect(
        changeDbKeyOutputSchema.parse({
          success: false,
          error: "Failed to persist database encryption key",
          rekeyed: true,
        }),
      ).toEqual({
        success: false,
        error: "Failed to persist database encryption key",
        rekeyed: true,
      });
      // The AMBIGUOUS member (Greptile P1): the rekey ran but the post-rekey
      // verification could not complete — rekeyed: false PLUS ambiguous: true
      // so the caller keeps the new key, keeps the rollback slot, and does
      // NOT restore the old key.
      expect(
        changeDbKeyOutputSchema.parse({
          success: false,
          error: "Database re-encryption could not be verified",
          rekeyed: false,
          ambiguous: true,
        }),
      ).toEqual({
        success: false,
        error: "Database re-encryption could not be verified",
        rekeyed: false,
        ambiguous: true,
      });

      // #221: logically invalid combinations are rejected — a failure without
      // an error message, and a success that carries an error.
      expect(() => changeDbKeyOutputSchema.parse({ success: false })).toThrow();
      expect(() => changeDbKeyOutputSchema.parse({ success: true, error: "boom" })).toThrow();
      expect(() => changeDbKeyOutputSchema.parse({ success: "maybe" })).toThrow();
      // A failure must carry a non-empty, non-blank error message.
      expect(() => changeDbKeyOutputSchema.parse({ success: false, error: "" })).toThrow();
      expect(() => changeDbKeyOutputSchema.parse({ success: false, error: "   " })).toThrow();
      // …and must declare whether the database was re-encrypted (#265).
      expect(() =>
        changeDbKeyOutputSchema.parse({ success: false, error: "boom" }),
      ).toThrow();
      // A verified rekey is never ambiguous — ambiguous: true only marks a
      // verification that COULD NOT complete (Greptile P1).
      expect(() =>
        changeDbKeyOutputSchema.parse({
          success: false,
          error: "boom",
          rekeyed: true,
          ambiguous: true,
        }),
      ).toThrow();
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

    it("roundMoney snaps float noise to cents and leaves cent-less magnitudes unchanged", () => {
      expect(roundMoney(0.1 + 0.2)).toBe(0.3);
      expect(roundMoney(1.006)).toBe(1.01);
      expect(roundMoney(1.004)).toBe(1);
      // Past MAX_MONEY_DZD / 100 the multiply overflows integer precision, so
      // the value is returned unchanged rather than corrupted (the old helper
      // returned MAX - 2 for an input of MAX - 1).
      expect(roundMoney(Number.MAX_SAFE_INTEGER - 1)).toBe(Number.MAX_SAFE_INTEGER - 1);
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
  describe("inventory stock charge contracts (#413)", () => {
    const charge = {
      id: "charge-1",
      assetUnitId: "asset-1",
      projectId: "project-a",
      projectName: "مشروع أ",
      movementId: "movement-1",
      amountDzd: 100_000,
      status: "LIVE" as const,
      voidedAt: null,
      voidReason: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };

    it("nonNegativePaymentAmountSchema allows zero but shares the paymentAmountSchema magnitude bound", () => {
      for (const bad of [-1, -0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 2 ** 53]) {
        expect(nonNegativePaymentAmountSchema.safeParse(bad).success).toBe(false);
      }
      for (const good of [0, 0.5, 1, Number.MAX_SAFE_INTEGER]) {
        expect(nonNegativePaymentAmountSchema.safeParse(good).success).toBe(true);
      }
      // One money rule: the two schemas agree on the magnitude boundary.
      expect(nonNegativePaymentAmountSchema.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(
        paymentAmountSchema.safeParse(Number.MAX_SAFE_INTEGER).success,
      );
    });

    it("storedMoneyDzdSchema is a permissive read boundary: it represents an above-bound row, not an invalid one", () => {
      // The read shape spans the DDL's real domain (`>= 0`), so a legacy row
      // above MAX_MONEY_DZD must parse; non-finite and negative values must not.
      expect(storedMoneyDzdSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(true);
      expect(storedMoneyDzdSchema.safeParse(0).success).toBe(true);
      for (const bad of [-1, -0.5, NaN, Infinity, -Infinity]) {
        expect(storedMoneyDzdSchema.safeParse(bad).success).toBe(false);
      }
    });

    it("the transfer input accepts an omitted/null/zero charge and rejects a negative one", () => {
      const base = { assetUnitId: "asset-1", toProjectId: "project-a" };
      expect(inventoryAssetTransferInputSchema.safeParse(base).success).toBe(true);
      expect(inventoryAssetTransferInputSchema.safeParse({ ...base, chargeAmountDzd: null }).success).toBe(true);
      expect(inventoryAssetTransferInputSchema.safeParse({ ...base, chargeAmountDzd: 0 }).success).toBe(true);
      expect(inventoryAssetTransferInputSchema.safeParse({ ...base, chargeAmountDzd: 80_000 }).success).toBe(true);
      expect(inventoryAssetTransferInputSchema.safeParse({ ...base, chargeAmountDzd: -1 }).success).toBe(false);
    });

    it("the charge schema requires a project and a LIVE/VOID status", () => {
      expect(inventoryAssetChargeSchema.safeParse(charge).success).toBe(true);
      expect(inventoryAssetChargeSchema.safeParse({ ...charge, status: "ARCHIVED" }).success).toBe(false);
      expect(inventoryAssetChargeSchema.safeParse({ ...charge, amountDzd: -1 }).success).toBe(false);
      expect(inventoryAssetChargeSchema.safeParse({ ...charge, projectId: undefined }).success).toBe(false);
    });

    it("the revision schema records from → to (null on a void)", () => {
      const revision = {
        id: "rev-1",
        chargeId: "charge-1",
        previousAmountDzd: 100_000,
        newAmountDzd: 75_000,
        reason: "خصم",
        actorUserId: "user-1",
        actorLabel: "مدير",
        createdAt: "2026-06-01T00:00:00.000Z",
      };
      expect(inventoryAssetChargeRevisionSchema.safeParse(revision).success).toBe(true);
      expect(inventoryAssetChargeRevisionSchema.safeParse({ ...revision, newAmountDzd: null }).success).toBe(true);
      expect(inventoryAssetChargeRevisionSchema.safeParse({ ...revision, previousAmountDzd: -1 }).success).toBe(false);
    });

    it("the default schema carries the resolved amount, purchase price and source", () => {
      expect(
        inventoryAssetChargeDefaultSchema.safeParse({
          assetUnitId: "asset-1",
          amountDzd: 100_000,
          purchasePriceDzd: 100_000,
          source: "PURCHASE_PRICE",
        }).success,
      ).toBe(true);
      expect(
        inventoryAssetChargeDefaultSchema.safeParse({
          assetUnitId: "asset-1",
          amountDzd: 80_000,
          purchasePriceDzd: 100_000,
          source: "LAST_CHARGE",
        }).success,
      ).toBe(true);
      expect(
        inventoryAssetChargeDefaultSchema.safeParse({
          assetUnitId: "asset-1",
          amountDzd: 1,
          purchasePriceDzd: 1,
          source: "GUESS",
        }).success,
      ).toBe(false);
    });

    it("the project charges schema exposes a non-negative total", () => {
      expect(
        inventoryProjectChargesSchema.safeParse({ projectId: "project-a", totalDzd: 0, charges: [] }).success,
      ).toBe(true);
      expect(
        inventoryProjectChargesSchema.safeParse({ projectId: "project-a", totalDzd: Number.MAX_SAFE_INTEGER, charges: [] })
          .success,
      ).toBe(true);
      expect(
        inventoryProjectChargesSchema.safeParse({ projectId: "project-a", totalDzd: -1, charges: [] }).success,
      ).toBe(false);
      // The aggregate obeys the same magnitude bound as each charge, so a sum
      // above it cannot be represented and must not be emitted (#422 round 2).
      expect(
        inventoryProjectChargesSchema.safeParse({
          projectId: "project-a",
          totalDzd: Number.MAX_SAFE_INTEGER + 1,
          charges: [],
        }).success,
      ).toBe(false);
    });

    it("bounds the invoice asset purchase price INPUT with the same money rule as the charge", () => {
      const assetInput = { assetName: "مثقاب", purchasePriceDzd: Number.MAX_SAFE_INTEGER };
      expect(inventoryAssetUnitCreateInputSchema.safeParse(assetInput).success).toBe(true);
      expect(
        inventoryAssetUnitCreateInputSchema.safeParse({ ...assetInput, purchasePriceDzd: Number.MAX_SAFE_INTEGER + 1 })
          .success,
      ).toBe(false);

      const invoiceInput = {
        entries: [
          {
            kind: "ASSET" as const,
            itemDefinitionId: "def-1",
            projectId: "project-a",
            assets: [assetInput],
          },
        ],
      };
      expect(inventoryInvoiceGroupCreateInputSchema.safeParse(invoiceInput).success).toBe(true);
      expect(
        inventoryInvoiceGroupCreateInputSchema.safeParse({
          ...invoiceInput,
          entries: [
            {
              ...invoiceInput.entries[0],
              assets: [{ assetName: "مثقاب", purchasePriceDzd: Number.MAX_SAFE_INTEGER + 1 }],
            },
          ],
        }).success,
      ).toBe(false);
    });

    it("reads back an asset stored above the write bound through the detail and list responses (#413 round 3)", () => {
      // The DDL only enforces `purchase_price_dzd >= 0`, and the field predates
      // the MAX_MONEY_DZD gate, so a row above the bound genuinely exists. The
      // READ schemas must represent it — only the INPUT gate refuses a new one.
      const storedAsset = {
        id: "asset-1",
        inventoryEntryId: "entry-1",
        assetName: "مثقاب",
        assetTag: null,
        serialNumber: null,
        condition: null,
        purchaseDate: null,
        purchasePriceDzd: Number.MAX_SAFE_INTEGER + 1,
        currentWarehouseId: null,
        currentProjectId: "project-a",
        currentLocationLabel: null,
        note: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      };

      expect(inventoryAssetUnitSchema.safeParse(storedAsset).success).toBe(true);

      const invoiceGroup = {
        id: "group-1",
        invoiceNumber: null,
        supplierName: null,
        invoiceDate: null,
        warehouseId: null,
        projectId: "project-a",
        externalCounterpartyId: null,
        grossTotalDzd: 0,
        paidAmountDzd: 0,
        remainingDebtDzd: 0,
        debtAccountId: null,
        note: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      };
      const movement = {
        id: "movement-1",
        movementType: "PURCHASE",
        itemType: "ASSET",
        inventoryEntryId: "entry-1",
        assetUnitId: "asset-1",
        quantity: 1,
        fromWarehouseId: null,
        fromProjectId: null,
        toWarehouseId: null,
        toProjectId: "project-a",
        note: null,
        occurredAt: "2026-06-01T00:00:00.000Z",
        createdAt: "2026-06-01T00:00:00.000Z",
      };

      // asset detail (the `asset` field is the same read schema)
      expect(
        inventoryAssetDetailSchema.safeParse({
          asset: storedAsset,
          invoiceGroup,
          movements: [movement],
          charges: [{ ...charge, revisions: [] }],
        }).success,
      ).toBe(true);

      // invoice detail (entry + asset)
      expect(
        inventoryInvoiceGroupDetailSchema.safeParse({
          group: invoiceGroup,
          entries: [
            {
              id: "entry-1",
              invoiceGroupId: "group-1",
              itemDefinitionId: "def-1",
              warehouseId: null,
              projectId: "project-a",
              itemType: "ASSET",
              itemName: "مثقاب",
              unit: null,
              quantity: 1,
              unitPriceDzd: Number.MAX_SAFE_INTEGER + 1,
              totalPriceDzd: Number.MAX_SAFE_INTEGER + 1,
              note: null,
              createdAt: "2026-06-01T00:00:00.000Z",
              updatedAt: "2026-06-01T00:00:00.000Z",
              assets: [storedAsset],
            },
          ],
          attachments: [],
          movements: [movement],
          consumableBalances: [],
        }).success,
      ).toBe(true);

      // location contents (list path)
      expect(inventoryLocationContentsSchema.safeParse({ assets: [storedAsset], consumables: [] }).success).toBe(true);

      // a charge row and its revision read back with their stored amounts
      expect(
        inventoryAssetChargeSchema.safeParse({ ...charge, amountDzd: Number.MAX_SAFE_INTEGER + 1 }).success,
      ).toBe(true);
      expect(
        inventoryAssetChargeRevisionSchema.safeParse({
          id: "rev-1",
          chargeId: "charge-1",
          previousAmountDzd: Number.MAX_SAFE_INTEGER + 1,
          newAmountDzd: null,
          reason: null,
          actorUserId: null,
          actorLabel: null,
          createdAt: "2026-06-01T00:00:00.000Z",
        }).success,
      ).toBe(true);
    });

    it("refuses to USE an unrepresentable default while echoing a legacy above-bound price (#413 round 3)", () => {
      // The echoed purchase price may be a legacy row, so it reads back; the
      // amount a placement would USE keeps the write bound.
      expect(
        inventoryAssetChargeDefaultSchema.safeParse({
          assetUnitId: "asset-1",
          amountDzd: 80_000,
          purchasePriceDzd: Number.MAX_SAFE_INTEGER + 1,
          source: "LAST_CHARGE",
        }).success,
      ).toBe(true);
      expect(
        inventoryAssetChargeDefaultSchema.safeParse({
          assetUnitId: "asset-1",
          amountDzd: Number.MAX_SAFE_INTEGER + 1,
          purchasePriceDzd: Number.MAX_SAFE_INTEGER + 1,
          source: "PURCHASE_PRICE",
        }).success,
      ).toBe(false);
    });

    it("the asset detail requires a charges array", () => {
      // Omit `charges` entirely. The other fields are deliberately empty, but
      // the error list must still name `charges` as missing. Asserting only
      // that the schema has a `charges` key would pass even if it were optional.
      const parsed = inventoryAssetDetailSchema.safeParse({
        asset: {},
        invoiceGroup: {},
        movements: [],
      });
      expect(parsed.success).toBe(false);
      if (parsed.success) throw new Error("expected the parse to fail");
      expect(parsed.error.issues.some((issue) => issue.path[0] === "charges")).toBe(true);

      // Required, not non-empty: an empty chain is a legal asset detail.
      expect(inventoryAssetDetailSchema.shape.charges.safeParse([]).success).toBe(true);
    });

    it("advertises the charge procedures on the inventory contract", () => {
      for (const key of [
        "inventoryAssetChargeDefault",
        "inventoryAssetChargesListByUnit",
        "inventoryAssetChargesListByProject",
        "inventoryAssetChargesUpdate",
        "inventoryAssetChargesVoid",
      ]) {
        expect(key in inventoryContract).toBe(true);
        expect(key in appContract).toBe(true);
      }
    });
  });

  describe("invoice money bound (#429)", () => {
    const consumableInput = {
      kind: "CONSUMABLE" as const,
      itemDefinitionId: "def-1",
      warehouseId: "wh-1",
      quantity: 2,
      unitPriceDzd: 500,
      totalPriceDzd: 1_000,
    };

    it("bounds the consumable line money INPUT with the shared money rule", () => {
      expect(inventoryConsumableEntryCreateInputSchema.safeParse(consumableInput).success).toBe(true);
      expect(
        inventoryConsumableEntryCreateInputSchema.safeParse({
          ...consumableInput,
          unitPriceDzd: Number.MAX_SAFE_INTEGER,
        }).success,
      ).toBe(true);
      // Above the bound is where the line total stops being representable.
      expect(
        inventoryConsumableEntryCreateInputSchema.safeParse({
          ...consumableInput,
          unitPriceDzd: Number.MAX_SAFE_INTEGER + 1,
        }).success,
      ).toBe(false);
      expect(
        inventoryConsumableEntryCreateInputSchema.safeParse({
          ...consumableInput,
          totalPriceDzd: Number.MAX_SAFE_INTEGER + 1,
        }).success,
      ).toBe(false);
    });

    it("bounds the initial paid amount INPUT, keeping the omitted/null/zero forms", () => {
      const debtInvoiceInput = {
        externalCounterpartyId: "cp-1",
        createDebt: true,
        paymentInputType: "AMOUNT" as const,
        entries: [consumableInput],
      };
      for (const paidAmountDzd of [undefined, null, 0]) {
        expect(
          inventoryInvoiceGroupCreateInputSchema.safeParse({ ...debtInvoiceInput, paidAmountDzd }).success,
        ).toBe(true);
      }
      expect(
        inventoryInvoiceGroupCreateInputSchema.safeParse({
          ...debtInvoiceInput,
          paidAmountDzd: Number.MAX_SAFE_INTEGER,
        }).success,
      ).toBe(true);
      expect(
        inventoryInvoiceGroupCreateInputSchema.safeParse({
          ...debtInvoiceInput,
          paidAmountDzd: Number.MAX_SAFE_INTEGER + 1,
        }).success,
      ).toBe(false);
    });

    it("bounds the invoice group OUTPUT totals so an unrepresentable aggregate cannot be emitted", () => {
      const group = {
        id: "group-1",
        invoiceNumber: null,
        supplierName: null,
        invoiceDate: null,
        warehouseId: null,
        projectId: null,
        externalCounterpartyId: null,
        grossTotalDzd: 1_000,
        paidAmountDzd: 200,
        remainingDebtDzd: 800,
        debtAccountId: null,
        note: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      };
      expect(inventoryInvoiceGroupSchema.safeParse(group).success).toBe(true);
      for (const field of ["grossTotalDzd", "paidAmountDzd", "remainingDebtDzd"] as const) {
        expect(
          inventoryInvoiceGroupSchema.safeParse({ ...group, [field]: Number.MAX_SAFE_INTEGER }).success,
        ).toBe(true);
        expect(
          inventoryInvoiceGroupSchema.safeParse({ ...group, [field]: Number.MAX_SAFE_INTEGER + 1 }).success,
        ).toBe(false);
      }
    });
  });

  describe("project cost contract (issue #414)", () => {
    it("requires a project id and accepts a signed-but-bounded computed total", () => {
      expect(projectCostInputSchema.safeParse({ projectId: "" }).success).toBe(false);
      expect(projectCostInputSchema.safeParse({ projectId: "11111111-1111-4111-8111-111111111111" }).success).toBe(true);

      const base = {
        projectId: "11111111-1111-4111-8111-111111111111",
        totalDzd: 0,
        parts: { expensesDzd: 0, salariesDzd: 0, stockDzd: 0, chargedMaterialsDzd: 0 },
        expenses: [],
        salaries: [],
        stock: [],
        materialMovements: [],
        parkedInventory: { totalDzd: 0, assets: [] },
      };
      expect(projectCostSchema.safeParse(base).success).toBe(true);
      // A negative total is a legal computed value (a negative material net can
      // outweigh the positive parts). It must not lock the operator out of the
      // screen; the UI warns instead.
      expect(projectCostSchema.safeParse({ ...base, totalDzd: -1 }).success).toBe(true);
      // ... but leaving the representable range on either side is refused.
      expect(
        projectCostSchema.safeParse({ ...base, totalDzd: -(Number.MAX_SAFE_INTEGER + 1) }).success,
      ).toBe(false);
      expect(
        projectCostSchema.safeParse({
          ...base,
          parts: { ...base.parts, chargedMaterialsDzd: -1 },
        }).success,
      ).toBe(true);
      // The part is bounded on BOTH sides, not just made non-negative.
      expect(
        projectCostSchema.safeParse({
          ...base,
          parts: { ...base.parts, chargedMaterialsDzd: -(Number.MAX_SAFE_INTEGER + 1) },
        }).success,
      ).toBe(false);
      expect(
        projectCostSchema.safeParse({
          ...base,
          parts: { expensesDzd: 0, salariesDzd: 0, stockDzd: 0 },
        }).success,
      ).toBe(false);
    });

    it("labels material charged to the project, not consumed", () => {
      // The direction carries the sign; valueDzd stays a positive magnitude.
      expect(
        projectCostMaterialMovementSchema.safeParse({
          id: "11111111-1111-4111-8111-111111111111",
          itemDefinitionId: null,
          itemName: null,
          unit: null,
          quantity: 3,
          unitPriceDzd: 500,
          valueDzd: 1_500,
          direction: "OUT",
          occurredAt: "2026-05-20T00:00:00.000Z",
        }).success,
      ).toBe(true);
      // A direction outside IN/OUT is refused.
      expect(
        projectCostMaterialMovementSchema.safeParse({
          id: "11111111-1111-4111-8111-111111111111",
          itemDefinitionId: null,
          itemName: null,
          unit: null,
          quantity: 3,
          unitPriceDzd: 500,
          valueDzd: 1_500,
          direction: "CONSUMED",
          occurredAt: "2026-05-20T00:00:00.000Z",
        }).success,
      ).toBe(false);
    });

    it("advertises projectCostGet on the app contract", () => {
      expect("projectCostGet" in appContract).toBe(true);
    });

    it("keeps stored rows permissive but computed aggregates bounded", () => {
      const aboveBound = Number.MAX_SAFE_INTEGER + 1;
      // A legacy stored row reads back (it predates the write bound) ...
      expect(
        projectCostExpenseRowSchema.safeParse({
          id: "11111111-1111-4111-8111-111111111111",
          expenseDate: "2026-05-10T00:00:00.000Z",
          whatFor: null,
          amountDzd: aboveBound,
          responsibleWorkerId: null,
          responsibleWorkerName: null,
          sellerId: null,
          sellerName: null,
        }).success,
      ).toBe(true);
      // ... but a computed part/total may never leave the representable range.
      expect(
        projectCostPartsSchema.safeParse({
          expensesDzd: aboveBound,
          salariesDzd: 0,
          stockDzd: 0,
          chargedMaterialsDzd: 0,
        }).success,
      ).toBe(false);
    });
  });
});
