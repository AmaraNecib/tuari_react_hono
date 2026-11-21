import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { payrollFixture, now, paidAt } from "./__test-utils__/payroll-native";
import { PayrollOpeningService } from "./payroll-opening.service";
import { PayrollService } from "./payroll.service";
import { SqlitePayrollOpeningRepository, payrollOpeningSchemaStatements } from "./adapters/sqlite-payroll-opening.repository";

function fixture(key: string) {
  const f = payrollFixture(key);
  for (const sql of payrollOpeningSchemaStatements) f.db.exec(sql);
  const repository = new SqlitePayrollOpeningRepository(f.db, f.lock);
  const opening = new PayrollOpeningService(f.finance, repository, { id: randomUUID, now: () => now });
  const payroll = new PayrollService(f.finance, f.cash, f.sources, { id: randomUUID, now: () => now }, undefined, repository);
  return { ...f, repository, opening, payroll };
}

describe.each(["", "545-refund-public-test-key"])("opening cash reconciliation (%s)", key => {
  it("refuses generic voiding of producer cash and fails closed on an unsupported trusted void", () => {
    const f = fixture(key);
    const source = f.opening.review({ ...f.audit, requestId: "void-boundary-review", employeeId: f.employeeId, wages: "2000.00", advances: "0.00" }).sources[0]!;
    const cash = f.payroll.recordCash({ ...f.audit, requestId: "void-boundary-paid", employeeId: f.employeeId, amount: "1500.00", paymentDate: paidAt, wages: [{ openingId: source.sourceId, amount: "1500.00" }] });
    const paymentId = cash.wageAllocations[0]!.paymentEntryId;
    expect(() => f.finance.voidEntry({ ...f.audit, requestId: "unscoped-void", entryId: paymentId, voidReason: "Generic debt RPC has no producer capability" })).toThrow(/producer/);
    expect(f.opening.get(f.employeeId).sources[0]?.remaining).toBe("500.00");
    f.finance.forProducer({ type: "PAYROLL_OPENING", id: source.sourceId }).voidEntry({ ...f.audit, requestId: "trusted-void", entryId: paymentId, voidReason: "Unsupported corruption probe" });
    expect(() => f.opening.get(f.employeeId)).toThrow(/provenance/);
    expect(() => f.cash.getCash(cash.id)).toThrow(/link/);
  });

  it("rolls back refund and correction when resolution persistence fails, then replays once", () => {
    const f = fixture(key);
    const source = f.opening.review({ ...f.audit, requestId: "review-rollback", employeeId: f.employeeId, wages: "2000.00", advances: "0.00" }).sources[0]!;
    f.payroll.recordCash({ ...f.audit, requestId: "pay-rollback", employeeId: f.employeeId, amount: "1500.00", paymentDate: paidAt, wages: [{ openingId: source.sourceId, amount: "1500.00" }] });
    f.opening.correct({ ...f.audit, requestId: "proposal-rollback", employeeId: f.employeeId, kind: "WAGE", expectedAmount: "2000.00", amount: "200.00", reason: "Verified" });
    const proposal = f.opening.get(f.employeeId).proposals[0]!;
    const input = { ...f.audit, requestId: "refund-rollback", employeeId: f.employeeId, proposalId: proposal.id, expectedAmount: "2000.00", refundAmount: "1300.00", refundDate: paidAt, confirmCashRefund: true as const };
    for (const changed of [{ ...input, refundAmount: "1301.00" }, { ...input, confirmCashRefund: false }, { ...input, expectedAmount: "1900.00" }, { ...input, refundDate: "2026-11-01T00:00:00.000Z" }, { ...input, employeeId: f.employee() }]) expect(() => f.opening.reconcile(changed as typeof input)).toThrow();
    f.db.exec("CREATE TRIGGER reject_opening_resolution BEFORE INSERT ON employee_opening_resolution BEGIN SELECT RAISE(ABORT,'Injected resolution failure'); END");
    expect(() => f.opening.reconcile(input)).toThrow(/Injected resolution failure/);
    expect(f.finance.remaining(source.debtEntryId)).toBe("500.00");
    const unchanged = f.opening.get(f.employeeId);
    expect(unchanged.refunds).toEqual([]);
    expect(unchanged.history).toEqual([]);
    expect(unchanged.proposals[0]?.status).toBe("PENDING");
    f.db.exec("DROP TRIGGER reject_opening_resolution");
    const saved = f.opening.reconcile(input);
    expect(f.opening.reconcile(input)).toEqual(saved);
    expect(f.opening.get(f.employeeId).refunds).toHaveLength(1);
    expect(() => f.db.exec("DELETE FROM employee_opening_refund")).toThrow(/immutable/);
    expect(() => f.db.exec("UPDATE employee_opening_proposal SET reason='changed'")).toThrow(/immutable/);
  });

  it("retains cancellation as a separate event and refuses a stale proposal after another payment", () => {
    const f = fixture(key);
    const source = f.opening.review({ ...f.audit, requestId: "review-stale", employeeId: f.employeeId, wages: "2000.00", advances: "0.00" }).sources[0]!;
    const pay = (requestId: string, amount: string) => f.payroll.recordCash({ ...f.audit, requestId, employeeId: f.employeeId, amount, paymentDate: paidAt, wages: [{ openingId: source.sourceId, amount }] });
    pay("paid-first", "1500.00");
    f.opening.correct({ ...f.audit, requestId: "propose-stale", employeeId: f.employeeId, kind: "WAGE", expectedAmount: "2000.00", amount: "200.00", reason: "Verified" });
    const proposal = f.opening.get(f.employeeId).proposals[0]!;
    expect(() => f.opening.correct({ ...f.audit, requestId: "conflicting-proposal", employeeId: f.employeeId, kind: "WAGE", expectedAmount: "2000.00", amount: "100.00", reason: "Another" })).toThrow(/pending/i);
    pay("paid-again", "100.00");
    expect(() => f.opening.reconcile({ ...f.audit, requestId: "stale-refund", employeeId: f.employeeId, proposalId: proposal.id, expectedAmount: "2000.00", refundAmount: "1300.00", refundDate: paidAt, confirmCashRefund: true })).toThrow(/changed/i);
    const cancel = { ...f.audit, requestId: "cancel-stale", employeeId: f.employeeId, proposalId: proposal.id, reason: "Settlement changed; review again" };
    expect(f.opening.cancel(cancel)).toEqual(f.opening.cancel(cancel));
    const after = f.opening.get(f.employeeId);
    expect(after.proposals[0]).toMatchObject({ status: "CANCELLED", newAmount: "200.00", resolution: { reason: cancel.reason, actorUserId: f.audit.actorUserId } });
    expect(after.refunds).toEqual([]);
    expect(f.finance.remaining(source.debtEntryId)).toBe("400.00");
  });

  it.each(["WAGE", "ADVANCE"] as const)("fully refunds a %s settlement to correct to zero and records the actual cash date", kind => {
    const f = fixture(key);
    const source = f.opening.review({ ...f.audit, requestId: "zero-review", employeeId: f.employeeId, wages: kind === "WAGE" ? "2000.00" : "0.00", advances: kind === "ADVANCE" ? "2000.00" : "0.00" }).sources[0]!;
    if (kind === "WAGE") f.payroll.recordCash({ ...f.audit, requestId: "zero-paid", employeeId: f.employeeId, amount: "1500.00", paymentDate: paidAt, wages: [{ openingId: source.sourceId, amount: "1500.00" }] });
    else f.payroll.repayAdvance({ ...f.audit, requestId: "zero-recovery", employeeId: f.employeeId, openingAdvanceId: source.sourceId, amount: "1500.00", paymentDate: paidAt });
    f.opening.correct({ ...f.audit, requestId: "zero-proposal", employeeId: f.employeeId, kind, expectedAmount: "2000.00", amount: "0.00", reason: "Opening was entered by mistake" });
    const proposal = f.opening.get(f.employeeId).proposals[0]!;
    expect(proposal.requiredRefund).toBe("1500.00");
    const input = { ...f.audit, requestId: "zero-refund", employeeId: f.employeeId, proposalId: proposal.id, expectedAmount: "2000.00", refundAmount: "1500.00", refundDate: paidAt, confirmCashRefund: true as const };
    const saved = f.opening.reconcile(input);
    expect(f.opening.reconcile(input)).toEqual(saved);
    const refund = f.finance.listEntries(source.debtAccountId).find(row => row.id === saved.refundEntryId)!;
    expect(refund.entryDate).toBe(paidAt);
    expect(refund.createdAt).toBe(now);
    expect(f.finance.remaining(source.debtEntryId)).toBe("0.00");
    expect(f.opening.get(f.employeeId).sources[0]!.currentAmount).toBe("0.00");
  });

  it.each(["WAGE", "ADVANCE"] as const)("retains a pending %s correction until an explicitly recorded cash refund makes it applicable", kind => {
    const f = fixture(key);
    const reviewed = f.opening.review({ ...f.audit, requestId: "opening", employeeId: f.employeeId, wages: kind === "WAGE" ? "2000.00" : "0.00", advances: kind === "ADVANCE" ? "2000.00" : "0.00" });
    const source = reviewed.sources[0]!;
    if (kind === "WAGE") f.payroll.recordCash({ ...f.audit, requestId: "paid", employeeId: f.employeeId, amount: "1500.00", paymentDate: paidAt, wages: [{ openingId: source.sourceId, amount: "1500.00" }] });
    else f.payroll.repayAdvance({ ...f.audit, requestId: "recovered", employeeId: f.employeeId, openingAdvanceId: source.sourceId, amount: "1500.00", paymentDate: paidAt });
    const cashBefore = f.cash.listCash(f.employeeId);
    const recoveryBefore = f.cash.listSettlements(f.employeeId);
    expect(f.finance.remaining(source.debtEntryId)).toBe("500.00");
    const correction = { ...f.audit, requestId: "propose", employeeId: f.employeeId, kind, expectedAmount: "2000.00", amount: "200.00", reason: "Verified original opening document" };
    const pending = f.opening.correct(correction);
    expect(f.opening.correct(correction)).toEqual(pending);
    const proposal = f.opening.get(f.employeeId).proposals[0]!;
    expect(proposal).toMatchObject({ oldAmount: "2000.00", newAmount: "200.00", requiredRefund: "1300.00", status: "PENDING", actorUserId: f.audit.actorUserId });
    expect(f.opening.history(f.employeeId)).toEqual([]);
    expect(f.finance.remaining(source.debtEntryId)).toBe("500.00");
    const input = { ...f.audit, requestId: "confirm-real-refund", employeeId: f.employeeId, proposalId: proposal.id, expectedAmount: "2000.00", refundAmount: "1300.00", refundDate: paidAt, confirmCashRefund: true as const };
    const applied = f.opening.reconcile(input);
    expect(f.opening.reconcile(input)).toEqual(applied);
    const result = f.opening.get(f.employeeId);
    expect(result.proposals[0]!.status).toBe("APPLIED");
    expect(result.refunds).toMatchObject([{ amount: "1300.00", direction: kind === "WAGE" ? "IN" : "OUT", actorUserId: f.audit.actorUserId }]);
    expect(result.history.map(row => [row.oldAmount, row.newAmount])).toEqual([["2000.00", "200.00"]]);
    expect(f.finance.remaining(source.debtEntryId)).toBe("0.00");
    expect(f.finance.listEntries(source.debtAccountId).map(row => row.signedAmountDzd)).toEqual(["2000.00", "-1500.00", "1300.00", "-1800.00"]);
    expect(f.cash.listCash(f.employeeId)).toEqual(cashBefore);
    expect(f.cash.listSettlements(f.employeeId)).toEqual(recoveryBefore);
    expect(f.cost()).toEqual([]);
  });
});
