import type { ExactEmployee, ExactEmployeeStateHistory, EmployeeAssignWorkplaceInput, EmployeeManagerAssignment, EmployeeProjectAssignment } from "@tuari/contracts";
import type { EmployeeListFilters, MutationAuditContext, RoleRecord } from "./company.types";
import type { TransactionalRepository } from "./company.repository.contracts";
import type { EmployeeTransitionLinks } from "./company.entity-resolvers";

/** Profile writes and state history belong to one workspace transaction, never the legacy money mapper. */
export interface ExactEmployeeRepository extends TransactionalRepository {
  getRoleById(id: string): RoleRecord | null;
  getEmployeeById(id: string): ExactEmployee | null;
  getActiveManagerAssignmentByWorkerId(id: string): EmployeeManagerAssignment | null;
  getEmployeeByPhone(phone: string): ExactEmployee | null;
  listEmployees(filters?: EmployeeListFilters): ExactEmployee[];
  listEmployeesPaged(query: { filters?: EmployeeListFilters; cursor?: string; limit: number }): { items: ExactEmployee[]; total: number; nextCursor: string | null };
  listEmployeeStateHistory(employeeId?: string): ExactEmployeeStateHistory[];
  countEmployees(filters?: EmployeeListFilters): number;
  listEmployeeCreatedRelationships(employeeId: string): { managerAssignments: EmployeeManagerAssignment[]; projectAssignments: EmployeeProjectAssignment[] };
  employeeHasPreservedEvidence(id: string): boolean;
  deleteEmployee(id: string): boolean;
  getEmployeeTransitionLinks(id: string): EmployeeTransitionLinks;
  getWorkplaceResource(kind: "PROJECT" | "WAREHOUSE", id: string): { id: string; managerId: string | null; status: string } | null;
  listManagedResources(kind: "PROJECT" | "WAREHOUSE", managerId: string): { id: string; managerId: string | null; status: string }[];
  managedResourceHasDependentAssignments(kind: "PROJECT" | "WAREHOUSE", id: string): boolean;
  syncManagedResources(kind: "PROJECT" | "WAREHOUSE", managerId: string, ids: readonly string[], audit: Required<MutationAuditContext>, timestamp: string): void;
  assignEmployeeWorkplace(input: EmployeeAssignWorkplaceInput, audit: Required<MutationAuditContext>, timestamp: string): void;
  createEmployee(employee: ExactEmployee, audit: Required<MutationAuditContext>): ExactEmployee;
  updateEmployee(employee: ExactEmployee, audit: Required<MutationAuditContext>): ExactEmployee | null;
}
