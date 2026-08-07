import { afterEach, describe, expect, it } from "vitest";

import { CompanyError } from "./company.errors";
import { createInMemoryCompanyHarness } from "./company.test-helpers";

describe("WorkforceService coverage branches", () => {
  const harnesses: Array<ReturnType<typeof createInMemoryCompanyHarness>> = [];

  afterEach(() => {
    while (harnesses.length > 0) {
      harnesses.pop()?.close();
    }
  });

  const createHarness = () => {
    const harness = createInMemoryCompanyHarness();
    harnesses.push(harness);
    return harness;
  };

  const audit = () => ({
    actorLabel: "مدير التشغيل",
    actorUserId: "admin-user-1",
    transactionId: crypto.randomUUID(),
  });

  describe("roles", () => {
    it("getRole resolves an existing role and rejects a missing one", () => {
      const { service, roleIds } = createHarness();
      expect(service.getRole(roleIds.worker).item.key).toBe("worker");
      expect(() => service.getRole("missing-role")).toThrowError(CompanyError);
    });

    it("createRole and updateRole are stubbed with BUSINESS_RULE", () => {
      const { service, roleIds } = createHarness();
      expect(() =>
        service.createRole({ key: "custom", name: "دور مخصص", description: null }),
      ).toThrowError(CompanyError);
      expect(() =>
        service.updateRole({ id: roleIds.worker, key: "custom" }),
      ).toThrowError(CompanyError);
    });
  });

  describe("read lists", () => {
    it("listEmployeeStateHistory, listSalaryPayments and getEmployee delegate to the repository", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "سجل",
        phone: "0554000001",
        roleId: roleIds.worker,
        status: "ACTIVE",
        salaryAmountDzd: 45000,
        salaryPeriod: "MONTHLY",
      }).item;
      service.createSalaryPayment({ employeeId: worker.id, actualAmountDzd: 45000 }, audit());
      expect(service.listEmployeeStateHistory().items.length).toBeGreaterThan(0);
      expect(service.listSalaryPayments().items.length).toBeGreaterThan(0);
      expect(service.getEmployee(worker.id).item.id).toBe(worker.id);
      expect(() => service.getEmployee("missing")).toThrowError(CompanyError);
    });
  });

  describe("createEmployee phone conflict", () => {
    it("rejects a duplicate phone", () => {
      const { service, roleIds } = createHarness();
      service.createEmployee({
        firstName: "عامل",
        lastName: "مكرر",
        phone: "0554000002",
        roleId: roleIds.worker,
        status: "ACTIVE",
      });
      expect(() =>
        service.createEmployee({
          firstName: "عامل",
          lastName: "ثان",
          phone: "0554000002",
          roleId: roleIds.worker,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects salary amount without period and period without amount", () => {
      const { service, roleIds } = createHarness();
      expect(() =>
        service.createEmployee({
          firstName: "عامل",
          lastName: "أجر",
          phone: "0554000032",
          roleId: roleIds.worker,
          status: "ACTIVE",
          salaryAmountDzd: 5000,
        }),
      ).toThrowError(CompanyError);
      expect(() =>
        service.createEmployee({
          firstName: "عامل",
          lastName: "دورية",
          phone: "0554000033",
          roleId: roleIds.worker,
          status: "ACTIVE",
          salaryPeriod: "MONTHLY",
        }),
      ).toThrowError(CompanyError);
    });
  });

  describe("createEmployeesBatch field errors", () => {
    const batch = (employees: Array<Record<string, unknown>>) => ({
      employees: employees.map((e) => ({
        firstName: "عامل",
        lastName: "دفعة",
        phone: "0554000003",
        roleId: "",
        status: "ACTIVE" as const,
        salaryAmountDzd: null,
        salaryPeriod: null,
        notes: null,
        managerId: null,
        projectId: null,
        ...e,
      })),
    });

    it("reports a missing role id", () => {
      const { service } = createHarness();
      expect(() => service.createEmployeesBatch(batch([{ roleId: "missing-role" }]))).toThrowError(
        CompanyError,
      );
    });

    it("reports a non-system role id", () => {
      const { service, database } = createHarness();
      const now = new Date().toISOString();
      database
        .prepare(
          'INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
        )
        .run("custom-role", "custom", "دور مخصص", null, now, now);
      expect(() =>
        service.createEmployeesBatch(batch([{ roleId: "custom-role" }])),
      ).toThrowError(CompanyError);
    });

    it("reports duplicate phones within the batch and phones already in use", () => {
      const { service, roleIds } = createHarness();
      service.createEmployee({
        firstName: "عامل",
        lastName: "موجود",
        phone: "0554000004",
        roleId: roleIds.worker,
        status: "ACTIVE",
      });
      expect(() =>
        service.createEmployeesBatch(
          batch([
            { roleId: roleIds.worker, phone: "0554000004" },
            { roleId: roleIds.worker, phone: "0554000004" },
          ]),
        ),
      ).toThrowError(CompanyError);
    });

    it("reports salary amount without period and period without amount", () => {
      const { service, roleIds } = createHarness();
      expect(() =>
        service.createEmployeesBatch(
          batch([
            { roleId: roleIds.worker, salaryAmountDzd: 5000 },
            { roleId: roleIds.worker, salaryPeriod: "MONTHLY" },
          ]),
        ),
      ).toThrowError(CompanyError);
    });

    it("reports manager/project ids on non-worker roles", () => {
      const { service, roleIds } = createHarness();
      expect(() =>
        service.createEmployeesBatch(
          batch([
            { roleId: roleIds.projectManager, managerId: "m1" },
            { roleId: roleIds.projectManager, projectId: "p1" },
          ]),
        ),
      ).toThrowError(CompanyError);
    });

    it("reports a missing manager, non-project-manager manager, or inactive manager", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "تحت",
        phone: "0554000005",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const inactiveManager = service.createEmployee({
        firstName: "مدير",
        lastName: "خامل",
        phone: "0554000006",
        roleId: roleIds.projectManager,
        status: "INACTIVE",
      }).item;
      expect(() =>
        service.createEmployeesBatch(
          batch([
            { roleId: roleIds.worker, managerId: "missing-manager", projectId: "p1" },
            { roleId: roleIds.worker, managerId: worker.id, projectId: "p1" },
            { roleId: roleIds.worker, managerId: inactiveManager.id, projectId: "p1" },
          ]),
        ),
      ).toThrowError(CompanyError);
    });

    it("reports a missing/inactive/mismatched project", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مشروع",
        phone: "0554000007",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const otherManager = service.createEmployee({
        firstName: "مدير",
        lastName: "آخر",
        phone: "0554000008",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const stopped = service.createProject({ name: "متوقف", status: "STOPPED", managerId: manager.id }).item;
      const other = service
        .createProject({ name: "مشروع آخر", status: "ACTIVE", managerId: otherManager.id })
        .item;
      expect(() =>
        service.createEmployeesBatch(
          batch([
            { roleId: roleIds.worker, managerId: manager.id, projectId: "missing-project" },
            { roleId: roleIds.worker, managerId: manager.id, projectId: stopped.id },
            { roleId: roleIds.worker, managerId: manager.id, projectId: other.id },
          ]),
        ),
      ).toThrowError(CompanyError);
    });

    it("reports active worker without manager and without project", () => {
      const { service, roleIds } = createHarness();
      expect(() =>
        service.createEmployeesBatch(
          batch([
            { roleId: roleIds.worker, status: "ACTIVE" },
            { roleId: roleIds.worker, status: "ACTIVE", managerId: "m1" },
          ]),
        ),
      ).toThrowError(CompanyError);
    });

    it("reports an inactive worker carrying manager or project links", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "دفعة",
        phone: "0554000034",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      expect(() =>
        service.createEmployeesBatch(
          batch([
            { roleId: roleIds.worker, status: "INACTIVE", managerId: manager.id, projectId: "p1" },
            { roleId: roleIds.worker, status: "LEFT", managerId: manager.id },
            { roleId: roleIds.worker, status: "LEFT", projectId: "p2" },
          ]),
        ),
      ).toThrowError(CompanyError);
    });

    it("reports an active worker with a valid manager but no project", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "دفعة",
        phone: "0554000035",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      expect(() =>
        service.createEmployeesBatch(
          batch([{ roleId: roleIds.worker, status: "ACTIVE", managerId: manager.id }]),
        ),
      ).toThrowError(CompanyError);
    });
  });

  describe("updateEmployee guards", () => {
    it("rejects changing a non-worker role to an active worker role", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "لتحويل",
        phone: "0554000009",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      expect(() =>
        service.updateEmployee({ id: manager.id, roleId: roleIds.worker, status: "ACTIVE" }, audit()),
      ).toThrowError(CompanyError);
    });

    it("rejects changing to a phone already used by another employee", () => {
      const { service, roleIds } = createHarness();
      service.createEmployee({
        firstName: "عامل",
        lastName: "أول",
        phone: "0554000010",
        roleId: roleIds.worker,
        status: "ACTIVE",
      });
      const second = service.createEmployee({
        firstName: "عامل",
        lastName: "ثان",
        phone: "0554000011",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      expect(() =>
        service.updateEmployee({ id: second.id, phone: "0554000010" }, audit()),
      ).toThrowError(CompanyError);
    });

    it("allows keeping the same phone while updating other fields", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "تحديث",
        phone: "0554000012",
        roleId: roleIds.worker,
        status: "ACTIVE",
        salaryAmountDzd: 30000,
        salaryPeriod: "MONTHLY",
      }).item;
      const updated = service.updateEmployee({ id: worker.id, phone: "0554000012" }, audit()).item;
      expect(updated.firstName).toBe("عامل");
    });

    it("accepts a padded (same-number) phone without triggering the conflict guard", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مسافة",
        phone: "0554000036",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const updated = service.updateEmployee({ id: worker.id, phone: "  0554000036  " }, audit()).item;
      expect(updated.phone).toBe("0554000036");
    });

    it("updates the salary fields and enforces amount/period pairing", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "رواتب",
        phone: "0554000037",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const updated = service.updateEmployee(
        { id: worker.id, salaryAmountDzd: 60000, salaryPeriod: "MONTHLY" },
        audit(),
      ).item;
      expect(updated.salaryAmountDzd).toBe(60000);
      expect(updated.salaryPeriod).toBe("MONTHLY");

      // Amount without a period (employee has no configured period) -> validation error
      const noPeriod = service.createEmployee({
        firstName: "عامل",
        lastName: "بدون دورية",
        phone: "0554000038",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      expect(() =>
        service.updateEmployee({ id: noPeriod.id, salaryAmountDzd: 5000 }, audit()),
      ).toThrowError(CompanyError);

      // Period without an amount -> validation error
      const noAmount = service.createEmployee({
        firstName: "عامل",
        lastName: "بدون أجر",
        phone: "0554000039",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      expect(() =>
        service.updateEmployee({ id: noAmount.id, salaryPeriod: "MONTHLY" }, audit()),
      ).toThrowError(CompanyError);
    });
  });

  describe("deleteEmployee / salary payment guards", () => {
    it("rejects deleting a missing employee", () => {
      const { service } = createHarness();
      expect(() => service.deleteEmployee("missing", audit())).toThrowError(CompanyError);
    });

    it("rejects a salary payment when the employee has no configured salary", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "بدون أجر",
        phone: "0554000013",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      expect(() =>
        service.createSalaryPayment({ employeeId: worker.id, actualAmountDzd: 1000 }, audit()),
      ).toThrowError(CompanyError);
    });
  });

  describe("manager assignment guards", () => {
    it("getManagerAssignment rejects a missing id", () => {
      const { service } = createHarness();
      expect(() => service.getManagerAssignment("missing")).toThrowError(CompanyError);
    });

    it("creates non-active manager assignments and ends active ones with notes", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "ربط",
        phone: "0554000014",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "ربط",
        phone: "0554000015",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      // Non-active assignment: skips the active guards and supplies endDate
      const ended = service.createManagerAssignment({
        workerId: worker.id,
        managerId: manager.id,
        status: "ENDED",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-02-01T00:00:00.000Z",
      }).item;
      expect(ended.status).toBe("ENDED");
      expect(ended.endDate).toBe("2026-02-01T00:00:00.000Z");

      // Non-active assignment with no endDate -> endDate defaults to null
      const noEnd = service.createManagerAssignment({
        workerId: worker.id,
        managerId: manager.id,
        status: "ARCHIVED",
        startDate: "2026-01-01T00:00:00.000Z",
      }).item;
      expect(noEnd.endDate).toBeNull();

      // Ending an ACTIVE assignment with a note
      const active = service.createManagerAssignment({
        workerId: worker.id,
        managerId: manager.id,
        status: "ACTIVE",
        startDate: "2026-03-01T00:00:00.000Z",
      }).item;
      const endedWithNote = service.endManagerAssignment(
        { id: active.id, endDate: "2026-06-01T00:00:00.000Z", notes: "نقل" },
        audit(),
      ).item;
      expect(endedWithNote.notes).toBe("نقل");
    });

    it("endManagerAssignment rejects missing, non-active, and active-project cases", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "ربط",
        phone: "0554000014",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "ربط",
        phone: "0554000015",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const assignment = service.createManagerAssignment({
        workerId: worker.id,
        managerId: manager.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      }).item;

      expect(() =>
        service.endManagerAssignment({ id: "missing", endDate: "2026-06-01T00:00:00.000Z" }, audit()),
      ).toThrowError(CompanyError);

      // End it once, then ending again is rejected (non-active)
      service.endManagerAssignment({ id: assignment.id, endDate: "2026-06-01T00:00:00.000Z" }, audit());
      expect(() =>
        service.endManagerAssignment({ id: assignment.id, endDate: "2026-07-01T00:00:00.000Z" }, audit()),
      ).toThrowError(CompanyError);
    });

    it("rejects ending a manager assignment while the worker has an active project", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مشغول",
        phone: "0554000016",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مشغول",
        phone: "0554000017",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager.id }).item;
      service.createManagerAssignment({
        workerId: worker.id,
        managerId: manager.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      });
      service.createProjectAssignment({
        employeeId: worker.id,
        projectId: project.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      });
      const assignment = service.listManagerAssignments({ workerId: worker.id }).items[0]!;
      expect(() =>
        service.endManagerAssignment({ id: assignment.id, endDate: "2026-06-01T00:00:00.000Z" }, audit()),
      ).toThrowError(CompanyError);
    });
  });

  describe("assignEmployeeWorkplace guards", () => {
    it("rejects non-active employees and non-worker roles", () => {
      const { service, roleIds } = createHarness();
      const inactive = service.createEmployee({
        firstName: "عامل",
        lastName: "خامل",
        phone: "0554000018",
        roleId: roleIds.worker,
        status: "INACTIVE",
      }).item;
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "موقع",
        phone: "0554000019",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      expect(() =>
        service.assignEmployeeWorkplace({ employeeId: inactive.id, nextType: "PROJECT" }, audit()),
      ).toThrowError(CompanyError);
      expect(() =>
        service.assignEmployeeWorkplace({ employeeId: manager.id, nextType: "PROJECT" }, audit()),
      ).toThrowError(CompanyError);
    });

    it("rejects a missing manager, missing project, inactive project, and mismatched project", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مواقع",
        phone: "0554000020",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const otherManager = service.createEmployee({
        firstName: "مدير",
        lastName: "أجنبي",
        phone: "0554000021",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مواقع",
        phone: "0554000022",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const stopped = service.createProject({ name: "متوقف", status: "STOPPED", managerId: manager.id }).item;
      const other = service
        .createProject({ name: "مشروع أجنبي", status: "ACTIVE", managerId: otherManager.id })
        .item;

      expect(() =>
        service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "PROJECT" }, audit()),
      ).toThrowError(CompanyError);
      expect(() =>
        service.assignEmployeeWorkplace(
          { employeeId: worker.id, nextType: "PROJECT", managerId: manager.id },
          audit(),
        ),
      ).toThrowError(CompanyError);
      expect(() =>
        service.assignEmployeeWorkplace(
          { employeeId: worker.id, nextType: "PROJECT", managerId: manager.id, projectId: stopped.id },
          audit(),
        ),
      ).toThrowError(CompanyError);
      expect(() =>
        service.assignEmployeeWorkplace(
          { employeeId: worker.id, nextType: "PROJECT", managerId: manager.id, projectId: other.id },
          audit(),
        ),
      ).toThrowError(CompanyError);
    });

    it("rejects WAREHOUSE nextType", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مخزن",
        phone: "0554000023",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      expect(() =>
        service.assignEmployeeWorkplace(
          { employeeId: worker.id, nextType: "WAREHOUSE", warehouseId: "w1" },
          audit(),
        ),
      ).toThrowError(CompanyError);
    });

    it("applies a PROJECT workplace assignment end-to-end", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "تنفيذ",
        phone: "0554000024",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "تنفيذ",
        phone: "0554000025",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager.id }).item;
      const result = service.assignEmployeeWorkplace(
        { employeeId: worker.id, nextType: "PROJECT", managerId: manager.id, projectId: project.id },
        audit(),
      );
      expect(result.success).toBe(true);
      const assignments = service.listProjectAssignments({ employeeId: worker.id }).items;
      expect(assignments).toHaveLength(1);
      expect(assignments[0]?.projectId).toBe(project.id);
    });

    it("unassigns all workplace links with nextType NONE", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "إزالة",
        phone: "0554000040",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "إزالة",
        phone: "0554000041",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager.id }).item;
      service.assignEmployeeWorkplace(
        { employeeId: worker.id, nextType: "PROJECT", managerId: manager.id, projectId: project.id },
        audit(),
      );
      const result = service.assignEmployeeWorkplace(
        { employeeId: worker.id, nextType: "NONE" },
        audit(),
      );
      expect(result.success).toBe(true);
      expect(service.listManagerAssignments({ workerId: worker.id }).items[0]?.status).toBe("ENDED");
      expect(service.listProjectAssignments({ employeeId: worker.id }).items[0]?.status).toBe("ENDED");
    });
  });

  describe("sync guards", () => {
    it("syncManagedProjects rejects non-active and other-manager projects", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مزامنة",
        phone: "0554000026",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const otherManager = service.createEmployee({
        firstName: "مدير",
        lastName: "مزامنة أخرى",
        phone: "0554000027",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const stopped = service.createProject({ name: "متوقف", status: "STOPPED" }).item;
      const other = service
        .createProject({ name: "مشروع مدير آخر", status: "ACTIVE", managerId: otherManager.id })
        .item;
      expect(() =>
        service.syncManagedProjects({ employeeId: manager.id, projectIds: [stopped.id] }),
      ).toThrowError(CompanyError);
      expect(() =>
        service.syncManagedProjects({ employeeId: manager.id, projectIds: [other.id] }),
      ).toThrowError(CompanyError);
    });

    it("syncManagedWarehouses rejects non-active and other-manager warehouses", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مخازن",
        phone: "0554000028",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      }).item;
      const otherManager = service.createEmployee({
        firstName: "مدير",
        lastName: "مخازن أخرى",
        phone: "0554000029",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      }).item;
      const archived = service.createWarehouse({ name: "مؤرشف", status: "ARCHIVED" }).item;
      const other = service
        .createWarehouse({ name: "مستودع آخر", status: "ACTIVE", managerId: otherManager.id })
        .item;
      expect(() =>
        service.syncManagedWarehouses({ employeeId: manager.id, warehouseIds: [archived.id] }),
      ).toThrowError(CompanyError);
      expect(() =>
        service.syncManagedWarehouses({ employeeId: manager.id, warehouseIds: [other.id] }),
      ).toThrowError(CompanyError);
    });

    it("syncManagedProjects removes a project only after the transition is allowed", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "إزالة",
        phone: "0554000030",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "إزالة",
        phone: "0554000031",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager.id }).item;
      service.createManagerAssignment({
        workerId: worker.id,
        managerId: manager.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      });
      service.createProjectAssignment({
        employeeId: worker.id,
        projectId: project.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      });
      // Removing the project while a worker is still assigned must be rejected
      expect(() =>
        service.syncManagedProjects({ employeeId: manager.id, projectIds: [] }),
      ).toThrowError(CompanyError);
    });
  });
});
