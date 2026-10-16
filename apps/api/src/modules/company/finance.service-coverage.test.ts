import { afterEach, describe, expect, it, vi } from "vitest";
import { DEBT_ACCOUNT_DIRECTION_REQUIRED_MESSAGE, MAX_MONEY_DZD, type DebtAccountCreateInput } from "@tuari/contracts";

import { CompanyError } from "./company.errors";
import {
  createAuditContext,
  createCompanyHarnessTracker,
} from "./company.test-helpers";

describe("FinanceService coverage branches", () => {
  const { createHarness, closeAll } = createCompanyHarnessTracker();

  afterEach(closeAll);

  const audit = () => createAuditContext();

  describe("getExternalCounterparty / getDebtAccount guards", () => {
    it("rejects missing counterparty and debt account ids", () => {
      const { service } = createHarness();
      expect(() => service.getExternalCounterparty("missing")).toThrowError(CompanyError);
      expect(() => service.getDebtAccount("missing")).toThrowError(CompanyError);
    });
  });

  describe("createDebtAccount validation", () => {
    it("rejects an account linked to no party (or to two parties)", () => {
      const { service } = createHarness();
      expect(() =>
        service.createDebtAccount({
        direction: "PAYABLE", partyType: "EXTERNAL_COUNTERPARTY", openingBalanceDzd: 100 }),
      ).toThrowError(CompanyError);
    });

    it("rejects an account linked to two parties at once", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "طرفان",
        phone: "0551000014",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const counterparty = service.createExternalCounterparty({
        fullName: "طرف خارجي",
        phoneNumber: "0217777777",
      }).item;
      expect(() =>
        service.createDebtAccount({
        direction: "PAYABLE",
          partyType: "EXTERNAL_COUNTERPARTY",
          workerId: worker.id,
          externalCounterpartyId: counterparty.id,
          openingBalanceDzd: 100,
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects a non-finite opening balance", () => {
      const { service } = createHarness();
      const counterparty = service.createExternalCounterparty({
        fullName: "طرف غير صالح",
        phoneNumber: "0216666666",
      }).item;
      expect(() =>
        service.createDebtAccount({
        direction: "PAYABLE",
          partyType: "EXTERNAL_COUNTERPARTY",
          externalCounterpartyId: counterparty.id,
          openingBalanceDzd: Number.NaN,
        }),
      ).toThrowError(CompanyError);
    });
  });

  describe("voidDebtEntry recompute", () => {
    it("voids a non-opening entry and recomputes running balances for remaining live entries", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "ثالث عشر",
        phone: "0551000013",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const opening = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 1000,
      });
      const payment = service.recordDebtPayment(
        { debtEntryId: opening.id, amountDzd: 300, paymentMethod: "CASH" },
        audit(),
      ).item;
      service.createDebtEntry({
        debtAccountId: opening.debtAccountId,
        entryType: "ADJUSTMENT",
        signedAmountDzd: 50,
      });

      // Voiding a non-OPENING entry leaves the opening + adjustment live, so
      // the recompute sorts and re-runs the running balance across 2+ entries.
      service.voidDebtEntry({ entryId: payment.id, voidReason: "دفعة خاطئة" }, audit());

      const entries = service
        .listDebtEntries({ debtAccountId: opening.debtAccountId })
        .items.filter((e) => e.status === "LIVE");
      expect(entries.length).toBeGreaterThanOrEqual(2);
      const sorted = [...entries].sort(
        (a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id),
      );
      let running = 0;
      for (const entry of sorted) {
        running += entry.signedAmountDzd;
        expect(entry.balanceAfterDzd).toBe(running);
      }
    });

    it("orders same-date live entries by id when recomputing running balances", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "رابع عشر",
        phone: "0551000017",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const opening = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 1000,
        entryDate: "2026-01-01T00:00:00.000Z",
      });
      service.createDebtEntry({
        debtAccountId: opening.debtAccountId,
        entryType: "ADJUSTMENT",
        signedAmountDzd: 50,
        entryDate: "2026-01-01T00:00:00.000Z",
      });
      // Void a non-opening entry (the payment) so both same-date entries stay live.
      const payment = service.recordDebtPayment(
        { debtEntryId: opening.id, amountDzd: 300, paymentMethod: "CASH" },
        audit(),
      ).item;
      service.voidDebtEntry({ entryId: payment.id, voidReason: "x" }, audit());
      const live = service
        .listDebtEntries({ debtAccountId: opening.debtAccountId })
        .items.filter((e) => e.status === "LIVE");
      expect(live.length).toBeGreaterThanOrEqual(2);
      // Both live entries share entryDate; the recompute must order by id and
      // re-derive balanceAfter as the cumulative signed amount in that order.
      const sorted = [...live].sort((a, b) => a.id.localeCompare(b.id));
      let running = 0;
      for (const entry of sorted) {
        running += entry.signedAmountDzd;
        expect(entry.balanceAfterDzd).toBe(running);
      }
    });
  });

  describe("listDebtsSummary — party resolution edge cases", () => {
    it("falls back to the account id when neither party resolves", () => {
      const { service, database, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "شبح",
        phone: "0551000018",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const account = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 500,
      });
      // Orphan the account's party reference (worker deleted) to force the
      // display-name fallback chain down to the account id.
      database.pragma("foreign_keys = OFF");
      database
        .prepare('UPDATE "debt_account" SET "worker_id" = ? WHERE "id" = ?')
        .run("ghost-worker", account.debtAccountId);
      database.pragma("foreign_keys = ON");

      const summary = service.listDebtsSummary();
      const row = summary.debtAccounts.find((d) => d.accountId === account.debtAccountId)!;
      expect(row.displayName).toBe(account.debtAccountId);
      expect(row.phoneNumber).toBeNull();
      const party = summary.parties.find((p) => p.workerId === "ghost-worker");
      expect(party?.displayName).toBe(account.debtAccountId);
    });

    it("keeps the newest updatedAt as latestActivityAt across same-party accounts", () => {
      const { service } = createHarness();
      const counterparty = service.createExternalCounterparty({
        fullName: "طرف النشاط",
        phoneNumber: "0218888888",
      }).item;
      const payable = service.createDebtAccount({
        direction: "PAYABLE",
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        openingBalanceDzd: 1000,
      }).item;
      const receivable = service.createDebtAccount({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        direction: "RECEIVABLE",
        openingBalanceDzd: 600,
      }).item;
      // Touch the payable account afterwards so its updatedAt is newer.
      const payableEntry = service.listDebtEntries({ debtAccountId: payable.id }).items[0]!;
      service.recordDebtPayment(
        { debtEntryId: payableEntry.id, amountDzd: 100, paymentMethod: "CASH" },
        audit(),
      );
      const summary = service.listDebtsSummary();      const party = summary.parties.find((p) => p.externalCounterpartyId === counterparty.id)!;
      const payableAfter = service.getDebtAccount(payable.id).item.updatedAt;
      expect(Date.parse(party.latestActivityAt)).toBeGreaterThanOrEqual(Date.parse(payableAfter));
    });

    it("falls back to the later account when the first party account is older", () => {
      const { service } = createHarness();
      const counterparty = service.createExternalCounterparty({
        fullName: "طرف متساو",
        phoneNumber: "0218888889",
      }).item;
      service.createDebtAccount({
        direction: "PAYABLE",
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        openingBalanceDzd: 400,
      });
      const later = service.createDebtAccount({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        direction: "RECEIVABLE",
        openingBalanceDzd: 700,
      }).item;
      const summary = service.listDebtsSummary();
      const party = summary.parties.find((p) => p.externalCounterpartyId === counterparty.id)!;
      // Neither account is touched after creation, so the later account's
      // updatedAt wins the latestActivityAt comparison.
      expect(Date.parse(party.latestActivityAt)).toBeGreaterThanOrEqual(Date.parse(later.updatedAt));
    });

    it("resolves latestActivityAt when two accounts share a timestamp", () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-03-01T10:00:00.000Z"));
        const { service } = createHarness();
        const counterparty = service.createExternalCounterparty({
          fullName: "طرف متزامن",
          phoneNumber: "0218888890",
        }).item;
        service.createDebtAccount({
        direction: "PAYABLE",
          partyType: "EXTERNAL_COUNTERPARTY",
          externalCounterpartyId: counterparty.id,
          openingBalanceDzd: 400,
        });
        service.createDebtAccount({
          partyType: "EXTERNAL_COUNTERPARTY",
          externalCounterpartyId: counterparty.id,
          direction: "RECEIVABLE",
          openingBalanceDzd: 700,
        });
        const summary = service.listDebtsSummary();
        const party = summary.parties.find((p) => p.externalCounterpartyId === counterparty.id)!;
        // Both accounts were created at the frozen instant, so the shared
        // Algeria-offset timestamp wins regardless of iteration order.
        expect(party.latestActivityAt).toBe("2026-03-01T11:00:00.000+01:00");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("createEmployeeDebtEntry", () => {
    it("creates the account on first entry and records ADVANCE entries", () => {
      const { service, repository, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "ثالث",
        phone: "0551000003",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const entry = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "ADVANCE",
        amountDzd: 500,
        note: "سلفة",
      });
      expect(entry.entryType).toBe("ADVANCE");
      expect(entry.signedAmountDzd).toBe(500);
      const account = repository.getDebtAccountByWorkerIdAndDirection(worker.id, "RECEIVABLE");
      expect(account?.currentBalance).toBe(500);
    });

    it("reuses the existing account when the worker already has one", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "رابع",
        phone: "0551000004",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const first = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 1000,
      });
      const second = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "PAYMENT",
        amountDzd: 300,
      });
      expect(first.debtAccountId).toBe(second.debtAccountId);
      const accounts = service.finance.listDebtAccounts({ workerId: worker.id }).items;
      expect(accounts).toHaveLength(1);
      // D7: a PAYMENT reduces the outstanding balance (1000 - 300).
      expect(accounts[0]?.currentBalance).toBe(700);
    });

    it("rejects entries for a missing employee", () => {
      const { service } = createHarness();
      expect(() =>
        service.finance.createEmployeeDebtEntry({
          employeeId: "missing",
          entryType: "OPENING",
          amountDzd: 100,
        }),
      ).toThrowError(CompanyError);
    });

    it("keeps one ledger per direction when the worker holds two (D3)", () => {
      const { service, repository, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مزدوج",
        phone: "0551000005",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;

      service.finance.createEmployeeDebtEntry({ employeeId: worker.id, entryType: "ADVANCE", amountDzd: 500 });
      service.finance.createEmployeeDebtEntry({ employeeId: worker.id, entryType: "OPENING", amountDzd: 1000 });

      const receivable = repository.getDebtAccountByWorkerIdAndDirection(worker.id, "RECEIVABLE");
      const payable = repository.getDebtAccountByWorkerIdAndDirection(worker.id, "PAYABLE");
      expect(receivable?.currentBalance).toBe(500);
      expect(payable?.currentBalance).toBe(1000);
      expect(receivable?.direction).toBe("RECEIVABLE");
      expect(payable?.direction).toBe("PAYABLE");
    });

    it("rejects createDebtAccount with no direction instead of defaulting to PAYABLE", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "بلا اتجاه",
        phone: "0551000006",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;

      expect(() =>
        service.createDebtAccount({
          partyType: "INTERNAL_WORKER",
          workerId: worker.id,
          openingBalanceDzd: 500,
        } as unknown as DebtAccountCreateInput),
      ).toThrowError(DEBT_ACCOUNT_DIRECTION_REQUIRED_MESSAGE);
    });

    it("rejects a negative opening balance server-side too", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "سالب",
        phone: "0551000007",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;

      expect(() =>
        service.createDebtAccount({
          partyType: "INTERNAL_WORKER",
          workerId: worker.id,
          direction: "PAYABLE",
          openingBalanceDzd: -1,
        }),
      ).toThrowError(CompanyError);
    });
  });

  describe("createDebtAccount — external counterparty directions", () => {
    it("creates a RECEIVABLE ledger via getDebtAccountByExternalCounterpartyIdAndDirection", () => {
      const { service } = createHarness();
      const counterparty = service.createExternalCounterparty({
        fullName: "شركة الدائن",
        phoneNumber: "0211111111",
      }).item;
      const account = service.createDebtAccount({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        direction: "RECEIVABLE",
        openingBalanceDzd: 800,
      }).item;
      expect(account.direction).toBe("RECEIVABLE");
      expect(account.currentBalance).toBe(800);
    });

    it("reuses an existing RECEIVABLE account for the same counterparty", () => {
      const { service } = createHarness();
      const counterparty = service.createExternalCounterparty({
        fullName: "شركة مكررة",
        phoneNumber: "0212222222",
      }).item;
      service.createDebtAccount({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        direction: "RECEIVABLE",
        openingBalanceDzd: 800,
      });
      const updated = service.createDebtAccount({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        direction: "RECEIVABLE",
        openingBalanceDzd: 0,
      }).item;
      expect(updated.direction).toBe("RECEIVABLE");
    });

    it("rejects an EXTERNAL_COUNTERPARTY account whose counterparty does not exist", () => {
      const { service } = createHarness();
      expect(() =>
        service.createDebtAccount({
        direction: "PAYABLE",
          partyType: "EXTERNAL_COUNTERPARTY",
          externalCounterpartyId: "missing-cp",
          openingBalanceDzd: 100,
        }),
      ).toThrowError(CompanyError);
    });
  });

  describe("createDebtEntry guards", () => {
    it("rejects an OPENING entry when the account already has entries", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "خامس",
        phone: "0551000005",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const account = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 1000,
      });
      expect(() =>
        service.createDebtEntry({
          debtAccountId: account.debtAccountId,
          entryType: "OPENING",
          signedAmountDzd: 500,
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects zero and non-finite signed amounts", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "سادس",
        phone: "0551000006",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const account = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 1000,
      });
      expect(() =>
        service.createDebtEntry({
          debtAccountId: account.debtAccountId,
          entryType: "ADJUSTMENT",
          signedAmountDzd: 0,
        }),
      ).toThrowError(CompanyError);
      expect(() =>
        service.createDebtEntry({
          debtAccountId: account.debtAccountId,
          entryType: "ADJUSTMENT",
          signedAmountDzd: Number.NaN,
        }),
      ).toThrowError(CompanyError);
    });
  });

  describe("recordDebtPayment guards", () => {
    it("rejects non-finite or non-positive amounts", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "سابع",
        phone: "0551000007",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const entry = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 1000,
      });
      expect(() =>
        service.recordDebtPayment({ debtEntryId: entry.id, amountDzd: 0, paymentMethod: "CASH" }, audit()),
      ).toThrowError(CompanyError);
      expect(() =>
        service.recordDebtPayment({ debtEntryId: entry.id, amountDzd: Number.NaN, paymentMethod: "CASH" }, audit()),
      ).toThrowError(CompanyError);
    });

    it("rejects a missing debt entry", () => {
      const { service } = createHarness();
      expect(() =>
        service.recordDebtPayment({ debtEntryId: "missing", amountDzd: 100, paymentMethod: "CASH" }, audit()),
      ).toThrowError(CompanyError);
    });

    it("rejects paying a voided entry", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "ثامن",
        phone: "0551000008",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const entry = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 1000,
      });
      service.voidDebtEntry({ entryId: entry.id, voidReason: "خطأ" }, audit());
      expect(() =>
        service.recordDebtPayment({ debtEntryId: entry.id, amountDzd: 100, paymentMethod: "CASH" }, audit()),
      ).toThrowError(CompanyError);
    });

    it("accepts a payment against any LIVE entry, not only an OPENING (D7)", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "تاسع",
        phone: "0551000009",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const opening = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 1000,
      });
      const payment = service.recordDebtPayment(
        { debtEntryId: opening.id, amountDzd: 200, paymentMethod: "CASH" },
        audit(),
      ).item;
      // The first payment is itself a live entry; paying against it now works
      // and still reduces the account balance.
      const second = service.recordDebtPayment(
        { debtEntryId: payment.id, amountDzd: 50, paymentMethod: "CASH" },
        audit(),
      ).item;
      expect(second.entryType).toBe("PAYMENT");
      expect(service.getDebtAccount(opening.debtAccountId).item.currentBalance).toBe(750);
    });

    it("rejects an amount that exceeds the account balance", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "عاشر",
        phone: "0551000010",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const entry = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 1000,
      });
      expect(() =>
        service.recordDebtPayment({ debtEntryId: entry.id, amountDzd: 1500, paymentMethod: "CASH" }, audit()),
      ).toThrowError(CompanyError);
    });

    it("marks the account SETTLED when the payment clears the full balance", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "حادي عشر",
        phone: "0551000015",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const entry = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 1000,
      });
      const payment = service.recordDebtPayment(
        { debtEntryId: entry.id, amountDzd: 1000, paymentMethod: "CASH" },
        audit(),
      ).item;
      expect(payment.balanceAfterDzd).toBe(0);
      const account = service.getDebtAccount(entry.debtAccountId).item;
      expect(account.status).toBe("SETTLED");
      expect(account.settledAt).toBeTruthy();
    });

    it("defaults the payment method to CASH when omitted", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "تسديد افتراضي",
        phone: "0551000019",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const entry = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 500,
      });
      const payment = service.recordDebtPayment(
        { debtEntryId: entry.id, amountDzd: 200 },
        audit(),
      ).item;
      expect(payment.paymentMethod).toBe("CASH");
    });
  });

  describe("voidDebtEntry guards + opening cascade", () => {
    it("rejects voiding a missing entry", () => {
      const { service } = createHarness();
      expect(() => service.voidDebtEntry({ entryId: "missing", voidReason: "x" }, audit())).toThrowError(
        CompanyError,
      );
    });

    it("rejects voiding an already-voided entry", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "حادي عشر",
        phone: "0551000011",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const entry = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 1000,
      });
      service.voidDebtEntry({ entryId: entry.id, voidReason: "أول" }, audit());
      expect(() => service.voidDebtEntry({ entryId: entry.id, voidReason: "ثان" }, audit())).toThrowError(
        CompanyError,
      );
    });

    it("records the actor user id as voidedBy when no label is available", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "ثاني عشر",
        phone: "0551000016",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const entry = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 1000,
      });
      service.voidDebtEntry(
        { entryId: entry.id, voidReason: "بدون تسمية" },
        { actorUserId: "user-no-label", actorLabel: undefined, transactionId: crypto.randomUUID() },
      );
      const entries = service.listDebtEntries({ debtAccountId: entry.debtAccountId }).items;
      expect(entries[0]?.voidedBy).toBe("user-no-label");
    });

    it("voids an OPENING entry and cascades to its linked live payments", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "ثاني عشر",
        phone: "0551000012",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const opening = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 1000,
      });
      const payment = service.recordDebtPayment(
        { debtEntryId: opening.id, amountDzd: 400, paymentMethod: "BANK_TRANSFER" },
        audit(),
      ).item;

      const voided = service.voidDebtEntry(
        { entryId: opening.id, voidReason: "كامل" },
        { actorUserId: "cascade-user", actorLabel: undefined, transactionId: crypto.randomUUID() },
      ).item;
      expect(voided.status).toBe("VOIDED");
      const entries = service.listDebtEntries({ debtAccountId: opening.debtAccountId }).items;
      const paymentRow = entries.find((e) => e.id === payment.id);
      expect(paymentRow?.status).toBe("VOIDED");
      expect(paymentRow?.voidReason).toContain("ملغاة تلقائياً");
      expect(paymentRow?.voidedBy).toBe("cascade-user");
      expect(service.getDebtAccount(opening.debtAccountId).item.currentBalance).toBe(0);
    });
  });

  describe("consolidateDebtEntries guards", () => {
    const buildPair = (service: ReturnType<typeof createHarness>["service"], phone: string) => {
      const counterparty = service.createExternalCounterparty({
        fullName: `طرف ${phone}`,
        phoneNumber: phone,
      }).item;
      const payable = service.createDebtAccount({
        direction: "PAYABLE",
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        openingBalanceDzd: 1000,
      }).item;
      const receivable = service.createDebtAccount({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        direction: "RECEIVABLE",
        openingBalanceDzd: 600,
      }).item;
      return {
        payableEntry: service.listDebtEntries({ debtAccountId: payable.id }).items[0]!,
        receivableEntry: service.listDebtEntries({ debtAccountId: receivable.id }).items[0]!,
      };
    };

    it("rejects a missing payable entry", () => {
      const { service } = createHarness();
      const { receivableEntry } = buildPair(service, "0213333331");
      expect(() =>
        service.consolidateDebtEntries({ payableEntryId: "missing", receivableEntryId: receivableEntry.id }),
      ).toThrowError(CompanyError);
    });

    it("rejects a missing receivable entry", () => {
      const { service } = createHarness();
      const { payableEntry } = buildPair(service, "0213333332");
      expect(() =>
        service.consolidateDebtEntries({ payableEntryId: payableEntry.id, receivableEntryId: "missing" }),
      ).toThrowError(CompanyError);
    });

    it("rejects consolidating a voided payable entry", () => {
      const { service } = createHarness();
      const { payableEntry, receivableEntry } = buildPair(service, "0213333333");
      service.voidDebtEntry({ entryId: payableEntry.id, voidReason: "x" });
      expect(() =>
        service.consolidateDebtEntries({
          payableEntryId: payableEntry.id,
          receivableEntryId: receivableEntry.id,
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects consolidating a voided receivable entry", () => {
      const { service } = createHarness();
      const { payableEntry, receivableEntry } = buildPair(service, "0213333334");
      service.voidDebtEntry({ entryId: receivableEntry.id, voidReason: "x" });
      expect(() =>
        service.consolidateDebtEntries({
          payableEntryId: payableEntry.id,
          receivableEntryId: receivableEntry.id,
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects consolidating a non-OPENING receivable entry", () => {
      const { service } = createHarness();
      const { payableEntry, receivableEntry } = buildPair(service, "0213333335");
      // Receivable side: record a payment against the opening (payable is 1000, receivable 600)
      service.recordDebtPayment({ debtEntryId: receivableEntry.id, amountDzd: 100, paymentMethod: "CASH" });
      const receivablePayment = service.listDebtEntries({
        debtAccountId: service.getDebtAccount(receivableEntry.debtAccountId).item.id,
      }).items.find((e) => e.entryType === "PAYMENT")!;
      expect(() =>
        service.consolidateDebtEntries({
          payableEntryId: payableEntry.id,
          receivableEntryId: receivablePayment.id,
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects consolidating an OPENING with other live entries on the receivable account", () => {
      const { service } = createHarness();
      const { payableEntry, receivableEntry } = buildPair(service, "0213333336");
      // Add a live ADJUSTMENT to the receivable account so the OPENING is not alone
      service.createDebtEntry({
        debtAccountId: receivableEntry.debtAccountId,
        entryType: "ADJUSTMENT",
        signedAmountDzd: 50,
      });
      expect(() =>
        service.consolidateDebtEntries({
          payableEntryId: payableEntry.id,
          receivableEntryId: receivableEntry.id,
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects consolidating entries for different parties", () => {
      const { service } = createHarness();
      const other = service.createExternalCounterparty({
        fullName: "طرف آخر",
        phoneNumber: "0213333337",
      }).item;
      const { payableEntry } = buildPair(service, "0213333338");
      const receivable = service.createDebtAccount({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: other.id,
        direction: "RECEIVABLE",
        openingBalanceDzd: 600,
      }).item;
      const receivableEntry = service.listDebtEntries({ debtAccountId: receivable.id }).items[0]!;
      expect(() =>
        service.consolidateDebtEntries({
          payableEntryId: payableEntry.id,
          receivableEntryId: receivableEntry.id,
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects consolidating zero-amount entries", () => {
      const { service, repository } = createHarness();
      const counterparty = service.createExternalCounterparty({
        fullName: "طرف صفري",
        phoneNumber: "0213333339",
      }).item;
      const payable = service.createDebtAccount({
        direction: "PAYABLE",
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
      }).item;
      const receivable = service.createDebtAccount({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        direction: "RECEIVABLE",
      }).item;
      // Repository-level OPENINGs with zero signed amounts bypass the service guard
      const payableEntry = repository.createDebtEntry({
        debtAccountId: payable.id,
        entryType: "OPENING",
        signedAmountDzd: 0,
        entryDate: "2026-01-01T00:00:00.000Z",
        balanceAfterDzd: 0,
      });
      const receivableEntry = repository.createDebtEntry({
        debtAccountId: receivable.id,
        entryType: "OPENING",
        signedAmountDzd: 0,
        entryDate: "2026-01-01T00:00:00.000Z",
        balanceAfterDzd: 0,
      });
      expect(() =>
        service.consolidateDebtEntries({
          payableEntryId: payableEntry.id,
          receivableEntryId: receivableEntry.id,
        }),
      ).toThrowError(CompanyError);
    });
  });

  describe("generateDebtReport — aggregation edge cases", () => {
    it("excludes a debt account whose live entries are all voided from the report", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "ملغى بالكامل",
        phone: "0551000020",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const entry = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 500,
        entryDate: "2026-02-01T10:00:00+01:00",
      });
      // Void the only entry: the account keeps existing but now has zero LIVE
      // entries, so the report inclusion filter must take its empty-list fallback.
      service.voidDebtEntry({ entryId: entry.id, voidReason: "خطأ تسجيل" }, audit());

      const report = service.finance.generateDebtReport({});
      expect(report.byParty.some((p) => p.partyId === worker.id)).toBe(false);
      expect(report.summary.partyCount).toBe(0);
    });

    it("falls back to the account id as party name when the referenced party stops resolving", () => {
      const { service, database, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "غائب عن التقرير",
        phone: "0551000021",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const entry = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "OPENING",
        amountDzd: 700,
        entryDate: "2026-02-01T10:00:00+01:00",
      });
      // Orphan the worker reference so neither the employee nor a counterparty
      // resolves, forcing the report partyName fallback chain down to the id.
      database.pragma("foreign_keys = OFF");
      database
        .prepare('UPDATE "debt_account" SET "worker_id" = ? WHERE "id" = ?')
        .run("ghost-report-worker", entry.debtAccountId);
      database.pragma("foreign_keys = ON");

      const report = service.finance.generateDebtReport({});
      const party = report.byParty.find((p) => p.partyId === "ghost-report-worker")!;
      expect(party.partyName).toBe(entry.debtAccountId);
    });

    it("keeps the first account's lastTransaction when a later same-party account is not newer", () => {
      const { service } = createHarness();
      const counterparty = service.createExternalCounterparty({
        fullName: "طرف حسابان",
        phoneNumber: "0214444000",
      }).item;
      // Two ledgers for one counterparty. listDebtAccounts folds accounts in
      // updatedAt DESC order, so the second account processed is not
      // deterministic here — give both openings the SAME entry date so that
      // whichever account folds second has a latest entry that is NOT strictly
      // newer than the party's previous lastTransaction (equal date). The party
      // merge must then keep the previous lastTransaction instead of regressing.
      service.createDebtAccount({
        direction: "PAYABLE",
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        openingBalanceDzd: 600,
        openingEntryDate: "2026-02-01T10:00:00+01:00",
      });
      service.createDebtAccount({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        direction: "RECEIVABLE",
        openingBalanceDzd: 400,
        openingEntryDate: "2026-02-01T10:00:00+01:00",
      });

      const report = service.finance.generateDebtReport({});
      const party = report.byParty.find((p) => p.partyId === counterparty.id)!;
      expect(party.outstandingDzd).toBe(1000);
      expect(party.lastTransaction).toBe("2026-02-01T10:00:00+01:00");
    });

    it("breaks equal-outstanding ties with the Arabic name comparison", () => {
      const { service } = createHarness();
      const first = service.createExternalCounterparty({
        fullName: "شركة أ",
        phoneNumber: "0214444004",
      }).item;
      const second = service.createExternalCounterparty({
        fullName: "شركة ب",
        phoneNumber: "0214444005",
      }).item;
      service.createDebtAccount({
        direction: "PAYABLE",
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: first.id,
        openingBalanceDzd: 400,
        openingEntryDate: "2026-02-01T10:00:00+01:00",
      });
      service.createDebtAccount({
        direction: "PAYABLE",
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: second.id,
        openingBalanceDzd: 400,
        openingEntryDate: "2026-02-01T10:00:00+01:00",
      });

      const report = service.finance.generateDebtReport({});
      const parties = report.byParty;
      expect(parties).toHaveLength(2);
      expect(parties[0]!.outstandingDzd).toBe(400);
      expect(parties[1]!.outstandingDzd).toBe(400);
      // Equal amounts → the amount difference is zero → localeCompare("ar") decides.
      expect(parties[0]!.partyName).toBe("شركة أ");
      expect(parties[1]!.partyName).toBe("شركة ب");
    });

    it("refuses an aggregate above MAX_MONEY_DZD with the business-rule error (#475)", () => {
      const { service, database } = createHarness();
      const counterparty = service.createExternalCounterparty({
        fullName: "طرف تجاوز الحد",
        phoneNumber: "0214444009",
      }).item;
      const account = service.createDebtAccount({
        direction: "PAYABLE",
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        openingBalanceDzd: 100,
        openingEntryDate: "2026-02-01T10:00:00+01:00",
      }).item;
      // A stored row can legitimately sit above the write bound: the write gate
      // (not the DB CHECK, which only enforces >= 0) is what keeps a NEW balance
      // in range, so an older build can leave one (#413 round 3).
      database
        .prepare('UPDATE "debt_account" SET "current_balance" = ? WHERE "id" = ?')
        .run(MAX_MONEY_DZD + 1, account.id);

      let thrown: unknown;
      try {
        service.finance.generateDebtReport({});
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(CompanyError);
      expect((thrown as CompanyError).appError.code).toBe("BUSINESS_RULE");
    });

    it("refuses a settled-report total above MAX_MONEY_DZD (#475)", () => {
      const { service } = createHarness();
      // Two SETTLED accounts that each settle at the bound: outstanding stays
      // zero, so only the settled-total fold can leave the bound.
      for (const [fullName, phoneNumber] of [
        ["طرف تسوية أ", "0214444010"],
        ["طرف تسوية ب", "0214444011"],
      ] as const) {
        const counterparty = service.createExternalCounterparty({ fullName, phoneNumber }).item;
        const account = service.createDebtAccount({
          direction: "PAYABLE",
          partyType: "EXTERNAL_COUNTERPARTY",
          externalCounterpartyId: counterparty.id,
          openingBalanceDzd: MAX_MONEY_DZD,
          openingEntryDate: "2026-02-01T10:00:00+01:00",
        }).item;
        service.settleDebtAccount({ id: account.id, entryDate: "2026-03-01T10:00:00+01:00" }, audit());
      }

      let thrown: unknown;
      try {
        service.finance.generateDebtReport({});
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(CompanyError);
      expect((thrown as CompanyError).appError.code).toBe("BUSINESS_RULE");
    });
  });
});
