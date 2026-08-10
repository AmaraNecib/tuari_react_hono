import { describe, it, expect, beforeEach } from "vitest";

import { InMemoryEmployeeRepository } from "./adapters/in-memory-employee.repository";
import { InMemoryRoleRepository } from "./adapters/in-memory-role.repository";
import { EmployeeModule, type CreateEmployeeInput } from "./employee.module";

/**
 * Tests for EmployeeModule.listPaged.
 *
 * The module adds value over the raw repository by:
 * - Validating and normalizing page sizes (clamp, default)
 * - Throwing on invalid cursors (instead of silently returning nothing)
 * - Mapping internal records to the public Employee shape
 */
describe("EmployeeModule.listPaged", () => {
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

  // Fixed timestamp base so createdAt ordering is deterministic across runs.
  const baseTime = new Date("2024-01-01T00:00:00.000Z").getTime();
  let nowCounter = 0;

  beforeEach(() => {
    employeeRepository = new InMemoryEmployeeRepository();
    roleRepository = new InMemoryRoleRepository();
    nowCounter = 0;
    employeeModule = new EmployeeModule({
      employeeRepository,
      roleRepository,
      // Each call to now() returns a strictly-increasing timestamp so we
      // can order employees deterministically by insertion order.
      now: () => new Date(baseTime + nowCounter++).toISOString(),
    });
  });

  async function seedEmployees(count: number) {
    seedWorkerRole();
    for (let i = 0; i < count; i++) {
      await employeeModule.create({
        firstName: `First${i}`,
        lastName: `Last${i}`,
        phone: `0555${String(i).padStart(6, "0")}`,
        roleId: "role-worker",
      });
    }
  }

  it("returns empty result when no employees exist", async () => {
    const result = await employeeModule.listPaged({ limit: 10 });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.nextCursor).toBeNull();
  });

  it("returns all items on first page when fewer than limit", async () => {
    await seedEmployees(3);

    const result = await employeeModule.listPaged({ limit: 10 });

    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.nextCursor).toBeNull();
  });

  it("sorts by createdAt DESC (newest first)", async () => {
    await seedEmployees(3);

    const result = await employeeModule.listPaged({ limit: 10 });

    // Employees were created in order 0, 1, 2 with strictly increasing createdAt.
    // Descending order: 2, 1, 0.
    expect(result.items.map((e) => e.firstName)).toEqual(["First2", "First1", "First0"]);
  });

  it("paginates with cursor", async () => {
    await seedEmployees(5);

    const first = await employeeModule.listPaged({ limit: 2 });
    expect(first.items.map((e) => e.firstName)).toEqual(["First4", "First3"]);
    expect(first.total).toBe(5);
    expect(first.nextCursor).not.toBeNull();

    const second = await employeeModule.listPaged({ limit: 2, cursor: first.nextCursor! });
    expect(second.items.map((e) => e.firstName)).toEqual(["First2", "First1"]);
    expect(second.total).toBe(5);

    const third = await employeeModule.listPaged({ limit: 2, cursor: second.nextCursor! });
    expect(third.items.map((e) => e.firstName)).toEqual(["First0"]);
    expect(third.total).toBe(5);
    expect(third.nextCursor).toBeNull();
  });

  it("applies filters before pagination", async () => {
    await seedEmployees(4);
    // Deactivate two
    const first = (await employeeModule.list({ status: "ACTIVE" }))[0]!;
    await employeeModule.update(first.id, { id: first.id, status: "INACTIVE" });
    const second = (await employeeModule.list({ status: "ACTIVE" }))[0]!;
    await employeeModule.update(second.id, { id: second.id, status: "INACTIVE" });

    const result = await employeeModule.listPaged({
      limit: 10,
      filters: { status: "ACTIVE" },
    });

    expect(result.items.every((e) => e.status === "ACTIVE")).toBe(true);
    expect(result.total).toBe(2);
  });

  it("searches by name/phone across ALL records before pagination", async () => {
    // Employees First0/Last0 … First4/Last4, phones 0555000000 … 0555000004.
    await seedEmployees(5);

    // Search on last name: matches every record, but only First2/First1 on the page.
    const byLastName = await employeeModule.listPaged({
      limit: 2,
      filters: { search: "Last" },
    });
    expect(byLastName.items.map((e) => e.firstName)).toEqual(["First4", "First3"]);
    expect(byLastName.total).toBe(5);

    // Search on first name substring narrows to one record.
    const byFirstName = await employeeModule.listPaged({
      limit: 10,
      filters: { search: "First2" },
    });
    expect(byFirstName.items.map((e) => e.firstName)).toEqual(["First2"]);
    expect(byFirstName.total).toBe(1);

    // Search on phone digits.
    const byPhone = await employeeModule.listPaged({
      limit: 10,
      filters: { search: "000003" },
    });
    expect(byPhone.items.map((e) => e.firstName)).toEqual(["First3"]);
    expect(byPhone.total).toBe(1);
  });

  it("combines search with the status filter", async () => {
    await seedEmployees(3);
    const active = (await employeeModule.list({ status: "ACTIVE" }))[0]!;
    await employeeModule.update(active.id, { id: active.id, status: "INACTIVE" });

    const result = await employeeModule.listPaged({
      limit: 10,
      filters: { search: "First", status: "ACTIVE" },
    });

    expect(result.items.every((e) => e.status === "ACTIVE")).toBe(true);
    expect(result.total).toBe(2);
  });

  it("returns the unfiltered list for an empty or whitespace-only search", async () => {
    await seedEmployees(3);

    const empty = await employeeModule.listPaged({ limit: 10, filters: { search: "" } });
    expect(empty.total).toBe(3);

    const whitespace = await employeeModule.listPaged({
      limit: 10,
      filters: { search: "   " },
    });
    expect(whitespace.total).toBe(3);
  });

  it("uses default page size of 50 when limit is undefined", async () => {
    await seedEmployees(60);

    const result = await employeeModule.listPaged({});

    expect(result.items).toHaveLength(50);
    expect(result.total).toBe(60);
    expect(result.nextCursor).not.toBeNull();
  });

  it("clamps page size to max 100", async () => {
    await seedEmployees(120);

    const result = await employeeModule.listPaged({ limit: 9999 });

    expect(result.items).toHaveLength(100);
    expect(result.total).toBe(120);
  });

  it("clamps page size to min 1", async () => {
    await seedEmployees(3);

    const result = await employeeModule.listPaged({ limit: 0 });

    expect(result.items).toHaveLength(1);
  });

  it("throws when cursor is malformed", async () => {
    await seedEmployees(3);

    await expect(
      employeeModule.listPaged({ limit: 10, cursor: "not-a-cursor" }),
    ).rejects.toThrow();
  });

  it("items are public Employee shape (not raw records)", async () => {
    await seedEmployees(1);

    const result = await employeeModule.listPaged({ limit: 10 });
    const employee = result.items[0]!;

    // The Employee shape includes a known set of fields.
    expect(employee).toHaveProperty("id");
    expect(employee).toHaveProperty("firstName");
    expect(employee).toHaveProperty("lastName");
    expect(employee).toHaveProperty("phone");
    expect(employee).toHaveProperty("roleId");
    expect(employee).toHaveProperty("status");
    expect(employee).toHaveProperty("createdAt");
    expect(employee).toHaveProperty("updatedAt");
  });
});
