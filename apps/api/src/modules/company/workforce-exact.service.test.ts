import { describe, expect, it, vi } from "vitest";
import { InMemoryExactFinanceRepository } from "./adapters/inmemory-exact-finance.repository";
import { ExactFinanceService } from "./exact-finance.service";
import { InMemoryExactWorkforceRepository } from "./adapters/inmemory-exact-workforce.repository";
import { ExactWorkforceService } from "./workforce-exact.service";

function setup() {
  let sequence = 0;
  const dependencies = { id: () => `id-${++sequence}`, now: () => "2026-11-11T00:00:00.000Z" };
  const ledger = new InMemoryExactFinanceRepository({ workerIds: ["worker"] });
  const finance = new ExactFinanceService(ledger, dependencies);
  const repository = new InMemoryExactWorkforceRepository(ledger.transactionIdentity, { workerIds: ["worker"], projectIds: ["A", "B"] });
  return { ledger, finance, repository, service: new ExactWorkforceService(repository, finance, dependencies) };
}
const approval = {
  requestId: "approve-october", employeeId: "worker", currency: "DZD" as const,
  periodStart: "2026-10-01", periodEnd: "2026-10-31", approvedAmount: "35000", unallocatedAmount: "0",
  segments: [{ id: "a1", projectId: "A", amount: "10000", days: 5 }, { id: "b", projectId: "B", amount: "15000" }, { id: "a2", projectId: "A", amount: "10000", days: 5 }],
  actorUserId: "operator", actorLabel: "Operator", transactionId: "audit-1",
};

describe("opt-in exact workforce aggregate", () => {
  it("rolls both source rows and ledger back when aggregate receipt persistence fails, then retries once", () => {
    const { service, ledger, finance, repository } = setup();
    const receipt = vi.spyOn(ledger, "saveAggregateCommand").mockImplementationOnce(() => { throw new Error("receipt failure"); });
    expect(() => service.approveEarnings(approval)).toThrow("receipt failure");
    expect(repository.listEarnings("worker")).toEqual([]);
    expect(finance.listAccounts()).toEqual([]);
    receipt.mockRestore();
    const result = service.approveEarnings(approval);
    expect(repository.listEarnings("worker")).toHaveLength(1);
    expect(finance.detail(result.debtAccountId!).entries).toHaveLength(1);
    expect(service.approveEarnings(approval)).toEqual(result);
  });

  it("rejects invalid source references before posting and rejects generic changes to payroll-owned wages", () => {
    const { service, finance } = setup();
    expect(() => service.approveEarnings({ ...approval, employeeId: "absent" })).toThrow(/Employee not found/);
    expect(() => service.approveEarnings({ ...approval, segments: [{ id: "missing", projectId: "absent", amount: "35000" }] })).toThrow(/Project not found/);
    expect(finance.listAccounts()).toEqual([]);
    const result = service.approveEarnings(approval);
    expect(() => finance.recordPayment({ requestId: "generic-pay", debtEntryId: result.debtEntryId!, amountDzd: "1", currency: "DZD" })).toThrow(/producer/);
    expect(finance.remaining(result.debtEntryId!)).toBe("35000.00");
  });

  it("enlists only participants sharing both connection and FIFO identity", () => {
    const { finance } = setup();
    const dependencies = { id: () => "id", now: () => "2026-11-11T00:00:00.000Z" };
    for (const identity of [
      { connection: {}, lock: finance.transactionIdentity.lock },
      { connection: finance.transactionIdentity.connection, lock: {} },
    ]) {
      const repository = new InMemoryExactWorkforceRepository(identity, { workerIds: ["worker"], projectIds: ["A", "B"] });
      expect(() => new ExactWorkforceService(repository, finance, dependencies).approveEarnings(approval)).toThrow(/same connection and shared FIFO/);
      expect(repository.listEarnings("worker")).toEqual([]);
    }
    expect(finance.listAccounts()).toEqual([]);
  });

  it("approves explicit A/B/A wages once in the authoritative payable ledger and replays the whole result", () => {
    const { service, finance, repository } = setup();
    const result = service.approveEarnings(approval);
    expect(result.approvedAmount).toBe("35000.00");
    expect(result.segments.map(row => row.projectId)).toEqual(["A", "B", "A"]);
    expect(result.actorUserId).toBe("operator");
    expect(finance.remaining(result.debtEntryId!)).toBe("35000.00");
    const detail = finance.detail(result.debtAccountId!);
    expect(detail.account.direction).toBe("PAYABLE");
    expect(detail.entries).toHaveLength(1);
    expect(detail.entries[0]).toMatchObject({ producerType: "PAYROLL_EARNINGS", producerId: result.id, signedAmountDzd: "35000.00" });
    expect(service.approveEarnings(approval)).toEqual(result);
    expect(repository.listEarnings("worker")).toHaveLength(1);
    expect(finance.detail(result.debtAccountId!).entries).toHaveLength(1);
    expect(() => service.approveEarnings({ ...approval, approvedAmount: "36000", unallocatedAmount: "1000" })).toThrow(/replay conflict/);
  });
});
