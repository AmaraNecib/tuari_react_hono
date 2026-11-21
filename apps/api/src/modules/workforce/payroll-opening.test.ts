import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { payrollFixture, now } from "./__test-utils__/payroll-native";
import { PayrollOpeningService } from "./payroll-opening.service";
import { SqlitePayrollOpeningRepository, payrollOpeningSchemaStatements } from "./adapters/sqlite-payroll-opening.repository";

function fixture(key = "") {
  const f = payrollFixture(key);
  for (const sql of payrollOpeningSchemaStatements) f.db.exec(sql);
  const repository = new SqlitePayrollOpeningRepository(f.db, f.lock);
  const service = new PayrollOpeningService(f.finance, repository, { id: randomUUID, now: () => now });
  return { ...f, repository, opening: service };
}

describe.each(["", "545-opening-public-test-key"])("opening review and attributable correction (%s)", key => {
  it("persists explicit reviewed zero without creating obligations", () => {
    const f = fixture(key);
    const input = { ...f.audit, requestId: "zero-review", employeeId: f.employeeId, wages: "0.00", advances: "0.00" };
    expect(f.opening.review(input)).toEqual({ employeeId: f.employeeId, state: "REVIEWED", sources: [] });
    expect(f.repository.countRows(f.employeeId)).toBe(1);
    expect(f.finance.listAccounts()).toEqual([]);
    expect(() => f.db.prepare("UPDATE employee_opening_review SET actor_label='Other'").run()).toThrow(/immutable/);
    expect(() => f.db.prepare("DELETE FROM employee_opening_review").run()).toThrow(/immutable/);
  });

  it("rolls back ledger and review when persistence refuses the second source", () => {
    const f = fixture(key);
    f.db.exec("CREATE TRIGGER refuse_opening BEFORE INSERT ON employee_opening_source WHEN NEW.kind='ADVANCE' BEGIN SELECT RAISE(ABORT,'Injected opening failure'); END");
    const input = { ...f.audit, requestId: "failed-opening", employeeId: f.employeeId, wages: "2000.00", advances: "300.00" };
    expect(() => f.opening.review(input)).toThrow(/Injected opening failure/);
    expect(f.repository.getReview(f.employeeId)).toBeNull();
    expect(f.finance.listAccounts()).toEqual([]);
    f.db.exec("DROP TRIGGER refuse_opening");
    expect(f.opening.review(input).sources).toHaveLength(2);
    expect(f.opening.review(input).sources).toHaveLength(2);
  });

  it("retains 2000, then 1900, then 200 as linked history without changing labor cost", () => {
    const f = fixture(key);
    expect(f.repository.getReview(f.employeeId)).toBeNull();
    const input = { ...f.audit, requestId: "review-opening", employeeId: f.employeeId, wages: "2000.00", advances: "300.00" };
    const reviewed = f.opening.review(input);
    expect(f.opening.review(input)).toEqual(reviewed);
    const wage = reviewed.sources.find(row => row.kind === "WAGE")!;
    const advance = reviewed.sources.find(row => row.kind === "ADVANCE")!;
    for (const [requestId, expectedAmount, amount] of [["correct-first", "2000.00", "1900.00"], ["correct-again", "1900.00", "200.00"]]) {
      const correction = { ...f.audit, requestId: requestId!, employeeId: f.employeeId, kind: "WAGE" as const, expectedAmount: expectedAmount!, amount: amount!, reason: "Corrected the remembered opening wages" };
      const saved = f.opening.correct(correction);
      expect(f.opening.correct(correction)).toEqual(saved);
    }
    const history = f.opening.history(f.employeeId);
    expect(history.map(row => [row.oldAmount, row.newAmount])).toEqual([["2000.00", "1900.00"], ["1900.00", "200.00"]]);
    expect(history.every(row => row.actorUserId === f.audit.actorUserId && row.createdAt === now && row.reason === "Corrected the remembered opening wages")).toBe(true);
    const entries = f.finance.listEntries(wage.debtAccountId).filter(row => row.id === wage.debtEntryId || row.correctionOfEntryId === wage.debtEntryId);
    expect(entries.map(row => row.signedAmountDzd)).toEqual(["2000.00", "-100.00", "-1700.00"]);
    expect(f.finance.remaining(wage.debtEntryId)).toBe("200.00");
    expect(f.finance.remaining(advance.debtEntryId)).toBe("300.00");
    expect(f.repository.getReview(f.employeeId)?.sources.find(row => row.kind === "WAGE")?.sourceId).toBe(wage.sourceId);
    expect(f.cost()).toEqual([]);
    expect(() => f.opening.correct({ ...f.audit, requestId: "stale", employeeId: f.employeeId, kind: "WAGE", expectedAmount: "2000.00", amount: "150.00", reason: "Stale tab" })).toThrow(/changed/i);
    expect(f.opening.history(f.employeeId)).toHaveLength(2);
  });
});
