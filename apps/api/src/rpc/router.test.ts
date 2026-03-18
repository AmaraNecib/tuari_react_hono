import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInMemoryCompanyHarness } from "../modules/company/company.test-helpers";
import { createRouter } from "./router";
import type { RpcContext } from "./context";

function expectSuccess<T extends { success: boolean }>(result: T): Extract<T, { success: true }> {
  expect(result.success).toBe(true);
  return result as Extract<T, { success: true }>;
}

describe("RPC router", () => {
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

  const authBootstrapService = {
    getSetupStatus: async () => ({ hasUsers: false, requiresSetupKey: false }),
    isBootstrapOwner: async () => true,
    bootstrapFirstUser: async () => ({
      success: true as const,
      message: "created",
      item: { id: "user-1", name: "Taylor", phone: "0612345678" },
    }),
  }

  const currentUser = {
    id: "user-1",
    name: "Taylor",
    phone: "0612345678",
  };

  const createContext = (user: typeof currentUser | null = currentUser): RpcContext => ({
    headers: new Headers({ cookie: "session=token" }),
    resolveCurrentUser: vi.fn().mockResolvedValue(user),
  });

  it("returns the resolved current user for the session procedure", async () => {
    const { service } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const context = createContext();
    const client = createRouterClient(router, { context: context as never });

    await expect(client.session()).resolves.toEqual({
      user: currentUser,
    });
    expect(context.resolveCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("reports whether the first auth user has already been created", async () => {
    const { service } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const client = createRouterClient(router, { context: createContext(null) as never });

    await expect(client.authSetupStatus()).resolves.toEqual({ hasUsers: false, requiresSetupKey: false });
  });

  it("keeps public health checks unauthenticated", async () => {
    const { service } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const context = createContext();
    const client = createRouterClient(router, { context: context as never });

    await expect(client.health()).resolves.toMatchObject({ status: "ok" });
    expect(context.resolveCurrentUser).not.toHaveBeenCalled();
  });

  it("rejects protected procedures when no session exists", async () => {
    const { service } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const client = createRouterClient(router, { context: createContext(null) as never });

    await expect(client.rolesList()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects workspace mutations for non-admin authenticated users", async () => {
    const { service, roleIds } = createHarness();
    const router = createRouter({
      authBootstrapService: { ...authBootstrapService, isBootstrapOwner: async () => false },
      companyService: service,
    });
    const client = createRouterClient(router, { context: createContext() as never });

    await expect(
      client.employeesCreate({
        firstName: "Nora",
        lastName: "Kaci",
        phone: "0612345690",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "هذا الإجراء متاح فقط لحساب الإدارة الرئيسي." });
  });

  it("covers CRUD and assignment flows with typed business-rule failures", async () => {
    const { service, roleIds } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const client = createRouterClient(router, { context: createContext() as never });

    const manager = expectSuccess(await client.employeesCreate({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345601",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }));
    const worker = expectSuccess(await client.employeesCreate({
      firstName: "Nora",
      lastName: "Kaci",
      phone: "0612345602",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }));
    const warehouseManager = expectSuccess(await client.employeesCreate({
      firstName: "Rania",
      lastName: "Bouzid",
      phone: "0612345603",
      roleId: roleIds.warehouseManager,
      status: "ACTIVE",
    }));

    const project = expectSuccess(await client.projectsCreate({
      name: "North Site",
      managerId: manager.item.id,
      status: "ACTIVE",
    }));
    const warehouse = expectSuccess(await client.warehousesCreate({
      name: "Main Warehouse",
      managerId: warehouseManager.item.id,
      status: "ACTIVE",
    }));

    const managerAssignment = expectSuccess(await client.managerAssignmentsCreate({
      workerId: worker.item.id,
      managerId: manager.item.id,
      status: "ACTIVE",
    }));
    expect(managerAssignment.item.actorUserId).toBe(currentUser.id)
    expect(managerAssignment.item.transactionId).toMatch(/[0-9a-f-]{36}/)

    const duplicateManagerAssignment = await client.managerAssignmentsCreate({
      workerId: worker.item.id,
      managerId: manager.item.id,
      status: "ACTIVE",
    });
    expect(duplicateManagerAssignment).toEqual({
      success: false,
      error: {
        code: "CONFLICT",
        message: "هذا العامل مرتبط حاليًا بمدير نشط بالفعل.",
        fieldErrors: [
          {
            field: "workerId",
            message: "هذا العامل مرتبط حاليًا بمدير نشط بالفعل.",
          },
        ],
      },
    });

    const wrongProject = expectSuccess(await client.projectsCreate({
      name: "Wrong Manager Project",
      managerId: null,
      status: "ACTIVE",
    }));

    const invalidProjectAssignment = await client.projectAssignmentsCreate({
      employeeId: worker.item.id,
      projectId: wrongProject.item.id,
      status: "ACTIVE",
    });
    expect(invalidProjectAssignment).toEqual({
      success: false,
      error: {
        code: "BUSINESS_RULE",
        message: "يجب أن يكون المشروع النشط ضمن مشاريع المدير النشط للعامل.",
        fieldErrors: [
          {
            field: "projectId",
            message: "يجب أن يكون المشروع النشط ضمن مشاريع المدير النشط للعامل.",
          },
        ],
      },
    });

    const projectAssignment = expectSuccess(await client.projectAssignmentsCreate({
      employeeId: worker.item.id,
      projectId: project.item.id,
      status: "ACTIVE",
    }));

    await expect(client.rolesList()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: roleIds.worker, key: "worker" }),
      ]),
    });
    await expect(client.employeesList()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: worker.item.id, phone: "0612345602" }),
      ]),
    });
    await expect(client.projectsList()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: project.item.id, managerId: manager.item.id }),
      ]),
    });
    await expect(client.warehousesList()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: warehouse.item.id,
          managerId: warehouseManager.item.id,
        }),
      ]),
    });

    const endProjectAssignment = expectSuccess(await client.projectAssignmentsEnd({
      id: projectAssignment.item.id,
    }));

    const endManagerAssignment = expectSuccess(await client.managerAssignmentsEnd({
      id: managerAssignment.item.id,
    }));
    expect(endProjectAssignment.item.status).toBe("ENDED");
    expect(endManagerAssignment.item.status).toBe("ENDED");
  });

  it("creates employee batches atomically through the RPC contract", async () => {
    const { service, roleIds } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const client = createRouterClient(router, { context: createContext() as never });

    const manager = expectSuccess(await client.employeesCreate({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345620",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }));
    const project = expectSuccess(await client.projectsCreate({
      name: "Batch Project",
      managerId: manager.item.id,
      status: "ACTIVE",
    }));

    const batch = expectSuccess(await client.employeesBatchCreate({
      employees: [
        {
          firstName: "Nora",
          lastName: "Kaci",
          phone: "0612345621",
          roleId: roleIds.worker,
          status: "ACTIVE",
          managerId: manager.item.id,
          projectId: project.item.id,
        },
        {
          firstName: "Rania",
          lastName: "Bouzid",
          phone: "0612345622",
          roleId: roleIds.warehouseManager,
          status: "ACTIVE",
        },
      ],
    }));

    expect(batch.item.employees).toHaveLength(2);
    expect(batch.item.managerAssignments).toHaveLength(1);
    expect(batch.item.managerAssignments[0]?.managerId).toBe(manager.item.id);

    await expect(client.managerAssignmentsList()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ managerId: manager.item.id, status: "ACTIVE" }),
      ]),
    });
  });

  it("deletes an employee through the RPC contract", async () => {
    const { service, roleIds } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const client = createRouterClient(router, { context: createContext() as never });

    const worker = expectSuccess(await client.employeesCreate({
      firstName: "Nora",
      lastName: "Kaci",
      phone: "0612345626",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }));

    await expect(client.employeesDelete({ id: worker.item.id })).resolves.toEqual({
      success: true,
      message: "تم حذف العامل نهائيًا بنجاح.",
    });

    await expect(client.employeesList()).resolves.toMatchObject({
      items: expect.not.arrayContaining([expect.objectContaining({ id: worker.item.id })]),
    });
  });

  it("rejects deleting an employee with existing work links", async () => {
    const { service, roleIds } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const client = createRouterClient(router, { context: createContext() as never });

    const manager = expectSuccess(await client.employeesCreate({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345625",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }));
    const worker = expectSuccess(await client.employeesCreate({
      firstName: "Nora",
      lastName: "Kaci",
      phone: "0612345628",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }));
    const project = expectSuccess(await client.projectsCreate({
      name: "Delete Flow",
      managerId: manager.item.id,
      status: "ACTIVE",
    }));

    await client.managerAssignmentsCreate({
      workerId: worker.item.id,
      managerId: manager.item.id,
      status: "ACTIVE",
    });
    await client.projectAssignmentsCreate({
      employeeId: worker.item.id,
      projectId: project.item.id,
      status: "ACTIVE",
    });

    await expect(client.employeesDelete({ id: worker.item.id })).resolves.toEqual({
      success: false,
      error: {
        code: "BUSINESS_RULE",
        message: "لا يمكن حذف العامل نهائيًا لأنه مرتبط بسجل عمل أو بإدارة قائمة. استخدم إنهاء بدلًا من ذلك.",
        fieldErrors: [],
      },
    });
  });

  it("creates warehouse assignments through the RPC contract", async () => {
    const { service, roleIds } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const client = createRouterClient(router, { context: createContext() as never });

    const employee = expectSuccess(await client.employeesCreate({
      firstName: "Rania",
      lastName: "Bouzid",
      phone: "0612345631",
      roleId: roleIds.warehouseManager,
      status: "ACTIVE",
    }));
    const warehouse = expectSuccess(await client.warehousesCreate({
      name: "Ops Warehouse",
      status: "ACTIVE",
      managerId: null,
    }));

    const assignment = expectSuccess(await client.warehouseAssignmentsCreate({
      employeeId: employee.item.id,
      warehouseId: warehouse.item.id,
      status: "ACTIVE",
    }));

    expect(assignment.item.warehouseId).toBe(warehouse.item.id);
  });

  it("assigns employee workplace atomically through the RPC contract", async () => {
    const { service, roleIds } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const client = createRouterClient(router, { context: createContext() as never });

    const manager = expectSuccess(await client.employeesCreate({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345634",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }));
    const employee = expectSuccess(await client.employeesCreate({
      firstName: "Rania",
      lastName: "Bouzid",
      phone: "0612345635",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }));
    const project = expectSuccess(await client.projectsCreate({
      name: "Ops Project 2",
      managerId: manager.item.id,
      status: "ACTIVE",
    }));

    await expect(
      client.employeesAssignWorkplace({
        employeeId: employee.item.id,
        managerId: manager.item.id,
        nextType: "PROJECT",
        projectId: project.item.id,
      }),
    ).resolves.toEqual({ success: true, message: "تم تحديث مكان العمل بنجاح." });
  });

  it("syncs managed projects through the RPC contract", async () => {
    const { service, roleIds } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const client = createRouterClient(router, { context: createContext() as never });

    const manager = expectSuccess(await client.employeesCreate({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345638",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }));
    const project = expectSuccess(await client.projectsCreate({
      name: "Managed Project",
      status: "ACTIVE",
      managerId: null,
    }));

    await expect(
      client.employeesSyncManagedProjects({
        employeeId: manager.item.id,
        projectIds: [project.item.id],
      }),
    ).resolves.toEqual({ success: true, message: "تم تحديث المشاريع المُدارة بنجاح." });
  });

  it("lists grouped system log rows through the RPC contract", async () => {
    const { service, roleIds } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const client = createRouterClient(router, { context: createContext() as never });

    const manager = expectSuccess(await client.employeesCreate({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345662",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }));
    const employee = expectSuccess(await client.employeesCreate({
      firstName: "Rania",
      lastName: "Bouzid",
      phone: "0612345663",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }));
    const project = expectSuccess(await client.projectsCreate({
      name: "System Log Project",
      managerId: manager.item.id,
      status: "ACTIVE",
    }));

    await client.employeesAssignWorkplace({
      employeeId: employee.item.id,
      managerId: manager.item.id,
      nextType: "PROJECT",
      projectId: project.item.id,
    })

    await expect(client.systemLogList()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          actorUserId: currentUser.id,
          summary: expect.any(String),
        }),
      ]),
    })
  })
});
