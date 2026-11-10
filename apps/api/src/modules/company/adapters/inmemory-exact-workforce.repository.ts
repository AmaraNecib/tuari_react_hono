import type { ExactTransactionIdentity } from "../exact-finance.repository";
import type { ExactSalaryEarning, ExactWorkforceRepository } from "../workforce-exact.repository";

export class InMemoryExactWorkforceRepository implements ExactWorkforceRepository {
  private earnings = new Map<string, ExactSalaryEarning>();
  private readonly workers: Set<string>;
  private readonly projects: Set<string>;
  constructor(readonly transactionIdentity: ExactTransactionIdentity, references: { workerIds: readonly string[]; projectIds: readonly string[] }) {
    this.workers = new Set(references.workerIds);
    this.projects = new Set(references.projectIds);
  }
  employeeExists(id: string): boolean { return this.workers.has(id); }
  projectExists(id: string): boolean { return this.projects.has(id); }
  getEarning(id: string): ExactSalaryEarning | null { return structuredClone(this.earnings.get(id) ?? null); }
  listEarnings(employeeId: string): ExactSalaryEarning[] {
    return [...this.earnings.values()].filter(row => row.employeeId === employeeId).map(row => structuredClone(row));
  }
  saveEarning(earning: ExactSalaryEarning): void {
    if (!this.employeeExists(earning.employeeId) || earning.segments.some(row => !this.projectExists(row.projectId))) throw new Error("Missing workforce reference");
    const previous = this.earnings.get(earning.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(earning)) throw new Error("Approved earning is immutable");
    this.earnings.set(earning.id, structuredClone(earning));
  }
  withTransaction<T>(work: () => T): T {
    const snapshot = structuredClone(this.earnings);
    try {
      const result = work();
      if (result && typeof (result as { then?: unknown }).then === "function") throw new TypeError("Payroll transaction must be synchronous");
      return result;
    } catch (error) { this.earnings = snapshot; throw error; }
  }
}
