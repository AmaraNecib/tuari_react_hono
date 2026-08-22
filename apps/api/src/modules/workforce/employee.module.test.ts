import { describe, it, expect, beforeEach } from "vitest";

import { InMemoryEmployeeRepository } from "./adapters/in-memory-employee.repository";
import { InMemoryRoleRepository } from "./adapters/in-memory-role.repository";
import { EmployeeModule, type CreateEmployeeInput } from "./employee.module";
import { EmployeeNotFoundError, DuplicatePhoneError, RoleNotFoundError } from "./employee.errors";

/**
 * Tests for the Employee deep module.
 *
 * These tests use InMemory adapters to verify the module's behavior
 * without requiring a real database. The same tests will work with
 * Drizzle adapters when the migration is complete.
 */
describe("EmployeeModule", () => {
  let employeeRepository: InMemoryEmployeeRepository;
  let roleRepository: InMemoryRoleRepository;
  let employeeModule: EmployeeModule;

  const seedWorkerRole = () => {
    roleRepository.seed({
      id: "role-worker",
      key: "worker",
      name: "Worker",
      description: null,
      isSystem: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  beforeEach(() => {
    employeeRepository = new InMemoryEmployeeRepository();
    roleRepository = new InMemoryRoleRepository();
    employeeModule = new EmployeeModule({
      employeeRepository,
      roleRepository,
    });
  });

  describe("create", () => {
    it("creates an employee with valid input", async () => {
      seedWorkerRole();

      const input: CreateEmployeeInput = {
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
      };

      const employee = await employeeModule.create(input);

      expect(employee).toMatchObject({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
        status: "ACTIVE",
      });
      expect(employee.id).toBeDefined();
      expect(employee.createdAt).toBeDefined();
      expect(employee.occupation).toBeNull();
    });

    it("persists an optional occupation on create", async () => {
      seedWorkerRole();

      const employee = await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
        occupation: "عامل بناء",
      });

      expect(employee.occupation).toBe("عامل بناء");
      const found = await employeeModule.findById(employee.id);
      expect(found?.occupation).toBe("عامل بناء");
    });

    it("updates and clears the occupation field", async () => {
      seedWorkerRole();

      const employee = await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
        occupation: "عامل بناء",
      });

      const updated = await employeeModule.update(employee.id, { id: employee.id, occupation: "نقاش" });
      expect(updated.occupation).toBe("نقاش");

      const cleared = await employeeModule.update(employee.id, { id: employee.id, occupation: null });
      expect(cleared.occupation).toBeNull();
    });

    it("rejects creation with duplicate phone number", async () => {
      seedWorkerRole();

      const input: CreateEmployeeInput = {
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
      };

      await employeeModule.create(input);

      await expect(
        employeeModule.create({ ...input, firstName: "Other" })
      ).rejects.toThrow(DuplicatePhoneError);
    });

    it("rejects creation with non-existent role", async () => {
      const input: CreateEmployeeInput = {
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "non-existent-role",
      };

      await expect(employeeModule.create(input)).rejects.toThrow(RoleNotFoundError);
    });
  });

  describe("findById", () => {
    it("returns the employee when found", async () => {
      seedWorkerRole();

      const created = await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
      });

      const found = await employeeModule.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.firstName).toBe("Ahmed");
    });

    it("returns null when not found", async () => {
      const found = await employeeModule.findById("non-existent");

      expect(found).toBeNull();
    });
  });

  describe("list", () => {
    it("returns empty array when no employees exist", async () => {
      const employees = await employeeModule.list();

      expect(employees).toEqual([]);
    });

    it("returns all employees when no filters applied", async () => {
      seedWorkerRole();

      await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
      });
      await employeeModule.create({
        firstName: "Fatima",
        lastName: "Ben Ali",
        phone: "0555123457",
        roleId: "role-worker",
      });

      const employees = await employeeModule.list();

      expect(employees).toHaveLength(2);
    });

    it("filters by status", async () => {
      seedWorkerRole();
      roleRepository.seed({
        id: "role-manager",
        key: "manager",
        name: "Manager",
        description: null,
        isSystem: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const created = await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
      });
      await employeeModule.create({
        firstName: "Fatima",
        lastName: "Ben Ali",
        phone: "0555123457",
        roleId: "role-manager",
      });

      // Deactivate one
      await employeeModule.update(created.id, { id: created.id, status: "INACTIVE" });

      const active = await employeeModule.list({ status: "ACTIVE" });
      const inactive = await employeeModule.list({ status: "INACTIVE" });

      expect(active).toHaveLength(1);
      expect(inactive).toHaveLength(1);
      expect(inactive[0]?.id).toBe(created.id);
    });

    it("filters by roleId", async () => {
      seedWorkerRole();
      roleRepository.seed({
        id: "role-manager",
        key: "manager",
        name: "Manager",
        description: null,
        isSystem: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Worker",
        phone: "0555123456",
        roleId: "role-worker",
      });
      await employeeModule.create({
        firstName: "Fatima",
        lastName: "Manager",
        phone: "0555123457",
        roleId: "role-manager",
      });

      const workers = await employeeModule.list({ roleId: "role-worker" });
      const managers = await employeeModule.list({ roleId: "role-manager" });

      expect(workers).toHaveLength(1);
      expect(workers[0]?.firstName).toBe("Ahmed");
      expect(managers).toHaveLength(1);
      expect(managers[0]?.firstName).toBe("Fatima");
    });
  });

  describe("delete", () => {
    it("deletes an existing employee", async () => {
      seedWorkerRole();

      const created = await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
      });

      await employeeModule.delete(created.id);

      const found = await employeeModule.findById(created.id);
      expect(found).toBeNull();
    });

    it("throws when deleting non-existent employee", async () => {
      await expect(employeeModule.delete("non-existent")).rejects.toThrow(EmployeeNotFoundError);
    });
  });

  describe("update", () => {
    beforeEach(() => {
      seedWorkerRole();
      roleRepository.seed({
        id: "role-manager",
        key: "manager",
        name: "Manager",
        description: null,
        isSystem: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it("updates an employee with valid input", async () => {
      const created = await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
      });

      const updated = await employeeModule.update(created.id, {
        id: created.id,
        firstName: "Ahmed Updated",
      });

      expect(updated.firstName).toBe("Ahmed Updated");
      expect(updated.lastName).toBe("Ben Ali");
    });

    it("rejects update for non-existent employee", async () => {
      await expect(
        employeeModule.update("non-existent", { id: "non-existent", firstName: "X" })
      ).rejects.toThrow(EmployeeNotFoundError);
    });

    it("rejects update with non-existent role", async () => {
      const created = await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
      });

      await expect(
        employeeModule.update(created.id, { id: created.id, roleId: "non-existent-role" })
      ).rejects.toThrow(RoleNotFoundError);
    });

    it("accepts update with a valid existing role", async () => {
      const created = await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
      });

      // Promote worker to manager - role exists, so update should succeed
      const updated = await employeeModule.update(created.id, {
        id: created.id,
        roleId: "role-manager",
      });

      expect(updated.roleId).toBe("role-manager");
    });

    it("rejects update with duplicate phone", async () => {
      const first = await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
      });
      const second = await employeeModule.create({
        firstName: "Fatima",
        lastName: "Ben Ali",
        phone: "0555123457",
        roleId: "role-worker",
      });

      await expect(
        employeeModule.update(second.id, { id: second.id, phone: first.phone })
      ).rejects.toThrow(DuplicatePhoneError);
    });

    it("allows update to same phone (no conflict)", async () => {
      const created = await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
      });

      const updated = await employeeModule.update(created.id, {
        id: created.id,
        phone: "0555123456",
        firstName: "Ahmed",
      });

      expect(updated.phone).toBe("0555123456");
    });

    it("allows update to a new phone that no one owns (no conflict)", async () => {
      const created = await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
      });

      // Change to a completely new phone that no employee has
      const updated = await employeeModule.update(created.id, {
        id: created.id,
        phone: "0555999999",
        firstName: "Ahmed",
      });

      expect(updated.phone).toBe("0555999999");
    });

    it("rejects update when input.id does not match path id (ghost-record guard)", async () => {
      const created = await employeeModule.create({
        firstName: "Ahmed",
        lastName: "Ben Ali",
        phone: "0555123456",
        roleId: "role-worker",
      });

      // If a caller passes a different id in the body than in the path,
      // the module must NOT silently create a ghost record at the wrong id.
      // It should reject the request instead.
      await expect(
        employeeModule.update(created.id, {
          id: "different-id",
          firstName: "Updated",
        })
      ).rejects.toThrow(EmployeeNotFoundError);

      // Verify the original record is unchanged.
      const stillThere = await employeeModule.findById(created.id);
      expect(stillThere?.firstName).toBe("Ahmed");

      // Verify no ghost record was created.
      const ghost = await employeeModule.findById("different-id");
      expect(ghost).toBeNull();
    });
  });
});
