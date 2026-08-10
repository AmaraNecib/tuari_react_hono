/* This file is a black-box test of the implemented router through the
   untyped client proxy and intentionally does not type-check (the client
   type is not derived from the router), hence @ts-nocheck below. */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInMemoryCompanyHarness } from "../modules/company/company.test-helpers";
import { WorkforceService } from "../modules/company/workforce.service";
import { OperationsService } from "../modules/company/operations.service";
import { FinanceService } from "../modules/company/finance.service";
import { WorkspaceMutationContext } from "../modules/company/workspace-mutation-context";
import { RecoveryKeyService } from "../modules/auth/recovery-key.service";
import { createRouter } from "./router";
import type { RpcContext } from "./context";
import { EmployeeModule } from "../modules/workforce/employee.module";
import { SqliteEmployeeRepository } from "../modules/workforce/adapters/employee.repository";
import { SqliteRoleRepository } from "../modules/workforce/adapters/role.repository";
import { RoleModule } from "../modules/rbac/role.module";
import { InMemoryRoleRepository } from "../modules/rbac/adapters/in-memory-role.repository";
import { DEFAULT_ROLE_PERMISSIONS } from "../modules/rbac/role-seeds";

function expectSuccess<T extends { success: boolean }>(result: T): Extract<T, { success: true }> {
  expect(result.success).toBe(true);
  return result as Extract<T, { success: true }>;
}

