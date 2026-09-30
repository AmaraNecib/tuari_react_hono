import { afterEach, describe, expect, it, vi } from "vitest";

import { CompanyError } from "./company.errors";
import { createAuditContext, createCompanyHarnessTracker } from "./company.test-helpers";

describe("WorkforceService coverage branches", () => {
  const { createHarness, closeAll } = createCompanyHarnessTracker();

  afterEach(closeAll);

  const audit = () => createAuditContext();

  describe("atomic employee save", () => {
    it("saves an active worker profile and placement in one operation", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مشروع",
        phone: "0554000101",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({
        name: "مشروع نشط",
        managerId: manager.id,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "نشط",
        phone: "0554000102",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;

      const result = service.saveEmployee({
        ...worker,
        firstName: "عامل معدل",
        placement: {
          nextType: "PROJECT",
          managerId: manager.id,
          projectId: project.id,
          warehouseId: null,
        },
        managedProjectIds: [],
        managedWarehouseIds: [],
      }, audit());

      expect(result.item.firstName).toBe("عامل معدل");
      expect(service.listManagerAssignments({ workerId: worker.id }).items).toHaveLength(1);
      expect(service.listProjectAssignments({ employeeId: worker.id }).items).toHaveLength(1);
    });

    it("keeps a newer concurrent placement when a stale save omits relationship fields", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "تزامن",
        phone: "0554000111",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const staleProject = service.createProject({ name: "مشروع قديم", managerId: manager.id, status: "ACTIVE" }).item;
      const warehouse = service.createWarehouse({ name: "مستودع جديد", status: "ACTIVE" }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "تزامن",
        phone: "0554000112",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;

      // The stale page's load-time snapshot: the worker sits on the old project.
      service.saveEmployee({
        ...worker,
        placement: { nextType: "PROJECT", managerId: manager.id, projectId: staleProject.id, warehouseId: null },
        managedProjectIds: [],
        managedWarehouseIds: [],
      }, audit());

      // A newer concurrent update moves the worker to a warehouse.
      service.assignEmployeeWorkplace(
        { employeeId: worker.id, nextType: "WAREHOUSE", warehouseId: warehouse.id },
        audit(),
      );

      // The stale page then saves an unrelated profile field without touching
      // relationship controls; the server must keep the newer placement.
      const result = service.saveEmployee({ ...worker, firstName: "عامل بعد التزامن" }, audit());

      expect(result.item.firstName).toBe("عامل بعد التزامن");
      expect(service.listProjectAssignments({ employeeId: worker.id, status: "ACTIVE" }).items).toHaveLength(0);
      expect(service.listWarehouseAssignments({ employeeId: worker.id, status: "ACTIVE" }).items).toHaveLength(1);
    });

    it("rejects a profile-only save that would leave an ACTIVE worker unplaced", () => {
      const { service, roleIds } = createHarness();
      const unplacedWorker = service.createEmployee({
        firstName: "عامل",
        lastName: "بلا مكان",
        phone: "0554000114",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;

      // Issue #20: an ACTIVE worker must have a project-or-warehouse
      // placement, so a stale profile-only save cannot sneak an unplaced
      // worker through (E2E worker-assignment regression).
      expect(() => service.saveEmployee({ ...unplacedWorker, firstName: "لا يجب أن تحفظ" }, audit()))
        .toThrow("اختر مكان عمل للعامل النشط (مشروع أو مستودع).");
      expect(service.getEmployee(unplacedWorker.id).item.firstName).toBe("عامل");
    });

    it("still saves a profile-only batch for an INACTIVE unplaced worker", () => {
      const { service, roleIds } = createHarness();
      const inactiveWorker = service.createEmployee({
        firstName: "عامل",
        lastName: "غير نشط",
        phone: "0554000115",
        roleId: roleIds.worker,
        status: "INACTIVE",
      }).item;

      const result = service.saveEmployee({ ...inactiveWorker, firstName: "عامل معدل" }, audit());

      expect(result.item.firstName).toBe("عامل معدل");
    });

    it("keeps newer managed-scope updates when a stale save omits relationship fields", () => {
      const { service, roleIds } = createHarness();
      const projectManager = service.createEmployee({
        firstName: "مدير",
        lastName: "نطاق",
        phone: "0554000113",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const projectA = service.createProject({ name: "مشروع أ", managerId: projectManager.id, status: "ACTIVE" }).item;
      const projectB = service.createProject({ name: "مشروع ب", managerId: projectManager.id, status: "ACTIVE" }).item;

      service.saveEmployee({ ...projectManager, managedProjectIds: [projectA.id] }, audit());

      // A newer concurrent update grants management of a second project.
      service.syncManagedProjects(
        { employeeId: projectManager.id, projectIds: [projectA.id, projectB.id] },
        audit(),
      );

      const result = service.saveEmployee({ ...projectManager, firstName: "مدير بعد التزامن" }, audit());

      expect(result.item.firstName).toBe("مدير بعد التزامن");
      expect(service.listProjects({ managerId: projectManager.id }).items.map((project) => project.id).sort())
        .toEqual([projectA.id, projectB.id].sort());
    });

    it("rolls the profile back when a workplace write fails", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مكان",
        phone: "0554000108",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({ name: "مشروع مكان", managerId: manager.id, status: "ACTIVE" }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مكان",
        phone: "0554000109",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const originalAssign = repository.assignEmployeeWorkplace.bind(repository);
      vi.spyOn(repository, "assignEmployeeWorkplace").mockImplementation((data, context) => {
        originalAssign(data, context);
        throw new Error("injected workplace failure");
      });

      expect(() => service.saveEmployee({
        ...worker,
        firstName: "لا يجب أن تحفظ",
        placement: { nextType: "PROJECT", managerId: manager.id, projectId: project.id, warehouseId: null },
        managedProjectIds: [],
        managedWarehouseIds: [],
      }, audit())).toThrow("injected workplace failure");
      expect(service.getEmployee(worker.id).item.firstName).toBe("عامل");
      expect(service.listManagerAssignments({ workerId: worker.id }).items).toHaveLength(0);
      expect(service.listProjectAssignments({ employeeId: worker.id }).items).toHaveLength(0);
    });

    it("rolls the profile back when a managed-scope write fails", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "فشل",
        phone: "0554000103",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      service.createProject({
        name: "مشروع فشل",
        managerId: manager.id,
        status: "ACTIVE",
      });
      const replacementProject = service.createProject({
        name: "مشروع بديل",
        status: "ACTIVE",
      }).item;
      const ownershipCountBefore = service.listProjectManagerOwnershipHistory({ managerId: manager.id }).items.length;
      const originalSync = repository.syncManagedProjects.bind(repository);
      vi.spyOn(repository, "syncManagedProjects").mockImplementation((data, context) => {
        originalSync(data, context);
        throw new Error("injected managed-project failure");
      });

      expect(() => service.saveEmployee({
        ...manager,
        firstName: "لا يجب أن تحفظ",
        placement: null,
        managedProjectIds: [replacementProject.id],
        managedWarehouseIds: [],
      }, audit())).toThrow("injected managed-project failure");
      expect(service.getEmployee(manager.id).item.firstName).toBe("مدير");
      expect(repository.getProjectById(replacementProject.id)?.managerId).toBeNull();
      expect(service.listProjectManagerOwnershipHistory({ managerId: manager.id }).items).toHaveLength(ownershipCountBefore);
    });

    it("rolls the profile back when a managed-warehouse write fails", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مخزن فشل",
        phone: "0554000110",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      }).item;
      const warehouse = service.createWarehouse({ name: "مخزن فشل", status: "ACTIVE" }).item;
      const ownershipCountBefore = service.listWarehouseManagerOwnershipHistory({ managerId: manager.id }).items.length;
      const originalSync = repository.syncManagedWarehouses.bind(repository);
      vi.spyOn(repository, "syncManagedWarehouses").mockImplementation((data, context) => {
        originalSync(data, context);
        throw new Error("injected managed-warehouse failure");
      });

      expect(() => service.saveEmployee({
        ...manager,
        firstName: "لا يجب أن تحفظ",
        placement: null,
        managedProjectIds: [],
        managedWarehouseIds: [warehouse.id],
      }, audit())).toThrow("injected managed-warehouse failure");
      expect(service.getEmployee(manager.id).item.firstName).toBe("مدير");
      expect(repository.getWarehouseById(warehouse.id)?.managerId).toBeNull();
      expect(service.listWarehouseManagerOwnershipHistory({ managerId: manager.id }).items).toHaveLength(ownershipCountBefore);
    });

    it("syncs active project and warehouse managers and ignores inactive placement", () => {
      const { service, roleIds } = createHarness();
      const projectManager = service.createEmployee({
        firstName: "مدير",
        lastName: "مشاريع",
        phone: "0554000104",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({ name: "مشروع إدارة", managerId: projectManager.id, status: "ACTIVE" }).item;
      service.saveEmployee({
        ...projectManager,
        placement: null,
        managedProjectIds: [project.id],
        managedWarehouseIds: [],
      }, audit());
      expect(service.listProjectManagerOwnershipHistory({ managerId: projectManager.id }).items).toHaveLength(1);

      const warehouseManager = service.createEmployee({
        firstName: "مدير",
        lastName: "مخازن",
        phone: "0554000105",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      }).item;
      const warehouse = service.createWarehouse({ name: "مخزن إدارة", managerId: warehouseManager.id, status: "ACTIVE" }).item;
      service.saveEmployee({
        ...warehouseManager,
        placement: null,
        managedProjectIds: [],
        managedWarehouseIds: [warehouse.id],
      }, audit());
      expect(service.listWarehouseManagerOwnershipHistory({ managerId: warehouseManager.id }).items).toHaveLength(1);

      const inactiveWorker = service.createEmployee({
        firstName: "عامل",
        lastName: "غير نشط",
        phone: "0554000106",
        roleId: roleIds.worker,
        status: "INACTIVE",
      }).item;
      const result = service.saveEmployee({
        ...inactiveWorker,
        placement: {
          nextType: "PROJECT",
          managerId: "missing-manager",
          projectId: "missing-project",
          warehouseId: null,
        },
        managedProjectIds: [],
        managedWarehouseIds: [],
      }, audit());
      expect(result.item.status).toBe("INACTIVE");
      expect(service.listManagerAssignments({ workerId: inactiveWorker.id }).items).toHaveLength(0);
    });

    it("does not call the worker placement write when a placed active worker has no placement payload", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "تخطي",
        phone: "0554000116",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({ name: "مشروع تخطي", managerId: manager.id, status: "ACTIVE" }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "بدون ربط",
        phone: "0554000107",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      // The worker already holds a placement, so omitting the placement field
      // is a valid profile-only save that must not rewrite relationships.
      service.assignEmployeeWorkplace(
        { employeeId: worker.id, nextType: "PROJECT", managerId: manager.id, projectId: project.id },
        audit(),
      );
      const placement = vi.spyOn(repository, "assignEmployeeWorkplace");

      service.saveEmployee({
        ...worker,
        firstName: "عامل معدل",
        managedProjectIds: [],
        managedWarehouseIds: [],
      }, audit());
      expect(placement).not.toHaveBeenCalled();
      expect(service.getEmployee(worker.id).item.firstName).toBe("عامل معدل");
    });
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
      service.createSalaryPayment({ employeeId: worker.id, actualAmountDzd: 45000, days: 30, projectSplits: [] }, audit());
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
        service.createSalaryPayment({ employeeId: worker.id, actualAmountDzd: 1000, days: 30, projectSplits: [] }, audit()),
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

    it("endManagerAssignment rejects missing and already-ended ids", () => {
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

    it("applies a WAREHOUSE workplace assignment end-to-end", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مخزن",
        phone: "0554000023",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const warehouse = service.createWarehouse({ name: "مخزن", status: "ACTIVE" }).item;
      const result = service.assignEmployeeWorkplace(
        { employeeId: worker.id, nextType: "WAREHOUSE", warehouseId: warehouse.id },
        audit(),
      );
      expect(result.success).toBe(true);
      const assignments = service.listWarehouseAssignments({ employeeId: worker.id }).items;
      expect(assignments).toHaveLength(1);
      expect(assignments[0]?.warehouseId).toBe(warehouse.id);
    });

    it("rejects a WAREHOUSE placement with a missing or inactive warehouse", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مخزن",
        phone: "0554000024",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      expect(() =>
        service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "WAREHOUSE" }, audit()),
      ).toThrowError(CompanyError);
      const inactiveWarehouse = service
        .createWarehouse({ name: "مخزن غير نشط", status: "INACTIVE" })
        .item;
      expect(() =>
        service.assignEmployeeWorkplace(
          { employeeId: worker.id, nextType: "WAREHOUSE", warehouseId: inactiveWarehouse.id },
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

  describe("salary payment days and project split (#412)", () => {
    function createPaidWorker(
      service: ReturnType<typeof createHarness>["service"],
      roleIds: ReturnType<typeof createHarness>["roleIds"],
      options: { phone: string; salaryAmountDzd?: number; salaryPeriod?: "DAILY" | "MONTHLY" },
    ) {
      return service.createEmployee({
        firstName: "عامل",
        lastName: "أجور",
        phone: options.phone,
        roleId: roleIds.worker,
        status: "ACTIVE",
        salaryAmountDzd: options.salaryAmountDzd ?? 30000,
        salaryPeriod: options.salaryPeriod ?? "MONTHLY",
      }).item;
    }

    function createProject(service: ReturnType<typeof createHarness>["service"], managerId: string, name: string) {
      return service.createProject({ name, status: "ACTIVE", managerId }).item;
    }

    it("prorates a monthly wage at salary/30 and stores the proposed amount", () => {
      const { service, roleIds } = createHarness();
      const worker = createPaidWorker(service, roleIds, { phone: "0554000201" });

      const full = service.createSalaryPayment({ employeeId: worker.id, days: 30, projectSplits: [] }, audit()).item;
      expect(full.days).toBe(30);
      expect(full.expectedAmountDzd).toBe(30000);
      expect(full.actualAmountDzd).toBe(30000);

      const partial = service.createSalaryPayment({ employeeId: worker.id, days: 27, projectSplits: [] }, audit()).item;
      expect(partial.expectedAmountDzd).toBe(27000);
      expect(partial.actualAmountDzd).toBe(27000);

      const half = service.createSalaryPayment({ employeeId: worker.id, days: 15, projectSplits: [] }, audit()).item;
      expect(half.expectedAmountDzd).toBe(15000);
    });

    it("records a second payment for the same worker in the same month (owner item 6, decision C)", () => {
      const { service, roleIds } = createHarness();
      const worker = createPaidWorker(service, roleIds, { phone: "0554000220" });

      // Two payments inside one calendar month. There is no monthly guard and
      // no per-month uniqueness, so both must persist untouched (the owner
      // chose free payments; a month balance stays derivable from date +
      // amount + the stored monthly wage).
      const first = service.createSalaryPayment(
        {
          employeeId: worker.id,
          days: 30,
          actualAmountDzd: 30000,
          paymentDate: "2026-03-05T00:00:00.000Z",
          projectSplits: [],
        },
        audit(),
      ).item;
      const second = service.createSalaryPayment(
        {
          employeeId: worker.id,
          days: 15,
          actualAmountDzd: 15000,
          paymentDate: "2026-03-25T00:00:00.000Z",
          projectSplits: [],
        },
        audit(),
      ).item;

      expect(second.id).not.toBe(first.id);
      const stored = service.listSalaryPayments({ employeeId: worker.id }).items;
      expect(stored.map((payment) => payment.id)).toEqual(
        expect.arrayContaining([first.id, second.id]),
      );
    });

    it("multiplies a daily wage by the days", () => {
      const { service, roleIds } = createHarness();
      const worker = createPaidWorker(service, roleIds, { phone: "0554000202", salaryAmountDzd: 1500, salaryPeriod: "DAILY" });
      const payment = service.createSalaryPayment({ employeeId: worker.id, days: 12, projectSplits: [] }, audit()).item;
      expect(payment.expectedAmountDzd).toBe(18000);
    });

    it("lets the caller override the amount while the proposal is kept as expected", () => {
      const { service, roleIds } = createHarness();
      const worker = createPaidWorker(service, roleIds, { phone: "0554000203" });
      const payment = service
        .createSalaryPayment({ employeeId: worker.id, days: 15, actualAmountDzd: 14000, projectSplits: [] }, audit())
        .item;
      expect(payment.expectedAmountDzd).toBe(15000);
      expect(payment.actualAmountDzd).toBe(14000);
    });

    it("normalises an over-precise override to whole cents at the write boundary", () => {
      const { service, roleIds } = createHarness();
      const worker = createPaidWorker(service, roleIds, { phone: "0554000218" });
      const payment = service
        .createSalaryPayment({ employeeId: worker.id, days: 30, actualAmountDzd: 100.005, projectSplits: [] }, audit())
        .item;
      // Stored at the currency's precision so the whole-cent split shares can
      // reconcile with it exactly.
      expect(payment.actualAmountDzd).toBe(100.01);
    });

    it("stores the monthly day rate in whole cents without losing one", () => {
      const { service, roleIds } = createHarness();
      const worker = createPaidWorker(service, roleIds, {
        phone: "0554000219",
        salaryAmountDzd: 30010.05,
      });
      const payment = service.createSalaryPayment({ employeeId: worker.id, days: 1, projectSplits: [] }, audit()).item;
      expect(payment.expectedAmountDzd).toBe(1000.34);
      expect(payment.actualAmountDzd).toBe(1000.34);
    });

    it("records an unallocated payment with no project attribution", () => {
      const { service, roleIds } = createHarness();
      const worker = createPaidWorker(service, roleIds, { phone: "0554000204" });
      const payment = service.createSalaryPayment({ employeeId: worker.id, days: 30, projectSplits: [] }, audit()).item;
      expect(payment.projectSplits).toEqual([]);
      expect(service.listSalaryPayments({ employeeId: worker.id }).items[0]?.projectSplits).toEqual([]);
    });

    it("stores a per-project split whose days stay within the paid days", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "توزيع",
        phone: "0554000205",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const projectA = createProject(service, manager.id, "مشروع أ");
      const projectB = createProject(service, manager.id, "مشروع ب");
      const worker = createPaidWorker(service, roleIds, { phone: "0554000206" });

      const payment = service
        .createSalaryPayment(
          {
            employeeId: worker.id,
            days: 30,
            projectSplits: [
              { projectId: projectA.id, days: 20 },
              { projectId: projectB.id, days: 5 },
            ],
          },
          audit(),
        )
        .item;

      expect(payment.projectSplits).toEqual([
        { projectId: projectA.id, days: 20 },
        { projectId: projectB.id, days: 5 },
      ]);
      // The 5 remaining days stay unallocated rather than being forced onto a project.
      const allocated = payment.projectSplits.reduce((total, split) => total + split.days, 0);
      expect(allocated).toBe(25);
    });

    it("accepts a split whose days exactly equal the paid days", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "تساوي",
        phone: "0554000215",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const project = createProject(service, manager.id, "مشروع تساوي");
      const worker = createPaidWorker(service, roleIds, { phone: "0554000216" });
      const payment = service
        .createSalaryPayment(
          { employeeId: worker.id, days: 10, projectSplits: [{ projectId: project.id, days: 10 }] },
          audit(),
        )
        .item;
      expect(payment.projectSplits).toEqual([{ projectId: project.id, days: 10 }]);
    });

    it("keeps a legacy weekly wage unprorated (weekly is not offered)", () => {
      const { service, roleIds } = createHarness();
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "أسبوعي",
        phone: "0554000217",
        roleId: roleIds.worker,
        status: "ACTIVE",
        salaryAmountDzd: 9000,
        salaryPeriod: "WEEKLY",
      }).item;
      const payment = service.createSalaryPayment({ employeeId: worker.id, days: 5, projectSplits: [] }, audit()).item;
      expect(payment.expectedAmountDzd).toBe(9000);
      expect(payment.actualAmountDzd).toBe(9000);
      expect(payment.days).toBe(5);
    });

    it("rejects a split whose days exceed the paid days", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "تجاوز",
        phone: "0554000207",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const project = createProject(service, manager.id, "مشروع تجاوز");
      const worker = createPaidWorker(service, roleIds, { phone: "0554000208" });

      expect(() =>
        service.createSalaryPayment(
          { employeeId: worker.id, days: 10, projectSplits: [{ projectId: project.id, days: 11 }] },
          audit(),
        ),
      ).toThrowError(CompanyError);
    });

    it("rejects a split line for a project that does not exist", () => {
      const { service, roleIds } = createHarness();
      const worker = createPaidWorker(service, roleIds, { phone: "0554000209" });
      expect(() =>
        service.createSalaryPayment(
          { employeeId: worker.id, days: 30, projectSplits: [{ projectId: "ghost-project", days: 5 }] },
          audit(),
        ),
      ).toThrowError(CompanyError);
    });

    it("rejects a duplicated project in the split", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "تكرار",
        phone: "0554000210",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const project = createProject(service, manager.id, "مشروع تكرار");
      const worker = createPaidWorker(service, roleIds, { phone: "0554000211" });
      expect(() =>
        service.createSalaryPayment(
          {
            employeeId: worker.id,
            days: 30,
            projectSplits: [
              { projectId: project.id, days: 5 },
              { projectId: project.id, days: 5 },
            ],
          },
          audit(),
        ),
      ).toThrowError(CompanyError);
    });

    it("rejects non-positive or fractional days and split days", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "أيام",
        phone: "0554000212",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const project = createProject(service, manager.id, "مشروع أيام");
      const worker = createPaidWorker(service, roleIds, { phone: "0554000213" });

      expect(() =>
        service.createSalaryPayment({ employeeId: worker.id, days: 0, projectSplits: [] }, audit()),
      ).toThrowError(CompanyError);
      expect(() =>
        service.createSalaryPayment({ employeeId: worker.id, days: 2.5, projectSplits: [] }, audit()),
      ).toThrowError(CompanyError);
      expect(() =>
        service.createSalaryPayment(
          { employeeId: worker.id, days: 30, projectSplits: [{ projectId: project.id, days: 0 }] },
          audit(),
        ),
      ).toThrowError(CompanyError);
    });

    it("rejects a non-finite overridden amount", () => {
      const { service, roleIds } = createHarness();
      const worker = createPaidWorker(service, roleIds, { phone: "0554000214" });
      expect(() =>
        service.createSalaryPayment(
          { employeeId: worker.id, days: 30, actualAmountDzd: Number.NaN, projectSplits: [] },
          audit(),
        ),
      ).toThrowError(CompanyError);
    });

    it("rejects a day count past the safe-integer range", () => {
      const { service, roleIds } = createHarness();
      const worker = createPaidWorker(service, roleIds, { phone: "0554000220" });
      // `Number.isInteger(1e20)` is true, so the absurd count used to pass and
      // overflow the cent proposal before SQLite stored it as a REAL.
      expect(() =>
        service.createSalaryPayment({ employeeId: worker.id, days: 1e20, projectSplits: [] }, audit()),
      ).toThrowError(CompanyError);
    });

    it("rejects a split line whose days are past the safe-integer range", () => {
      const { service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "آمن",
        phone: "0554000222",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const project = createProject(service, manager.id, "مشروع آمن");
      const worker = createPaidWorker(service, roleIds, { phone: "0554000223" });
      expect(() =>
        service.createSalaryPayment(
          { employeeId: worker.id, days: 30, projectSplits: [{ projectId: project.id, days: 1e20 }] },
          audit(),
        ),
      ).toThrowError(CompanyError);
    });

    it("rounds a half-cent override up, not only the float-favourable values", () => {
      const { service, roleIds } = createHarness();
      const worker = createPaidWorker(service, roleIds, { phone: "0554000221" });
      const payment = service
        .createSalaryPayment({ employeeId: worker.id, days: 30, actualAmountDzd: 1.005, projectSplits: [] }, audit())
        .item;
      expect(payment.actualAmountDzd).toBe(1.01);
    });
  });
});
