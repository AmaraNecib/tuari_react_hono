import type { CompanyRepository } from "../../company/company.repository.contracts";
import type { RoleRecord } from "../../company/company.types";
import type { RoleRepository } from "../employee.repository";

/**
 * SQLite implementation of RoleRepository.
 *
 * Thin shim over the company repository's role lookup methods.
 */
export class SqliteRoleRepository implements RoleRepository {
  constructor(private readonly companyRepository: CompanyRepository) {}

  async findById(id: string): Promise<RoleRecord | null> {
    return this.companyRepository.getRoleById(id) ?? null;
  }
}