type RpcClient = ReturnType<typeof createRouterClient<never, never>>

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

  const createTestRouter = (
    harness: ReturnType<typeof createHarness>,
    authOverrides?: Partial<typeof authBootstrapService>,
    recoveryKeyService: unknown = {},
    databaseKeyManager: unknown = {
      changeKey: () => ({ success: false, error: "Current encryption key is invalid" }),
    },
  ) => {
    const { service, repository } = harness;
    const employeeRepository = new SqliteEmployeeRepository(repository);
    const roleRepository = new SqliteRoleRepository(repository);
    const employeeModule = new EmployeeModule({ employeeRepository, roleRepository });
    const invoiceRepository = {} as never;
    const invoiceDebtPort = {} as never;
    const paymentModule = {
      create: async () => ({ id: "", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: "", paymentDate: "", paymentMethod: "CASH", totalAmount: 0, notes: null, actorUserId: null, actorLabel: null, transactionId: null, createdAt: "", updatedAt: "", allocations: [] }),
      findById: async () => null,
      listPaged: async () => ({ items: [], nextCursor: null, totalCount: 0 }),
      delete: async () => undefined,
    } as never;
    const mutation = new WorkspaceMutationContext(repository);
    const rbacRoleRepository = new InMemoryRoleRepository();
    for (const seed of DEFAULT_ROLE_PERMISSIONS) {
      rbacRoleRepository.seed({
        id: `id-${seed.role.key}`,
        key: seed.role.key,
        name: seed.role.name,
        description: seed.role.description,
        isSystem: seed.role.isSystem,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        permissions: [...seed.permissions],
      });
    }
    const roleModule = new RoleModule({ repository: rbacRoleRepository });
    return createRouter({
      authBootstrapService: { ...authBootstrapService, ...authOverrides },
      companyService: service,
      workforceService: new WorkforceService(repository, repository, mutation),
      operationsService: new OperationsService(repository, repository, mutation),
      financeService: new FinanceService(repository, repository, mutation),
      inventoryService: {} as never,
      employeeModule,
      invoiceModule: {} as never,
      paymentModule,
      roleModule,
      recoveryKeyService: recoveryKeyService as never,
      updateService: {} as never,
      updateHistoryService: {} as never,
      databaseKeyManager: databaseKeyManager as never,
    } as never);
  }

  const currentUser = {
    id: "user-1",
    name: "Taylor",
    phone: "0612345678",
    permissions: [
      "employees:create",
      "employees:read",
      "employees:update",
      "employees:delete",
      "projects:create",
      "projects:read",
      "projects:update",
      "projects:delete",
      "warehouses:create",
      "warehouses:read",
      "warehouses:update",
      "warehouses:delete",
      "inventory:create",
      "inventory:read",
      "inventory:update",
      "inventory:delete",
      "inventory:transfer",
      "debts:create",
      "debts:read",
      "debts:update",
      "debts:settle",
      "invoices:create",
      "invoices:read",
      "invoices:update",
      "invoices:delete",
      "payments:create",
      "payments:read",
      "payments:update",
      "payments:delete",
    ],
    version: "0.0.0",
  };

  // The session contract schema strips internal fields like permissions
  const sessionUser = {
    id: currentUser.id,
    name: currentUser.name,
    phone: currentUser.phone,
    version: currentUser.version,
  };

  const createContext = (user: typeof currentUser | null = currentUser): RpcContext => ({
    headers: new Headers({ cookie: "session=token" }),
    resolveCurrentUser: vi.fn().mockResolvedValue(user),
  });

  const createClient = (router: unknown, context: RpcContext): unknown =>
    createRouterClient(router, { context: context as never }) as unknown;

  it("returns the resolved current user for the session procedure", async () => {
    const harness = createHarness();
    const { service } = harness;
    const router = createTestRouter(harness)
    const context = createContext();
    const client = createClient(router, context);

    await expect(client.session()).resolves.toEqual({
      user: sessionUser,
    });
    expect(context.resolveCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("reports whether the first auth user has already been created", async () => {
    const harness = createHarness();
    const { service } = harness;
    const router = createTestRouter(harness)
    const client = createRouterClient(router, { context: createContext(null) as never });

    await expect(client.authSetupStatus()).resolves.toEqual({ hasUsers: false, requiresSetupKey: false });
  });

  it("keeps public health checks unauthenticated", async () => {
    const harness = createHarness();
    const { service } = harness;
    const router = createTestRouter(harness)
    const context = createContext();
    const client = createClient(router, context);

    await expect(client.health()).resolves.toMatchObject({ status: "ok" });
    expect(context.resolveCurrentUser).not.toHaveBeenCalled();
  });

  it("rejects protected procedures when no session exists", async () => {
    const harness = createHarness();
    const { service } = harness;
    const router = createTestRouter(harness)
    const client = createRouterClient(router, { context: createContext(null) as never });

    await expect(client.rolesList()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows non-admin users with RBAC permission to create employees", async () => {
    const harness = createHarness();
    const { service, roleIds } = harness;
    const router = createTestRouter(harness, { isBootstrapOwner: async () => false })
    const client = createRouterClient(router, { context: createContext() as never });

    const result = await client.employeesCreate({
      firstName: "Nora",
      lastName: "Kaci",
      phone: "0612345690",
      roleId: roleIds.worker,
      status: "ACTIVE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects employee creation when user lacks employees:create permission", async () => {
    const harness = createHarness();
    const { service, roleIds } = harness;
    const router = createTestRouter(harness, { isBootstrapOwner: async () => false })
    const noPermsUser = { ...currentUser, permissions: [] as string[] };
    const client = createRouterClient(router, { context: createContext(noPermsUser) as never });

    await expect(
      client.employeesCreate({
        firstName: "Nora",
        lastName: "Kaci",
        phone: "0612345690",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("covers CRUD and assignment flows with typed business-rule failures", async () => {
    const harness = createHarness();
    const { service, roleIds } = harness;
    const router = createTestRouter(harness)
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
    await expect(client.employeesListPaged({ limit: 10 })).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: worker.item.id, phone: "0612345602" }),
      ]),
      hasMore: false,
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
    const harness = createHarness();
    const { service, roleIds } = harness;
    const router = createTestRouter(harness)
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
    const harness = createHarness();
    const { service, roleIds } = harness;
    const router = createTestRouter(harness)
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
    const harness = createHarness();
    const { service, roleIds } = harness;
    const router = createTestRouter(harness)
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
    const harness = createHarness();
    const { service, roleIds } = harness;
    const router = createTestRouter(harness)
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
    const harness = createHarness();
    const { service, roleIds } = harness;
    const router = createTestRouter(harness)
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
    const harness = createHarness();
    const { service, roleIds } = harness;
    const router = createTestRouter(harness)
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
    const harness = createHarness();
    const { service, roleIds } = harness;
    const router = createTestRouter(harness)
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

  it("covers external counterparty and debt flows through the RPC contract", async () => {
    const harness = createHarness();
    const { service, roleIds } = harness;
    const router = createTestRouter(harness)
    const client = createRouterClient(router, { context: createContext() as never })

    const worker = expectSuccess(
      await client.employeesCreate({
        firstName: "Debt",
        lastName: "Worker",
        phone: "0612345674",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }),
    )

    const internalAccount = expectSuccess(
      await client.debtAccountsCreate({
        partyType: "INTERNAL_WORKER",
        workerId: worker.item.id,
        openingBalanceDzd: 1000,
      }),
    )

    expect(internalAccount.item.actorUserId).toBe(currentUser.id)

    const externalCounterparty = expectSuccess(
      await client.externalCounterpartiesCreate({
        fullName: "مقاول خارجي",
        phoneNumber: "0612345675",
        note: "تعامل أول",
      }),
    )

    const externalAccount = expectSuccess(
      await client.debtAccountsCreate({
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: externalCounterparty.item.id,
      }),
    )

    const secondWorkerMutation = expectSuccess(
      await client.debtAccountsCreate({
        partyType: "INTERNAL_WORKER",
        workerId: worker.item.id,
        openingBalanceDzd: -300,
      }),
    )

    const thirdWorkerMutation = expectSuccess(
      await client.debtAccountsCreate({
        partyType: "INTERNAL_WORKER",
        workerId: worker.item.id,
        openingBalanceDzd: 500,
      }),
    )

    expect(secondWorkerMutation.item.id).toBe(internalAccount.item.id)
    expect(thirdWorkerMutation.item.id).toBe(internalAccount.item.id)

    expect((await client.debtAccountsList({ workerId: worker.item.id })).items).toHaveLength(1)

    const payment = expectSuccess(
      await client.debtEntriesCreate({
        debtAccountId: internalAccount.item.id,
        entryType: "PAYMENT",
        signedAmountDzd: -250,
        note: "دفعة جزئية",
      }),
    )
    expect(payment.item.balanceAfterDzd).toBe(950)

    const settlement = expectSuccess(await client.debtAccountsSettle({ id: internalAccount.item.id }))
    expect(settlement.item.entryType).toBe("SETTLEMENT")
    expect(settlement.item.balanceAfterDzd).toBe(0)

    await expect(client.debtEntriesList({ debtAccountId: internalAccount.item.id })).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ entryType: "SETTLEMENT" }),
        expect.objectContaining({ entryType: "PAYMENT" }),
        expect.objectContaining({ entryType: "OPENING" }),
        expect.objectContaining({ entryType: "ADJUSTMENT", signedAmountDzd: -300 }),
        expect.objectContaining({ entryType: "ADJUSTMENT", signedAmountDzd: 500 }),
      ]),
    })

    const partyDetail = expectSuccess(
      await client.debtPartyDetail({
        partyType: "INTERNAL_WORKER",
        workerId: worker.item.id,
      }),
    )
    expect(partyDetail.item.debtAccounts).toHaveLength(1)

    await expect(client.debtsSummary()).resolves.toMatchObject({
      parties: expect.arrayContaining([
        expect.objectContaining({ workerId: worker.item.id, openDebtCasesCount: 0, settledDebtCasesCount: 1 }),
      ]),
      debtAccounts: expect.arrayContaining([
        expect.objectContaining({ accountId: internalAccount.item.id, balanceLabel: "مغلق" }),
        expect.objectContaining({ accountId: externalAccount.item.id, displayName: "مقاول خارجي" }),
      ]),
    })

    await expect(client.systemLogList()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ actionType: "DEBT_SETTLED" }),
      ]),
    })
  })

  it("consumes and revokes recovery keys through the RPC contract (derived inputs)", async () => {
    const harness = createHarness();
    const consumeKey = vi.fn().mockReturnValue(true);
    const revokeKey = vi.fn().mockReturnValue(true);
    const router = createTestRouter(harness, undefined, { consumeKey, revokeKey });
    const client = createRouterClient(router, { context: createContext() as never });

    await expect(
      client.consumeRecoveryKey({ key: "a1b2-c3d4-e5f6" }),
    ).resolves.toEqual({ success: true });
    expect(consumeKey).toHaveBeenCalledWith("a1b2-c3d4-e5f6");

    await expect(
      client.revokeRecoveryKey({ keyId: "key-1" }),
    ).resolves.toEqual({ success: true });
    expect(revokeKey).toHaveBeenCalledWith("key-1");

    // #221: the wire contract trims copied keys before the handler sees them,
    // so a key pasted with accidental surrounding whitespace still matches.
    await expect(
      client.consumeRecoveryKey({ key: "  a1b2-c3d4-e5f6  " }),
    ).resolves.toEqual({ success: true });
    expect(consumeKey).toHaveBeenLastCalledWith("a1b2-c3d4-e5f6");

    await expect(
      client.revokeRecoveryKey({ keyId: "  key-1  " }),
    ).resolves.toEqual({ success: true });
    expect(revokeKey).toHaveBeenLastCalledWith("key-1");
  });

  it("returns the recovery key pool status through the wire contract (getRecoveryKeyPool passthrough)", async () => {
    const harness = createHarness();
    // Real service on a stubbed RecoveryKeyPort: the pool-status shape that
    // flows out is produced by service logic (counts derived from the records),
    // so the assertion pins both the passthrough and the ORPC output schema.
    const records = [
      { id: "key-1", prefix: "a1b2", keyHash: "h1", status: "AVAILABLE", consumedAt: null, revokedAt: null, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "key-2", prefix: "c3d4", keyHash: "h2", status: "CONSUMED", consumedAt: "2026-01-02T00:00:00.000Z", revokedAt: null, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "key-3", prefix: "e5f6", keyHash: "h3", status: "REVOKED", consumedAt: null, revokedAt: "2026-01-03T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    const listAllKeys = vi.fn().mockResolvedValue(records);
    const recoveryKeyService = new RecoveryKeyService({
      insertKey: vi.fn(),
      findKeyByHash: vi.fn(),
      updateKeyStatus: vi.fn(),
      countAvailableKeys: vi.fn(),
      listAllKeys,
      withTransaction: vi.fn(),
    });
    const router = createTestRouter(harness, undefined, recoveryKeyService);
    const client = createRouterClient(router, { context: createContext() as never });

    await expect(client.getRecoveryKeyPool()).resolves.toEqual({
      availableCount: 1,
      totalCount: 3,
      maxPoolSize: 5,
      maskedKeys: [
        { id: "key-1", prefix: "a1b2", status: "AVAILABLE" },
        { id: "key-2", prefix: "c3d4", status: "CONSUMED" },
        { id: "key-3", prefix: "e5f6", status: "REVOKED" },
      ],
    });
    expect(listAllKeys).toHaveBeenCalledTimes(1);
  });

  it("returns generated recovery keys through the wire contract (generateRecoveryKeys passthrough)", async () => {
    const harness = createHarness();
    // Stubbed port reports an empty pool; the real service generates
    // INITIAL_KEY_COUNT (3) keys inside withTransaction and the handler wraps
    // them as { keys }, which must satisfy generatedRecoveryKeysSchema.
    const insertKey = vi.fn();
    const stubPort = {
      insertKey,
      findKeyByHash: vi.fn(),
      updateKeyStatus: vi.fn(),
      countAvailableKeys: vi.fn().mockResolvedValue(0),
      listAllKeys: vi.fn().mockResolvedValue([]),
      withTransaction: vi.fn(async (run) => run(stubPort)),
    };
    const recoveryKeyService = new RecoveryKeyService(stubPort);
    const router = createTestRouter(harness, undefined, recoveryKeyService);
    const client = createRouterClient(router, { context: createContext() as never });

    const result = await client.generateRecoveryKeys();
    expect(result.keys).toHaveLength(3);
    for (const k of result.keys) {
      expect(k.key).toMatch(/^[0-9a-f]{6}-[0-9a-f]{6}-[0-9a-f]{6}$/);
      expect(k.prefix).toMatch(/^[0-9a-f]{4}$/);
      expect(k.createdAt).toBeTruthy();
    }
    expect(insertKey).toHaveBeenCalledTimes(3);
  });

  it("rejects invalid auth bootstrap input at the wire contract", async () => {
    const harness = createHarness();
    const bootstrapFirstUser = vi.fn();
    const router = createTestRouter(harness, { bootstrapFirstUser: bootstrapFirstUser as never });
    const client = createRouterClient(router, { context: createContext(null) as never });

    // BAD_REQUEST proves the authBootstrapInputSchema gate fired before the
    // handler — the service-level validation is defense-in-depth only.
    await expect(
      client.authBootstrap({ name: "", phone: "   ", password: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(bootstrapFirstUser).not.toHaveBeenCalled();
  });

  it("rejects invalid recovery/DB key input at the wire contract", async () => {
    const harness = createHarness();
    const router = createTestRouter(harness);
    const client = createRouterClient(router, { context: createContext() as never });

    // ORPC input validation maps to an ORPCError with code BAD_REQUEST —
    // distinct from any handler-side throw (which would surface differently).
    await expect(client.consumeRecoveryKey({ key: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(client.revokeRecoveryKey({ keyId: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    // #221: whitespace-only keys are rejected at the wire gate after trimming.
    await expect(client.consumeRecoveryKey({ key: "   " })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(client.revokeRecoveryKey({ keyId: "   " })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    // #221: the DB-key half of the same gate — whitespace-only currentKey and
    // a newKey that is all spaces are rejected before any PRAGMA is built.
    await expect(
      client.changeDbEncryptionKey({ currentKey: "   ", newKey: "new-key-123" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      client.changeDbEncryptionKey({ currentKey: "old-key", newKey: "        " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("forwards a failed recovery key consumption through the wire contract", async () => {
    const harness = createHarness();
    const router = createTestRouter(harness, undefined, {
      consumeKey: vi.fn().mockReturnValue(false),
      revokeKey: vi.fn().mockReturnValue(true),
    });
    const client = createRouterClient(router, { context: createContext() as never });

    await expect(
      client.consumeRecoveryKey({ key: "already-consumed" }),
    ).resolves.toEqual({ success: false });
  });

  it("returns a graceful failure when the db key change cannot be verified (derived input)", async () => {
    const harness = createHarness();
    const router = createTestRouter(harness);
    const client = createRouterClient(router, { context: createContext() as never });

    // databaseKeyManager defaults to a rejecting stub (changeKey → the wire
    // failure shape), so the handler returns the failure output from
    // changeDbKeyOutputSchema. The success leg is covered in the next test.
    await expect(
      client.changeDbEncryptionKey({ currentKey: "old-key", newKey: "new-key-123" }),
    ).resolves.toEqual({ success: false, error: "Current encryption key is invalid" });
  });

  it("rekeys the database and returns success through the wire contract", async () => {
    const harness = createHarness();
    const changeKey = vi.fn((_currentKey: string, _newKey: string) => ({ success: true } as const));
    const router = createTestRouter(harness, undefined, {}, { changeKey });
    const client = createRouterClient(router, { context: createContext() as never });

    // The success leg of changeDbKeyOutputSchema ({ success: true }) is
    // validated through the wire: the port verifies the current key, runs the
    // rekey, and the discriminated-union output accepts the success member.
    // (The exact PRAGMA statements are pinned in the port's own unit tests.)
    await expect(
      client.changeDbEncryptionKey({ currentKey: "old-key", newKey: "new-key-123" }),
    ).resolves.toEqual({ success: true });
    expect(changeKey).toHaveBeenNthCalledWith(1, "old-key", "new-key-123");

    // A key containing a single quote is passed through untouched — the port
    // escapes it ('' doubling), not the handler.
    await expect(
      client.changeDbEncryptionKey({ currentKey: "old-key", newKey: "new-key-'quoted'" }),
    ).resolves.toEqual({ success: true });
    expect(changeKey).toHaveBeenLastCalledWith("old-key", "new-key-'quoted'");
  });

  it("generates an inventory report through the RPC contract (derived filter input)", async () => {
    const harness = createHarness();
    const router = createTestRouter(harness);
    const client = createRouterClient(router, { context: createContext() as never });

    await expect(
      client.reportsGenerate({ type: "INVENTORY" }),
    ).resolves.toMatchObject({
      type: "INVENTORY",
      summary: { totalValueDzd: 0 },
    });
  });

  it("rejects an unknown report type at the wire contract", async () => {
    const harness = createHarness();
    const router = createTestRouter(harness);
    const client = createRouterClient(router, { context: createContext() as never });

    // BAD_REQUEST proves the reportFilterInputSchema enum rejected it at the
    // wire — the handler's own `default:` throw would surface differently.
    await expect(client.reportsGenerate({ type: "BOGUS" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("generates debt and movement reports through the RPC contract (derived filter input)", async () => {
    const harness = createHarness();
    const router = createTestRouter(harness);
    const client = createRouterClient(router, { context: createContext() as never });

    await expect(client.reportsGenerate({ type: "DEBT" })).resolves.toMatchObject({
      type: "DEBT",
      summary: { totalOutstandingDzd: 0 },
    });

    await expect(client.reportsGenerate({ type: "MOVEMENT" })).resolves.toMatchObject({
      type: "MOVEMENT",
      summary: { totalMovements: 0 },
    });
  });
});
