import { describe, it, expect, beforeEach } from "vitest";

import { InMemoryEmployeeRepository } from "./adapters/in-memory-employee.repository";
import { InMemoryRoleRepository } from "./adapters/in-memory-role.repository";
import { EmployeeModule } from "./employee.module";
import { EmployeeNotFoundError, DuplicatePhoneError, RoleNotFoundError } from "./employee.errors";

import type { CreateEmployeeInput } from "@tuari/contracts";

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
      await roleRepository.save({
        id: "role-worker",
        key: "worker",
        name: "Worker",
        description: null,
        isSystem: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

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
      });
      expect(employee.id).toBeDefined();
      expect(employee.createdAt).toBeDefined();
    });

    it("rejects creation with duplicate phone number", async () => {
      await roleRepository.save({
        id: "role-worker",
        key: "worker",
        name: "Worker",
        description: null,
        isSystem: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

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
      await roleRepository.save({
        id: "role-worker",
        key: "worker",
        name: "Worker",
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
      await roleRepository.save({
        id: "role-worker",
        key: "worker",
        name: "Worker",
        description: null,
        isSystem: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

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
  });

  describe("delete", () => {
    it("deletes an existing employee", async () => {
      await roleRepository.save({
        id: "role-worker",
        key: "worker",
        name: "Worker",
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

      await employeeModule.delete(created.id);

      const found = await employeeModule.findById(created.id);
      expect(found).toBeNull();
    });

    it("throws when deleting non-existent employee", async () => {
      await expect(employeeModule.delete("non-existent")).rejects.toThrow(EmployeeNotFoundError);
    });
  });

  describe("update", () => {
    beforeEach(async () => {
      await roleRepository.save({
        id: "role-worker",
        key: "worker",
        name: "Worker",
        description: null,
        isSystem: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await roleRepository.save({
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
  });
});
