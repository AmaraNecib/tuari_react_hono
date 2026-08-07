import { afterEach, describe, expect, it } from "vitest";

import { CompanyError } from "./company.errors";
import { createAuditContext, createCompanyHarnessTracker } from "./company.test-helpers";

describe("OperationsService coverage branches", () => {
  const { createHarness, closeAll } = createCompanyHarnessTracker();

  afterEach(closeAll);

  const audit = () => createAuditContext();

  const seedManagerAndWorker = (
    service: ReturnType<typeof createHarness>["service"],
    roleIds: ReturnType<typeof createHarness>["roleIds"],
    prefix: string,
  ) => {
    const manager = service.createEmployee({
      firstName: "مدير",
      lastName: prefix,
      phone: `066${prefix}0001`,
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "عامل",
      lastName: prefix,
      phone: `066${prefix}0002`,
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const project = service.createProject({ name: `مشروع ${prefix}`, status: "ACTIVE", managerId: manager.id }).item;
    service.createManagerAssignment({
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE",
      startDate: "2026-01-01T00:00:00.000Z",
    });
    return { manager, worker, project };
  };

  describe("getProject / getWarehouse", () => {
    it("returns the project and warehouse for existing ids", () => {
      const { service } = createHarness();
      const project = service.createProject({ name: "مشروع", status: "ACTIVE" }).item;
      const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
      expect(service.getProject(project.id).item.id).toBe(project.id);
      expect(service.getWarehouse(warehouse.id).item.id).toBe(warehouse.id);
    });

    it("throws NOT_FOUND for missing projects and warehouses", () => {
      const { service } = createHarness();
      expect(() => service.getProject("missing")).toThrowError(CompanyError);
      expect(() => service.getWarehouse("missing")).toThrowError(CompanyError);
    });
  });

  describe("updateProject", () => {
    it("rejects an inactive non-project-manager as the new manager", () => {
      const { service, roleIds } = createHarness();
      const project = service.createProject({ name: "مشروع", status: "ACTIVE" }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مدير خاطئ",
        phone: "0662000001",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      expect(() => service.updateProject({ id: project.id, managerId: worker.id }, audit())).toThrowError(
        CompanyError,
      );
    });

    it("reassigns the manager when the current manager changes to another project manager", () => {
      const { service, roleIds } = createHarness();
      const manager1 = service.createEmployee({
        firstName: "مدير",
        lastName: "أول",
        phone: "0662000002",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const manager2 = service.createEmployee({
        firstName: "مدير",
        lastName: "ثان",
        phone: "0662000003",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager1.id }).item;
      const updated = service.updateProject({ id: project.id, managerId: manager2.id }, audit()).item;
      expect(updated.managerId).toBe(manager2.id);
    });

    it("updates project location and notes", () => {
      const { service } = createHarness();
      const project = service.createProject({ name: "مشروع", status: "ACTIVE" }).item;
      const updated = service.updateProject(
        { id: project.id, location: "الجزائر العاصمة", notes: "ملاحظة مشروع" },
        audit(),
      ).item;
      expect(updated.location).toBe("الجزائر العاصمة");
      expect(updated.notes).toBe("ملاحظة مشروع");
    });
  });

  describe("updateWarehouse", () => {
    it("reassigns the manager to another active warehouse manager and updates fields", () => {
      const { service, roleIds } = createHarness();
      const manager1 = service.createEmployee({
        firstName: "مدير",
        lastName: "مخزن أول",
        phone: "0664000001",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      }).item;
      const manager2 = service.createEmployee({
        firstName: "مدير",
        lastName: "مخزن ثان",
        phone: "0664000002",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      }).item;
      const warehouse = service
        .createWarehouse({ name: "مستودع", status: "ACTIVE", managerId: manager1.id })
        .item;
      const updated = service.updateWarehouse(
        { id: warehouse.id, managerId: manager2.id, address: "عنوان جديد", notes: "ملاحظة" },
        audit(),
      ).item;
      expect(updated.managerId).toBe(manager2.id);
      expect(updated.address).toBe("عنوان جديد");
      expect(updated.notes).toBe("ملاحظة");
    });
  });

  describe("getProjectAssignment", () => {
    it("returns an existing assignment and rejects a missing one", () => {
      const { service, roleIds } = createHarness();
      const { worker, project } = seedManagerAndWorker(service, roleIds, "3001");
      const assignment = service.createProjectAssignment({
        employeeId: worker.id,
        projectId: project.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      }).item;
      expect(service.getProjectAssignment(assignment.id).item.id).toBe(assignment.id);
      expect(() => service.getProjectAssignment("missing")).toThrowError(CompanyError);
    });
  });

  describe("createProjectAssignment guards", () => {
    it("creates a non-active project assignment without the active guards", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "ربط منتهي",
        phone: "0664000003",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({ name: "مشروع", status: "ACTIVE" }).item;
      const assignment = service.createProjectAssignment({
        employeeId: worker.id,
        projectId: project.id,
        status: "ENDED",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-02-01T00:00:00.000Z",
      }).item;
      expect(assignment.status).toBe("ENDED");
      expect(assignment.endDate).toBe("2026-02-01T00:00:00.000Z");

      // A non-active assignment with no endDate defaults it to null.
      const noEnd = service.createProjectAssignment({
        employeeId: worker.id,
        projectId: project.id,
        status: "ARCHIVED",
        startDate: "2026-01-01T00:00:00.000Z",
      }).item;
      expect(noEnd.endDate).toBeNull();
    });

    it("rejects a disallowed employee role for an active assignment", () => {
      const { service, database } = createHarness();
      const project = service.createProject({ name: "مشروع", status: "ACTIVE" }).item;
      const now = new Date().toISOString();
      database
        .prepare(
          'INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, NULL, 0, ?, ?)',
        )
        .run("custom-role", "custom", "دور مخصص", now, now);
      database
        .prepare(
          'INSERT INTO "employee" (id, first_name, last_name, phone, role_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run("custom-emp", "موظف", "مخصص", "0664000004", "custom-role", "ACTIVE", now, now);
      expect(() =>
        service.createProjectAssignment({
          employeeId: "custom-emp",
          projectId: project.id,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects a worker that already has an active warehouse assignment", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مخزن ثم مشروع",
        phone: "0664000005",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
      service.createWarehouseAssignment({
        employeeId: worker.id,
        warehouseId: warehouse.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      });
      const project = service.createProject({ name: "مشروع", status: "ACTIVE" }).item;
      expect(() =>
        service.createProjectAssignment({
          employeeId: worker.id,
          projectId: project.id,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects a missing employee", () => {
      const { service } = createHarness();
      const project = service.createProject({ name: "مشروع", status: "ACTIVE" }).item;
      expect(() =>
        service.createProjectAssignment({
          employeeId: "missing",
          projectId: project.id,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects an employee whose role is missing", () => {
      const { service, database, roleIds } = createHarness();
      const project = service.createProject({ name: "مشروع", status: "ACTIVE" }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "بدون دور",
        phone: "0663000001",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      // Temporarily relax FK enforcement so the employee's role reference dangles.
      database.pragma("foreign_keys = OFF");
      database.prepare('UPDATE "employee" SET "role_id" = ? WHERE "id" = ?').run("missing-role", worker.id);
      database.pragma("foreign_keys = ON");
      expect(() =>
        service.createProjectAssignment({
          employeeId: worker.id,
          projectId: project.id,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects assigning a worker to a non-active project", () => {
      const { service, roleIds } = createHarness();
      const { worker } = seedManagerAndWorker(service, roleIds, "3005");
      const stopped = service.createProject({ name: "مشروع متوقف", status: "STOPPED" }).item;
      expect(() =>
        service.createProjectAssignment({
          employeeId: worker.id,
          projectId: stopped.id,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects assigning a worker that has no active manager", () => {
      const { service, roleIds } = createHarness();
      const project = service.createProject({ name: "مشروع", status: "ACTIVE" }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "بلا مدير",
        phone: "0663000006",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      expect(() =>
        service.createProjectAssignment({
          employeeId: worker.id,
          projectId: project.id,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });
  });

  describe("endProjectAssignment guards", () => {
    it("rejects ending a missing assignment", () => {
      const { service } = createHarness();
      expect(() =>
        service.endProjectAssignment({ id: "missing", endDate: "2026-06-01T00:00:00.000Z" }, audit()),
      ).toThrowError(CompanyError);
    });

    it("ends an active assignment with notes", () => {
      const { service, roleIds } = createHarness();
      const { worker, project } = seedManagerAndWorker(service, roleIds, "3006");
      const assignment = service.createProjectAssignment({
        employeeId: worker.id,
        projectId: project.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      }).item;
      const ended = service.endProjectAssignment(
        { id: assignment.id, endDate: "2026-06-01T00:00:00.000Z", notes: "إنهاء عادي" },
        audit(),
      ).item;
      expect(ended.notes).toBe("إنهاء عادي");
    });

    it("rejects ending an already-ended assignment", () => {
      const { service, roleIds } = createHarness();
      const { worker, project } = seedManagerAndWorker(service, roleIds, "3002");
      const assignment = service.createProjectAssignment({
        employeeId: worker.id,
        projectId: project.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      }).item;
      service.endProjectAssignment({ id: assignment.id, endDate: "2026-06-01T00:00:00.000Z" }, audit());
      expect(() =>
        service.endProjectAssignment({ id: assignment.id, endDate: "2026-07-01T00:00:00.000Z" }, audit()),
      ).toThrowError(CompanyError);
    });
  });

  describe("getWarehouseAssignment", () => {
    it("returns an existing warehouse assignment and rejects a missing one", () => {
      const { service, roleIds } = createHarness();
      const warehouseManager = service.createEmployee({
        firstName: "مدير",
        lastName: "مخزن",
        phone: "0663000002",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مخزن",
        phone: "0663000003",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
      const assignment = service.createWarehouseAssignment({
        employeeId: worker.id,
        warehouseId: warehouse.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      }).item;
      expect(service.getWarehouseAssignment(assignment.id).item.id).toBe(assignment.id);
      expect(() => service.getWarehouseAssignment("missing")).toThrowError(CompanyError);
    });
  });

  describe("createWarehouseAssignment guards", () => {
    it("creates a non-active warehouse assignment without the active guards", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مخزن منتهي",
        phone: "0664000006",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
      const assignment = service.createWarehouseAssignment({
        employeeId: worker.id,
        warehouseId: warehouse.id,
        status: "ENDED",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-02-01T00:00:00.000Z",
      }).item;
      expect(assignment.status).toBe("ENDED");

      // A non-active assignment with no endDate defaults it to null.
      const noEnd = service.createWarehouseAssignment({
        employeeId: worker.id,
        warehouseId: warehouse.id,
        status: "ARCHIVED",
        startDate: "2026-01-01T00:00:00.000Z",
      }).item;
      expect(noEnd.endDate).toBeNull();
    });

    it("rejects a disallowed employee role for an active warehouse assignment", () => {
      const { service, database } = createHarness();
      const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
      const now = new Date().toISOString();
      database
        .prepare(
          'INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, NULL, 0, ?, ?)',
        )
        .run("custom-role-2", "custom", "دور مخصص", now, now);
      database
        .prepare(
          'INSERT INTO "employee" (id, first_name, last_name, phone, role_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run("custom-emp-2", "موظف", "مخصص", "0664000007", "custom-role-2", "ACTIVE", now, now);
      expect(() =>
        service.createWarehouseAssignment({
          employeeId: "custom-emp-2",
          warehouseId: warehouse.id,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects a worker that already has an active warehouse assignment", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مخزن مكرر",
        phone: "0664000008",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const warehouse1 = service.createWarehouse({ name: "مستودع 1", status: "ACTIVE" }).item;
      const warehouse2 = service.createWarehouse({ name: "مستودع 2", status: "ACTIVE" }).item;
      service.createWarehouseAssignment({
        employeeId: worker.id,
        warehouseId: warehouse1.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      });
      expect(() =>
        service.createWarehouseAssignment({
          employeeId: worker.id,
          warehouseId: warehouse2.id,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects an employee whose role is missing", () => {
      const { service, database, roleIds } = createHarness();
      const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "بدون دور مخزن",
        phone: "0664000009",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      database.pragma("foreign_keys = OFF");
      database
        .prepare('UPDATE "employee" SET "role_id" = ? WHERE "id" = ?')
        .run("missing-role", worker.id);
      database.pragma("foreign_keys = ON");
      expect(() =>
        service.createWarehouseAssignment({
          employeeId: worker.id,
          warehouseId: warehouse.id,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects a missing employee", () => {
      const { service } = createHarness();
      const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
      expect(() =>
        service.createWarehouseAssignment({
          employeeId: "missing",
          warehouseId: warehouse.id,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects assigning to a non-active warehouse", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مخزن",
        phone: "0663000004",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const warehouse = service.createWarehouse({ name: "مستودع مؤرشف", status: "ARCHIVED" }).item;
      expect(() =>
        service.createWarehouseAssignment({
          employeeId: worker.id,
          warehouseId: warehouse.id,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects a worker with an active project assignment", () => {
      const { service, roleIds } = createHarness();
      const { worker, project } = seedManagerAndWorker(service, roleIds, "3003");
      service.createProjectAssignment({
        employeeId: worker.id,
        projectId: project.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      });
      const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
      expect(() =>
        service.createWarehouseAssignment({
          employeeId: worker.id,
          warehouseId: warehouse.id,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });

    it("rejects a worker with an active manager assignment", () => {
      const { service, roleIds } = createHarness();
      const { worker } = seedManagerAndWorker(service, roleIds, "3004");
      const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
      expect(() =>
        service.createWarehouseAssignment({
          employeeId: worker.id,
          warehouseId: warehouse.id,
          status: "ACTIVE",
        }),
      ).toThrowError(CompanyError);
    });
  });

  describe("endWarehouseAssignment guards", () => {
    it("rejects ending a missing assignment", () => {
      const { service } = createHarness();
      expect(() =>
        service.endWarehouseAssignment({ id: "missing", endDate: "2026-06-01T00:00:00.000Z" }, audit()),
      ).toThrowError(CompanyError);
    });

    it("rejects ending an already-ended assignment", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مخزن",
        phone: "0663000005",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
      const assignment = service.createWarehouseAssignment({
        employeeId: worker.id,
        warehouseId: warehouse.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      }).item;
      service.endWarehouseAssignment({ id: assignment.id, endDate: "2026-06-01T00:00:00.000Z" }, audit());
      expect(() =>
        service.endWarehouseAssignment({ id: assignment.id, endDate: "2026-07-01T00:00:00.000Z" }, audit()),
      ).toThrowError(CompanyError);
    });

    it("ends an active warehouse assignment with notes", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مخزن ملاحظة",
        phone: "0664000010",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
      const assignment = service.createWarehouseAssignment({
        employeeId: worker.id,
        warehouseId: warehouse.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      }).item;
      const ended = service.endWarehouseAssignment(
        { id: assignment.id, endDate: "2026-06-01T00:00:00.000Z", notes: "نقل المخزن" },
        audit(),
      ).item;
      expect(ended.notes).toBe("نقل المخزن");
    });
  });
});
