import type { Employee, EmployeeListFilters, EmployeeStatus } from "./employee.entity";

export type EmployeeWriteInput = {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  roleId: string;
  status: EmployeeStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type EmployeeUpdateInput = {
  id: string;
  firstName?: string;
  lastName?: string | null;
  phone?: string | null;
  roleId?: string;
  status?: EmployeeStatus;
  notes?: string | null;
  updatedAt: Date;
};

export type EmployeeLookupOptions = {
  includeDeleted?: boolean;
};

export interface EmployeeRepository {
  list(filters?: EmployeeListFilters): Promise<Employee[]>;
  getById(id: string, options?: EmployeeLookupOptions): Promise<Employee | null>;
  create(input: EmployeeWriteInput): Promise<Employee>;
  update(input: EmployeeUpdateInput): Promise<Employee>;
  softDelete(id: string, deletedAt: Date, updatedAt: Date): Promise<boolean>;
  countByRoleId(roleId: string): Promise<number>;
}
