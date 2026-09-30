import { afterEach, describe, expect, it } from "vitest";

import { CompanyError } from "./company.errors";
import {
  createAuditContext,
  createCompanyHarnessTracker,
} from "./company.test-helpers";

/**
 * Debt writers, write side (owner decisions D2, D3, D7).
 *
 * These pin the behaviour the pre-fix code violated:
 *  - D2: the reason category locks the account direction; a contradicting
 *    direction is rejected and an omitted one is derived.
 *  - D3: a worker can hold one ledger per direction (an advance is a worker
 *    receivable) and reuse is direction-aware.
 *  - D7: `createEmployeeDebtEntry` signs by entry type and `recordDebtPayment`
 *    accepts any LIVE entry.
 */
describe("Debt writers (D2/D3/D7)", () => {
  const { createHarness, closeAll } = createCompanyHarnessTracker();

  afterEach(closeAll);

  const audit = () => createAuditContext();

  function createWorker(service: ReturnType<typeof createHarness>["service"], roleIds: ReturnType<typeof createHarness>["roleIds"], lastName: string, phone: string) {
    return service.createEmployee({
      firstName: "عامل",
      lastName,
      phone,
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
  }

  describe("D2 — the reason category locks the direction", () => {
    it("derives RECEIVABLE for a salary advance even when no direction is sent", () => {
      const { service, roleIds } = createHarness();
      const worker = createWorker(service, roleIds, "سلفة", "0551090001");

      const account = service.createDebtAccount({
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        openingBalanceDzd: 5000,
        reasonCategory: "SALARY_ADVANCE",
      }).item;

      // D1a: the worker owes us the advance.
      expect(account.direction).toBe("RECEIVABLE");
      expect(account.currentBalance).toBe(5000);
      expect(account.workerId).toBe(worker.id);
    });

    it("derives PAYABLE for a reimbursement", () => {
      const { service, roleIds } = createHarness();
      const worker = createWorker(service, roleIds, "تعويض", "0551090002");

      const account = service.createDebtAccount({
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        openingBalanceDzd: 2000,
        reasonCategory: "REIMBURSEMENT",
      }).item;

      expect(account.direction).toBe("PAYABLE");
      expect(account.currentBalance).toBe(2000);
    });

    it("rejects a direction that contradicts the reason category", () => {
      const { service, roleIds } = createHarness();
      const worker = createWorker(service, roleIds, "تناقض", "0551090003");

      expect(() =>
        service.createDebtAccount({
          partyType: "INTERNAL_WORKER",
          workerId: worker.id,
          direction: "PAYABLE",
          openingBalanceDzd: 100,
          reasonCategory: "SALARY_ADVANCE",
        }),
      ).toThrowError(CompanyError);
    });

    it("accepts a matching direction and keeps the unconstrained default", () => {
      const { service, roleIds } = createHarness();
      const worker = createWorker(service, roleIds, "مطابق", "0551090004");

      const matching = service.createDebtAccount({
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        direction: "RECEIVABLE",
        openingBalanceDzd: 100,
        reasonCategory: "SALARY_ADVANCE",
      }).item;
      expect(matching.direction).toBe("RECEIVABLE");

      // OTHER does not lock the direction; the explicit direction is honoured.
      const unconstrained = service.createDebtAccount({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: service.createExternalCounterparty({
          fullName: "طرف آخر",
          phoneNumber: "0219000001",
        }).item.id,
        direction: "RECEIVABLE",
        openingBalanceDzd: 50,
        reasonCategory: "OTHER",
      }).item;
      expect(unconstrained.direction).toBe("RECEIVABLE");
    });

    it("accepts an explicit direction with no reason category (the debt cases panel shape)", () => {
      // DebtCasesPanel posts an explicit direction and a positive opening with
      // NO reasonCategory. The category lock must not apply, or the panel's
      // owed-by-us default would be rejected.
      const { service } = createHarness();
      const counterparty = service.createExternalCounterparty({
        fullName: "طرف الدفعات",
        phoneNumber: "0219000020",
      }).item;

      const payable = service.createDebtAccount({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        direction: "PAYABLE",
        openingBalanceDzd: 500,
      }).item;
      expect(payable.direction).toBe("PAYABLE");
      expect(payable.currentBalance).toBe(500);

      const receivable = service.createDebtAccount({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        direction: "RECEIVABLE",
        openingBalanceDzd: 300,
      }).item;
      expect(receivable.direction).toBe("RECEIVABLE");
      expect(receivable.currentBalance).toBe(300);
    });
  });

  describe("D3 — a worker holds one ledger per direction", () => {
    it("creates a RECEIVABLE advance ledger and a PAYABLE reimbursement ledger for the same worker", () => {
      const { service, repository, roleIds } = createHarness();
      const worker = createWorker(service, roleIds, "حسابان", "0551090010");

      const advance = service.createDebtAccount({
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        openingBalanceDzd: 5000,
        reasonCategory: "SALARY_ADVANCE",
      }).item;
      const reimbursement = service.createDebtAccount({
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        openingBalanceDzd: 3000,
        reasonCategory: "REIMBURSEMENT",
      }).item;

      expect(advance.id).not.toBe(reimbursement.id);
      expect(advance.direction).toBe("RECEIVABLE");
      expect(reimbursement.direction).toBe("PAYABLE");
      expect(service.listDebtAccounts({ workerId: worker.id }).items).toHaveLength(2);

      // The direction-aware lookup finds the receivable ledger, not whichever
      // account the worker happens to have most recently touched.
      const receivable = repository.getDebtAccountByWorkerIdAndDirection(worker.id, "RECEIVABLE");
      expect(receivable?.id).toBe(advance.id);
      expect(receivable?.currentBalance).toBe(5000);
      expect(repository.getDebtAccountByWorkerIdAndDirection(worker.id, "PAYABLE")?.id).toBe(reimbursement.id);
    });

    it("reuses the same-direction ledger instead of the other direction", () => {
      const { service, roleIds } = createHarness();
      const worker = createWorker(service, roleIds, "إعادة", "0551090011");

      const first = service.createDebtAccount({
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        openingBalanceDzd: 5000,
        reasonCategory: "SALARY_ADVANCE",
      }).item;
      service.createDebtAccount({
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        openingBalanceDzd: 3000,
        reasonCategory: "REIMBURSEMENT",
      });
      const secondAdvance = service.createDebtAccount({
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        openingBalanceDzd: 1000,
        reasonCategory: "SALARY_ADVANCE",
      }).item;

      expect(secondAdvance.id).toBe(first.id);
      expect(service.getDebtAccount(first.id).item.currentBalance).toBe(6000);
    });
  });

  describe("D7 — sign by entry type and one payment path", () => {
    it("records an ADVANCE as a positive worker receivable", () => {
      const { service, roleIds } = createHarness();
      const worker = createWorker(service, roleIds, "سلفة2", "0551090020");

      const entry = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "ADVANCE",
        amountDzd: 500,
      });

      expect(entry.signedAmountDzd).toBe(500);
      expect(service.finance.getEmployeeDebtAccount(worker.id)?.direction).toBe("RECEIVABLE");
      expect(service.finance.getEmployeeDebtAccount(worker.id)?.currentBalance).toBe(500);
    });

    it("records a PAYMENT as negative and offsets the open receivable", () => {
      const { service, roleIds } = createHarness();
      const worker = createWorker(service, roleIds, "تسديد", "0551090021");

      service.finance.createEmployeeDebtEntry({ employeeId: worker.id, entryType: "ADVANCE", amountDzd: 500 });
      const payment = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "PAYMENT",
        amountDzd: 200,
      });

      expect(payment.signedAmountDzd).toBe(-200);
      expect(service.finance.getEmployeeDebtAccount(worker.id)?.currentBalance).toBe(300);
    });

    it("signs a PAYMENT negative on the PAYABLE ledger when no receivable is open", () => {
      const { service, roleIds } = createHarness();
      const worker = createWorker(service, roleIds, "دفع", "0551090022");

      service.finance.createEmployeeDebtEntry({ employeeId: worker.id, entryType: "OPENING", amountDzd: 1000 });
      const payment = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "PAYMENT",
        amountDzd: 300,
      });

      expect(payment.signedAmountDzd).toBe(-300);
      expect(service.finance.getEmployeeDebtAccount(worker.id)?.direction).toBe("PAYABLE");
      expect(service.finance.getEmployeeDebtAccount(worker.id)?.currentBalance).toBe(700);
    });

    it("falls back to PAYABLE for a payment when the open receivable is already zero", () => {
      const { service, roleIds } = createHarness();
      const worker = createWorker(service, roleIds, "صفر", "0551090023");

      service.createDebtAccount({
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        openingBalanceDzd: 0,
        reasonCategory: "SALARY_ADVANCE",
      });
      const payment = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "PAYMENT",
        amountDzd: 50,
      });

      // The zero-balance receivable is not an open debt, so the payment lands
      // on the PAYABLE ledger.
      expect(payment.signedAmountDzd).toBe(-50);
      expect(service.getDebtAccount(payment.debtAccountId).item.direction).toBe("PAYABLE");
    });

    it("honours an explicit direction over the entry-type default", () => {
      const { service, roleIds } = createHarness();
      const worker = createWorker(service, roleIds, "صريح", "0551090025");

      service.createDebtAccount({
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        direction: "PAYABLE",
        openingBalanceDzd: 1000,
      });
      const payment = service.finance.createEmployeeDebtEntry({
        employeeId: worker.id,
        entryType: "PAYMENT",
        amountDzd: 400,
        direction: "PAYABLE",
      });

      expect(payment.signedAmountDzd).toBe(-400);
      expect(service.getDebtAccount(payment.debtAccountId).item.direction).toBe("PAYABLE");
      expect(service.getDebtAccount(payment.debtAccountId).item.currentBalance).toBe(600);
    });

    it("accepts a payment against a live ADJUSTMENT entry", () => {
      const { service, roleIds } = createHarness();
      const worker = createWorker(service, roleIds, "تعديل", "0551090024");

      const opening = service.finance.createEmployeeDebtEntry({ employeeId: worker.id, entryType: "OPENING", amountDzd: 1000 });
      const adjustment = service.createDebtEntry({
        debtAccountId: opening.debtAccountId,
        entryType: "ADJUSTMENT",
        signedAmountDzd: 100,
      }).item;

      const payment = service.recordDebtPayment(
        { debtEntryId: adjustment.id, amountDzd: 30, paymentMethod: "CASH" },
        audit(),
      ).item;

      expect(payment.entryType).toBe("PAYMENT");
      expect(service.getDebtAccount(opening.debtAccountId).item.currentBalance).toBe(1070);
    });
  });
});
