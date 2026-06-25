import { describe, it, expect, beforeEach } from "vitest";

import { EmployeeModule } from "../../modules/workforce/employee.module";
import { InMemoryEmployeeRepository } from "../../modules/workforce/adapters/in-memory-employee.repository";
import { InMemoryRoleRepository } from "../../modules/workforce/adapters/in-memory-role.repository";

// ---------------------------------------------------------------------------
// Suite: Pagination consistency
// ---------------------------------------------------------------------------

describe("Cross-domain: Pagination consistency", () => {
  let module: EmployeeModule;
  let employeeRepo: InMemoryEmployeeRepository;
  let roleRepo: InMemoryRoleRepository;

  beforeEach(() => {
    employeeRepo = new InMemoryEmployeeRepository();
    roleRepo = new InMemoryRoleRepository();
    // Seed default roles
    roleRepo.seed({ id: "role-worker", key: "worker", name: "Worker", description: null, isSystem: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    roleRepo.seed({ id: "role-manager", key: "manager", name: "Manager", description: null, isSystem: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    module = new EmployeeModule({
      employeeRepository: employeeRepo,
      roleRepository: roleRepo,
      now: () => "2026-01-01T00:00:00.000Z",
    });
  });

  async function seedEmployees(count: number, phonePrefix = "0555000") {
    const created: string[] = [];
    for (let i = 1; i <= count; i++) {
      const emp = await module.create({
        firstName: `Emp${i}`,
        lastName: "Test",
        phone: `${phonePrefix}${String(i).padStart(3, "0")}`,
        roleId: "role-worker",
      });
      created.push(emp.id);
    }
    return created;
  }

  // -----------------------------------------------------------------------
  // Basic pagination
  // -----------------------------------------------------------------------

  it("returns first page with correct count and total", async () => {
    await seedEmployees(5);

    const page = await module.listPaged({ limit: 3 });

    expect(page.items).toHaveLength(3);
    expect(page.total).toBe(5);
    expect(page.nextCursor).not.toBeNull();
  });

  it("returns empty page when no records exist", async () => {
    const page = await module.listPaged({ limit: 10 });

    expect(page.items).toHaveLength(0);
    expect(page.total).toBe(0);
    expect(page.nextCursor).toBeNull();
  });

  it("returns last page with hasMore=false", async () => {
    await seedEmployees(3);

    const page = await module.listPaged({ limit: 5 });

    expect(page.items).toHaveLength(3);
    expect(page.total).toBe(3);
    expect(page.nextCursor).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Cursor traversal
  // -----------------------------------------------------------------------

  it("traverses forward through pages consistently", async () => {
    await seedEmployees(10);

    // Page 1
    const p1 = await module.listPaged({ limit: 3 });
    expect(p1.items).toHaveLength(3);
    expect(p1.nextCursor).not.toBeNull();

    // Page 2
    const p2 = await module.listPaged({ cursor: p1.nextCursor!, limit: 3 });
    expect(p2.items).toHaveLength(3);
    expect(p2.nextCursor).not.toBeNull();

    // Page 3
    const p3 = await module.listPaged({ cursor: p2.nextCursor!, limit: 3 });
    expect(p3.items).toHaveLength(3);
    expect(p3.nextCursor).not.toBeNull();

    // Page 4 (last)
    const p4 = await module.listPaged({ cursor: p3.nextCursor!, limit: 3 });
    expect(p4.items).toHaveLength(1);
    expect(p4.total).toBe(10);
    expect(p4.nextCursor).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Consistency when records are added between page fetches
  // (cursor pagination guarantees no duplicates — it does NOT guarantee
  // late-arriving records with higher sort precedence are included)
  // -----------------------------------------------------------------------

  it("new records with earlier timestamps are included on subsequent pages", async () => {
    // Use a ticker to give each employee a unique, ascending timestamp
    let tick = 1;
    const ticker = () => `2026-01-${String(tick++).padStart(2, "0")}T00:00:00.000Z`;
    const tickModule = new EmployeeModule({
      employeeRepository: employeeRepo,
      roleRepository: roleRepo,
      now: ticker,
    });

    // Seed 5 "newer" employees first (timestamps Jan-01 through Jan-05)
    for (let i = 1; i <= 5; i++) {
      await tickModule.create({
        firstName: `Newest${i}`,
        lastName: "Test",
        phone: `0555000${String(i).padStart(3, "0")}`,
        roleId: "role-worker",
      });
    }

    // Fetch page 1 (limit 3) — gets the 3 newest (Jan-05, Jan-04, Jan-03)
    const p1 = await module.listPaged({ limit: 3 });
    expect(p1.items).toHaveLength(3);

    // Now insert 5 "older" employees (timestamps Jan-06 through Jan-10)
    // Because timestamps are ascending, these have LATER timestamps.
    // But wait — let me think. tick started at 1. After first batch of 5,
    // tick is 6. So the second batch gets Jan-06 through Jan-10, which
    // are LATER than the first batch. In descending sort they come BEFORE.
    //
    // To test the "sort after cursor" case, we need the second batch to
    // have EARLIER timestamps. So let's use the main module (constant
    // timestamp) for the older records.
    for (let i = 1; i <= 5; i++) {
      await module.create({
        firstName: `Older${i}`,
        lastName: "Test",
        phone: `0555111${String(i).padStart(3, "0")}`,
        roleId: "role-worker",
      });
    }

    // Sort order: Newest5..1 (Jan-05..Jan-01), then Older1..5 (Jan-01 const)
    // All the OLDER records sort at the end. The cursor from p1 (at Jan-03)
    // correctly resumes PAST the newest batch into the older batch.
    const seen = new Set(p1.items.map((e) => e.id));
    let cursor = p1.nextCursor;

    while (cursor) {
      const page = await module.listPaged({ cursor, limit: 3 });
      expect(page.items.length).toBeGreaterThan(0);
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      cursor = page.nextCursor;
    }

    expect(seen.size).toBe(10);
  });

  it("inserted records with different timestamps do not cause skipped pages", async () => {
    // Create 5 employees with a "later" timestamp
    const laterNow = () => "2026-01-02T00:00:00.000Z";
    const laterModule = new EmployeeModule({
      employeeRepository: employeeRepo,
      roleRepository: roleRepo,
      now: laterNow,
    });
    for (let i = 1; i <= 5; i++) {
      await laterModule.create({
        firstName: `Later${i}`,
        lastName: "Test",
        phone: `0777000${String(i).padStart(3, "0")}`,
        roleId: "role-worker",
      });
    }

    // Fetch page 1 (limit 3) — should see Later employees first (newest)
    const p1 = await module.listPaged({ limit: 3 });
    expect(p1.items).toHaveLength(3);
    expect(p1.nextCursor).not.toBeNull();

    // Insert 5 "early" employees (default timestamp = older)
    for (let i = 1; i <= 5; i++) {
      await module.create({
        firstName: `Early${i}`,
        lastName: "Test",
        phone: `0666000${String(i).padStart(3, "0")}`,
        roleId: "role-worker",
      });
    }

    // Collect all IDs across pages — should see 10 unique
    const seen = new Set(p1.items.map((e) => e.id));
    let cursor = p1.nextCursor;

    while (cursor) {
      const page = await module.listPaged({ cursor, limit: 3 });
      expect(page.items.length).toBeGreaterThan(0);
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      cursor = page.nextCursor;
    }

    expect(seen.size).toBe(10);
  });

  // -----------------------------------------------------------------------
  // Filtered pagination
  // -----------------------------------------------------------------------

  it("paginates within filtered results", async () => {
    // Create 3 workers and 2 managers
    for (let i = 1; i <= 3; i++) {
      await module.create({
        firstName: `Worker${i}`,
        lastName: "Test",
        phone: `0888000${String(i).padStart(3, "0")}`,
        roleId: "role-worker",
      });
    }
    for (let i = 1; i <= 2; i++) {
      await module.create({
        firstName: `Mgr${i}`,
        lastName: "Test",
        phone: `0999000${String(i).padStart(3, "0")}`,
        roleId: "role-manager",
      });
    }

    // Filter by roleId=role-worker
    const p1 = await module.listPaged({
      filters: { roleId: "role-worker" },
      limit: 2,
    });
    expect(p1.items).toHaveLength(2);
    expect(p1.total).toBe(3);
    expect(p1.nextCursor).not.toBeNull();

    const p2 = await module.listPaged({
      filters: { roleId: "role-worker" },
      cursor: p1.nextCursor!,
      limit: 2,
    });
    expect(p2.items).toHaveLength(1);
    expect(p2.total).toBe(3);
    expect(p2.nextCursor).toBeNull();
  });
});
