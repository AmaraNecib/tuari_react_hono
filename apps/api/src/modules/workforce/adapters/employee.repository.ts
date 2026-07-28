import type { CompanyRepository } from "../../company/company.repository.contracts";
import type { EmployeeRecord } from "../../company/company.types";
import type {
  EmployeeFilters,
  EmployeePagedQuery,
  EmployeePagedResult,
  EmployeeRepository,
} from "../employee.repository";

/**
 * SQLite implementation of EmployeeRepository.
 *
 * Uses the existing company repository for the actual SQL. The cursor
 * encodes `(createdAt, id)` and the query uses a strict-less-than
 * predicate so each page is O(log N) (uses the index on
 * `(created_at DESC, id DESC)` — see schema-definitions.ts).
 */
export class SqliteEmployeeRepository implements EmployeeRepository {
  constructor(private readonly companyRepository: CompanyRepository) {}

  async findById(id: string): Promise<EmployeeRecord | null> {
    return this.companyRepository.getEmployeeById(id) ?? null;
  }

  async findAll(filters?: EmployeeFilters): Promise<EmployeeRecord[]> {
    return this.companyRepository.listEmployees(filters);
  }

  async findPaged(options: EmployeePagedQuery): Promise<EmployeePagedResult> {
    // For the SQLite adapter we delegate to the underlying company
    // repository's paginated query. The interface boundary stays clean:
    // the EmployeeModule never sees SQL.
    return this.companyRepository.listEmployeesPaged(options);
  }

  async findByPhone(phone: string): Promise<EmployeeRecord | null> {
    return this.companyRepository.getEmployeeByPhone(phone) ?? null;
  }

  async save(employee: EmployeeRecord): Promise<void> {
    this.companyRepository.upsertEmployee(employee);
  }

  async delete(id: string): Promise<void> {
    this.companyRepository.deleteEmployee(id);
  }
}

