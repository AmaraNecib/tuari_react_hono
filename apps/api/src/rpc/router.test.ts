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
    const client = createRouterClient(router, { context });

    await expect(client.session()).resolves.toEqual({
      user: currentUser,
    });
    expect(context.resolveCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("reports whether the first auth user has already been created", async () => {
    const { service } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const client = createRouterClient(router, { context: createContext(null) });

    await expect(client.authSetupStatus()).resolves.toEqual({ hasUsers: false, requiresSetupKey: false });
  });

  it("keeps public health checks unauthenticated", async () => {
    const { service } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const context = createContext();
    const client = createRouterClient(router, { context });

    await expect(client.health()).resolves.toMatchObject({ status: "ok" });
    expect(context.resolveCurrentUser).not.toHaveBeenCalled();
  });

  it("rejects protected procedures when no session exists", async () => {
    const { service } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const client = createRouterClient(router, { context: createContext(null) });

    await expect(client.rolesList()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("covers CRUD and assignment flows with typed business-rule failures", async () => {
    const { service, roleIds } = createHarness();
    const router = createRouter({ authBootstrapService, companyService: service });
    const client = createRouterClient(router, { context: createContext() });

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
});
