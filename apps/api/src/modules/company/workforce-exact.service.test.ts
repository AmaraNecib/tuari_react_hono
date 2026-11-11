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
  it.each([
    { label: "without segments", segments: [] },
    { label: "with a zero segment", segments: [{ id: "zero-A", projectId: "A", amount: "0" }] },
  ])("records a zero approval $label without ledger accounts, entries or obligation links", ({ segments }) => {
    const { service, ledger, finance, repository } = setup();
    const accountWrites = vi.spyOn(ledger, "saveAccount");
    const entryWrites = vi.spyOn(ledger, "saveEntry");
    const input = { ...approval, approvedAmount: "0", unallocatedAmount: "0", segments };
    const result = service.approveEarnings(input);
    expect(result).toMatchObject({ approvedAmount: "0.00", unallocatedAmount: "0.00", debtAccountId: null, debtEntryId: null });
    expect(result.segments).toEqual(segments.map(segment => ({ ...segment, amount: "0.00" })));
    expect(repository.listEarnings("worker")).toEqual([result]);
    expect(service.approveEarnings(input)).toEqual(result);
    expect(repository.listEarnings("worker")).toEqual([result]);
    expect(finance.listAccounts()).toEqual([]);
    expect(accountWrites).not.toHaveBeenCalled();
    expect(entryWrites).not.toHaveBeenCalled();
  });

  it.each(["employee", "project"] as const)("refuses oversized in-memory %s histories before cloning segments or transaction snapshots", target => {
    const { repository, service } = setup();
    const { requestId: _requestId, ...approved } = approval;
    repository.saveEarning({ ...approved, id: "budget", approvedAmount: "0.00", unallocatedAmount: "0.00", debtAccountId: null, debtEntryId: null, createdAt: "2026-11-11T00:00:00.000Z", segments: Array.from({ length: 10000 }, (_, i) => ({ id: `budget-${i}`, projectId: "A", amount: "0.00" })) });
    const clone = vi.spyOn(globalThis, "structuredClone").mockImplementation(() => { throw new Error("cloned before resource check"); });
    try {
      expect(() => target === "employee" ? service.listEmployeeEarnings("worker") : service.getProjectSalaryCost("A")).toThrow("Payroll read resource limit exceeded");
      expect(clone).not.toHaveBeenCalled();
    } finally { clone.mockRestore(); }
  });

  it("reads a 500-earning account history once and keeps target-specific payment remainders", () => {
    const { ledger, finance, repository, service } = setup();
    const first = service.approveEarnings({ ...approval, approvedAmount: "1", unallocatedAmount: "1", segments: [] });
    const original = ledger.getEntry(first.debtEntryId!)!;
    for (let i = 1; i < 500; i++) {
      const id = `history-${i}`;
      const entryId = `entry-${i}`;
      ledger.saveEntry({ ...original, id: entryId, producerId: id, postingSequence: i + 1, balanceAfterDzd: `${i + 1}.00` });
      repository.saveEarning({ ...first, id, debtEntryId: entryId });
    }
    ledger.saveAccount({ ...ledger.getAccount(first.debtAccountId!)!, currentBalance: "500.00" });
    // Trusted fixture payment, not a payroll cash command.
    finance.forProducer({ type: "PAYROLL_EARNINGS", id: first.id }).recordPayment({ requestId: "history-payment", debtEntryId: first.debtEntryId!, amountDzd: "0.25", currency: "DZD" });
    const actualRead = ledger.listEntries.bind(ledger);
    let reads = 0;
    const history = vi.spyOn(ledger, "listEntries").mockImplementation(id => {
      if (++reads > 1) throw new Error("Repeated account history read");
      return actualRead(id);
    });
    const rows = service.listEmployeeEarnings("worker");
    expect(rows).toHaveLength(500);
    expect(rows[0]).toEqual({ earning: first, remainingAmount: "0.75" });
    expect(rows.slice(1).every(row => row.remainingAmount === "1.00")).toBe(true);
    expect(history).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledWith(first.debtAccountId);
  });

  it.each(["voided", "absent"])("does not expose a %s original as an earning remainder", kind => {
    const { finance, repository, service } = setup();
    const first = service.approveEarnings(approval);
    if (kind === "voided") finance.forProducer({ type: "PAYROLL_EARNINGS", id: first.id }).voidEntry({ requestId: "fixture-void", entryId: first.debtEntryId!, currency: "DZD", voidReason: "fixture" });
    else repository.saveEarning({ ...first, id: "missing-original", debtEntryId: "absent" });
    expect(() => service.listEmployeeEarnings("worker")).toThrow("Live debt entry not found");
  });

  it("keeps nested copy-on-write source rollback and returned-value isolation", () => {
    const { repository, service } = setup();
    const original = service.approveEarnings(approval);
    expect(() => repository.withTransaction(() => {
      repository.saveEarning({ ...original, id: "outer" });
      expect(() => repository.withTransaction(() => {
        repository.saveEarning({ ...original, id: "inner" });
        throw new Error("inner rollback");
      })).toThrow("inner rollback");
      expect(repository.getEarning("outer")).not.toBeNull();
      expect(repository.getEarning("inner")).toBeNull();
      throw new Error("outer rollback");
    })).toThrow("outer rollback");
    expect(repository.listEarnings("worker")).toEqual([original]);
    const read = repository.getEarning(original.id)!;
    read.segments[0]!.amount = "1.00";
    expect(repository.getEarning(original.id)).toEqual(original);
  });

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
