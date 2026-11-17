import type { ExactTransactionIdentity } from "../exact-finance.repository";
import { EXACT_WORKFORCE_READ_RECORD_LIMIT, type ExactSalaryEarning, type ExactWorkforceRepository } from "../workforce-exact.repository";
import { ExactDebtError } from "../exact-finance.service";

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
  private boundedEarnings(matches: (row: ExactSalaryEarning) => boolean): ExactSalaryEarning[] {
    const selected: ExactSalaryEarning[] = [];
    let records = 0;
    for (const row of this.earnings.values()) {
      if (!matches(row)) continue;
      records += 1 + row.segments.length;
      if (records > EXACT_WORKFORCE_READ_RECORD_LIMIT) throw new ExactDebtError("Payroll read resource limit exceeded");
      selected.push(row);
    }
    return selected.map(row => structuredClone(row));
  }
  listEarnings(employeeId: string): ExactSalaryEarning[] {
    return this.boundedEarnings(row => row.employeeId === employeeId);
  }
  listProjectEarnings(projectId: string): ExactSalaryEarning[] {
    return this.boundedEarnings(row => row.segments.some(segment => segment.projectId === projectId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
  saveEarning(earning: ExactSalaryEarning): void {
    if (!this.employeeExists(earning.employeeId) || earning.segments.some(row => !this.projectExists(row.projectId))) throw new Error("Missing workforce reference");
    const previous = this.earnings.get(earning.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(earning)) throw new Error("Approved earning is immutable");
    // Copy on write keeps transaction snapshots immutable without cloning all historical segments on reads.
    this.earnings = new Map(this.earnings).set(earning.id, structuredClone(earning));
  }
  withTransaction<T>(work: () => T): T {
    const snapshot = this.earnings;
    try {
      const result = work();
      if (result && typeof (result as { then?: unknown }).then === "function") throw new TypeError("Payroll transaction must be synchronous");
      return result;
    } catch (error) { this.earnings = snapshot; throw error; }
  }
}
