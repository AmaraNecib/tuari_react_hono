import { afterEach, describe, expect, it } from "vitest";

import { CompanyError } from "./company.errors";
import { createInMemoryCompanyHarness } from "./company.test-helpers";

describe("CompanyService", () => {
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

  it("protects system roles from deletion", () => {
    const { service, roleIds } = createHarness();

    expect(() => service.deleteRole(roleIds.worker)).toThrowError(CompanyError);
  });

  it("requires an existing role when creating an employee", () => {
    const { service } = createHarness();

    expect(() =>
      service.createEmployee({
        firstName: "Amina",
        lastName: "Benali",
        phone: "0612345601",
        roleId: "missing-role",
        status: "ACTIVE",
      }),
    ).toThrowError(CompanyError);
  });

  it("rejects more than one active manager assignment per worker", () => {
    const { service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345602",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "Nora",
      lastName: "Kaci",
      phone: "0612345603",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;

    service.createManagerAssignment({
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE",
    });

    expect(() =>
      service.createManagerAssignment({
        workerId: worker.id,
        managerId: manager.id,
        status: "ACTIVE",
      }),
    ).toThrowError(CompanyError);
  });

  it("rejects more than one active project assignment per worker", () => {
    const { service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345604",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "Nora",
      lastName: "Kaci",
      phone: "0612345605",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const projectA = service.createProject({
      name: "North Site",
      managerId: manager.id,
      status: "ACTIVE",
    }).item;
    const projectB = service.createProject({
      name: "South Site",
      managerId: manager.id,
      status: "ACTIVE",
    }).item;

    service.createManagerAssignment({
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE",
    });
    service.createProjectAssignment({
      employeeId: worker.id,
      projectId: projectA.id,
      status: "ACTIVE",
    });

    expect(() =>
      service.createProjectAssignment({
        employeeId: worker.id,
        projectId: projectB.id,
        status: "ACTIVE",
      }),
    ).toThrowError(CompanyError);
  });

  it("enforces active project membership under the worker's active manager", () => {
    const { service, roleIds } = createHarness();
    const managerA = service.createEmployee({
      firstName: "Ali",
      lastName: "Bensaid",
      phone: "0612345606",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const managerB = service.createEmployee({
      firstName: "Lina",
      lastName: "Saidi",
      phone: "0612345607",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "Yara",
      lastName: "Toumi",
      phone: "0612345608",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const project = service.createProject({
      name: "East Site",
      managerId: managerB.id,
      status: "ACTIVE",
    }).item;

    service.createManagerAssignment({
      workerId: worker.id,
      managerId: managerA.id,
      status: "ACTIVE",
    });

    expect(() =>
      service.createProjectAssignment({
        employeeId: worker.id,
        projectId: project.id,
        status: "ACTIVE",
      }),
    ).toThrowError(CompanyError);
  });

  it("rejects changing a worker role while active assignments still exist", () => {
    const { service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "مروان",
      lastName: "بوزيد",
      phone: "0612345610",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "أمين",
      lastName: "كافي",
      phone: "0612345611",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const project = service.createProject({
      name: "المشروع الرئيسي",
      managerId: manager.id,
      status: "ACTIVE",
    }).item;

    service.createManagerAssignment({
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE",
    });
    service.createProjectAssignment({
      employeeId: worker.id,
      projectId: project.id,
      status: "ACTIVE",
    });

    expect(() =>
      service.updateEmployee({
        id: worker.id,
        roleId: roleIds.projectManager,
      }),
    ).toThrowError(CompanyError);
  });

  it("rejects archiving a project while active assignments still point to it", () => {
    const { service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "حسام",
      lastName: "شريف",
      phone: "0612345612",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "ريم",
      lastName: "قدور",
      phone: "0612345613",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const project = service.createProject({
      name: "مشروع شرق المدينة",
      managerId: manager.id,
      status: "ACTIVE",
    }).item;

    service.createManagerAssignment({
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE",
    });
    service.createProjectAssignment({
      employeeId: worker.id,
      projectId: project.id,
      status: "ACTIVE",
    });

    expect(() =>
      service.updateProject({
        id: project.id,
        status: "ARCHIVED",
      }),
    ).toThrowError(CompanyError);
  });

  it("keeps project and warehouse manager references optional", () => {
    const { service } = createHarness();

    expect(
      service.createProject({
        name: "Standalone Project",
        managerId: null,
        status: "ACTIVE",
      }).item.managerId,
    ).toBeNull();

    expect(
      service.createWarehouse({
        name: "Central Warehouse",
        managerId: null,
        status: "ACTIVE",
      }).item.managerId,
    ).toBeNull();
  });
});
