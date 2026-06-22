import { afterEach, describe, expect, it, vi } from "vitest";

import { CompanyError } from "./company.errors";
import { CompanyService } from "./company.service";
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

  const createAuditContext = (overrides?: Partial<{ actorLabel: string; actorUserId: string; transactionId: string }>) => ({
    actorLabel: overrides?.actorLabel ?? "مدير التشغيل",
    actorUserId: overrides?.actorUserId ?? "admin-user-1",
    transactionId: overrides?.transactionId ?? crypto.randomUUID(),
  })

  it("rejects mutating service calls without an actor when admin authorizer is configured", () => {
    const { repository } = createHarness();
    const service = new CompanyService(repository, { isBootstrapOwner: () => true });

    expect(() => service.createProject({ name: "No actor", status: "ACTIVE" })).toThrowError(CompanyError);
  });

  it("rejects mutating service calls from non-admin actors", () => {
    const { repository } = createHarness();
    const service = new CompanyService(repository, { isBootstrapOwner: (id) => id === "admin-user-1" });

    expect(() =>
      service.createProject(
        { name: "Wrong actor", status: "ACTIVE" },
        createAuditContext({ actorUserId: "regular-user-1" }),
      ),
    ).toThrowError(CompanyError);
  });

  it("allows mutating service calls from bootstrap owner actors", () => {
    const { repository } = createHarness();
    const service = new CompanyService(repository, { isBootstrapOwner: (id) => id === "admin-user-1" });

    const result = service.createProject(
      { name: "Authorized project", status: "ACTIVE" },
      createAuditContext({ actorUserId: "admin-user-1" }),
    );

    expect(result.success).toBe(true);
  });

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

  it("creates employee batches atomically with manager assignments", () => {
    const { repository, service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345609",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const project = service.createProject({
      name: "North Site",
      managerId: manager.id,
      status: "ACTIVE",
    }).item;

    const result = service.createEmployeesBatch({
      employees: [
        {
          firstName: "Nora",
          lastName: "Kaci",
          phone: "0612345614",
          roleId: roleIds.worker,
          status: "ACTIVE",
          managerId: manager.id,
          projectId: project.id,
        },
        {
          firstName: "Rania",
          lastName: "Bouzid",
          phone: "0612345615",
          roleId: roleIds.warehouseManager,
          status: "ACTIVE",
        },
      ],
    });

    expect(result.item.employees).toHaveLength(2);
    expect(result.item.managerAssignments).toHaveLength(1);
    expect(result.item.projectAssignments).toHaveLength(1);
    expect(result.item.managerAssignments[0]?.managerId).toBe(manager.id);
    expect(service.listEmployees().items).toHaveLength(3);
  });

  it("rolls back the full employee batch when any row is invalid", () => {
    const { service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345616",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const project = service.createProject({
      name: "North Site",
      managerId: manager.id,
      status: "ACTIVE",
    }).item;

    expect(() =>
      service.createEmployeesBatch({
        employees: [
          {
            firstName: "Nora",
            lastName: "Kaci",
            phone: "0612345617",
            roleId: roleIds.worker,
            status: "ACTIVE",
            managerId: manager.id,
            projectId: project.id,
          },
          {
            firstName: "Rania",
            lastName: "Bouzid",
            phone: "0612345616",
            roleId: roleIds.worker,
            status: "ACTIVE",
          },
        ],
      }),
    ).toThrowError(CompanyError);

    expect(service.listEmployees().items.map((employee) => employee.phone)).toEqual(["0612345616"]);
  });

  it("deletes an employee and clears related links", () => {
    const { service, roleIds } = createHarness();
    const worker = service.createEmployee({
      firstName: "Nora",
      lastName: "Kaci",
      phone: "0612345624",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;

    expect(service.deleteEmployee(worker.id).success).toBe(true);
    expect(service.listEmployees().items.map((employee) => employee.id)).not.toContain(worker.id);
  });

  it("rejects deleting an employee that already has work history", () => {
    const { service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345623",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "Nora",
      lastName: "Kaci",
      phone: "0612345627",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const project = service.createProject({
      name: "North Site",
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

    expect(() => service.deleteEmployee(worker.id)).toThrowError(CompanyError);
  });

  it("creates and ends warehouse assignments", () => {
    const { service, roleIds } = createHarness();
    const warehouseWorker = service.createEmployee({
      firstName: "Yara",
      lastName: "Toumi",
      phone: "0612345630",
      roleId: roleIds.warehouseManager,
      status: "ACTIVE",
    }).item;
    const warehouse = service.createWarehouse({
      name: "Central Warehouse",
      status: "ACTIVE",
      managerId: null,
    }).item;

    const assignment = service.createWarehouseAssignment({
      employeeId: warehouseWorker.id,
      warehouseId: warehouse.id,
      status: "ACTIVE",
    });

    expect(assignment.item.warehouseId).toBe(warehouse.id);
    expect(service.listWarehouseAssignments().items).toHaveLength(1);

    const ended = service.endWarehouseAssignment({ id: assignment.item.id });
    expect(ended.item.status).toBe("ENDED");
  });

  it("reassigns workplace atomically between projects under the same manager", () => {
    const { service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345632",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "Yara",
      lastName: "Toumi",
      phone: "0612345636",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const projectA = service.createProject({ name: "A", status: "ACTIVE", managerId: manager.id }).item;
    const projectB = service.createProject({ name: "B", status: "ACTIVE", managerId: manager.id }).item;

    service.assignEmployeeWorkplace({
      employeeId: worker.id,
      nextType: "PROJECT",
      managerId: manager.id,
      projectId: projectA.id,
    });
    service.assignEmployeeWorkplace({
      employeeId: worker.id,
      nextType: "PROJECT",
      managerId: manager.id,
      projectId: projectB.id,
    });

    const assignments = service.listProjectAssignments({ employeeId: worker.id }).items;
    expect(assignments.filter((assignment) => assignment.status === "ACTIVE")).toHaveLength(1);
    expect(assignments.find((assignment) => assignment.status === "ACTIVE")?.projectId).toBe(projectB.id);
  });

  it("does not write extra workplace rows for a no-op workplace save", () => {
    const { service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345634",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "Yara",
      lastName: "Toumi",
      phone: "0612345635",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const project = service.createProject({ name: "Same Project", status: "ACTIVE", managerId: manager.id }).item;

    service.assignEmployeeWorkplace({
      employeeId: worker.id,
      nextType: "PROJECT",
      managerId: manager.id,
      projectId: project.id,
    });
    service.assignEmployeeWorkplace({
      employeeId: worker.id,
      nextType: "PROJECT",
      managerId: manager.id,
      projectId: project.id,
    });

    expect(service.listManagerAssignments({ workerId: worker.id }).items).toHaveLength(1)
    expect(service.listProjectAssignments({ employeeId: worker.id }).items).toHaveLength(1)
    expect(service.listProjectAssignments({ employeeId: worker.id }).items[0]?.status).toBe("ACTIVE")
  })

  it("rejects archiving a warehouse while active warehouse assignments still point to it", () => {
    const { service, roleIds } = createHarness();
    const warehouseWorker = service.createEmployee({
      firstName: "Yara",
      lastName: "Toumi",
      phone: "0612345633",
      roleId: roleIds.warehouseManager,
      status: "ACTIVE",
    }).item;
    const warehouse = service.createWarehouse({ name: "Central", status: "ACTIVE" }).item;

    service.createWarehouseAssignment({
      employeeId: warehouseWorker.id,
      warehouseId: warehouse.id,
      status: "ACTIVE",
    });

    expect(() =>
      service.updateWarehouse({
        id: warehouse.id,
        status: "ARCHIVED",
      }),
    ).toThrowError(CompanyError);
  });

  it("rejects archiving a warehouse while it still has an active manager", () => {
    const { service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "Salim",
      lastName: "Mebarki",
      phone: "0612345644",
      roleId: roleIds.warehouseManager,
      status: "ACTIVE",
    }).item;
    const warehouse = service.createWarehouse({
      name: "Managed Warehouse",
      status: "ACTIVE",
      managerId: manager.id,
    }).item;

    expect(() =>
      service.updateWarehouse({
        id: warehouse.id,
        status: "ARCHIVED",
      }),
    ).toThrowError(CompanyError);
  });

  it("reassigns active project workers to the new project manager without rewriting project assignment history", () => {
    const { service, roleIds } = createHarness();
    const managerA = service.createEmployee({
      firstName: "Manager",
      lastName: "One",
      phone: "0612345645",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const managerB = service.createEmployee({
      firstName: "Manager",
      lastName: "Two",
      phone: "0612345646",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "Worker",
      lastName: "Project",
      phone: "0612345647",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const project = service.createProject({
      name: "Reassign Project",
      managerId: managerA.id,
      status: "ACTIVE",
    }).item;

    service.createManagerAssignment({
      workerId: worker.id,
      managerId: managerA.id,
      status: "ACTIVE",
    });
    service.createProjectAssignment({
      employeeId: worker.id,
      projectId: project.id,
      status: "ACTIVE",
    });

    service.updateProject({ id: project.id, managerId: managerB.id });

    const managerAssignments = service.listManagerAssignments({ workerId: worker.id }).items;
    const projectAssignments = service.listProjectAssignments({ employeeId: worker.id }).items;

    expect(projectAssignments).toHaveLength(1);
    expect(projectAssignments[0]?.status).toBe("ACTIVE");
    expect(projectAssignments[0]?.projectId).toBe(project.id);

    expect(managerAssignments).toHaveLength(2);
    expect(managerAssignments.filter((assignment) => assignment.status === "ACTIVE")).toHaveLength(1);
    expect(managerAssignments.find((assignment) => assignment.status === "ACTIVE")?.managerId).toBe(managerB.id);
    expect(managerAssignments.find((assignment) => assignment.status === "ENDED")?.managerId).toBe(managerA.id);
  });

  it("rejects removing a project manager while active workers still follow that project", () => {
    const { service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "Manager",
      lastName: "Active",
      phone: "0612345648",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "Worker",
      lastName: "Linked",
      phone: "0612345649",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const project = service.createProject({
      name: "Linked Project",
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
        managerId: null,
      }),
    ).toThrowError(CompanyError);
  });

  it("rejects project manager propagation when worker manager links are already inconsistent", () => {
    const { repository, service, roleIds } = createHarness();
    const managerA = service.createEmployee({
      firstName: "Manager",
      lastName: "Current",
      phone: "0612345650",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const managerB = service.createEmployee({
      firstName: "Manager",
      lastName: "Next",
      phone: "0612345651",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const unrelatedManager = service.createEmployee({
      firstName: "Manager",
      lastName: "Drift",
      phone: "0612345652",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const worker = service.createEmployee({
      firstName: "Worker",
      lastName: "Mismatch",
      phone: "0612345653",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    const project = service.createProject({
      name: "Consistency Guard",
      managerId: managerA.id,
      status: "ACTIVE",
    }).item;

    repository.createManagerAssignment({
      workerId: worker.id,
      managerId: unrelatedManager.id,
      status: "ACTIVE",
      startDate: new Date().toISOString(),
    });
    repository.createProjectAssignment({
      employeeId: worker.id,
      projectId: project.id,
      status: "ACTIVE",
      startDate: new Date().toISOString(),
    });

    expect(() =>
      service.updateProject({
        id: project.id,
        managerId: managerB.id,
      }),
    ).toThrowError(CompanyError);
  });

  it("syncs managed projects atomically for a project manager", () => {
    const { service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "Mourad",
      lastName: "Saadi",
      phone: "0612345637",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    const projectA = service.createProject({ name: "A", status: "ACTIVE" }).item;
    const projectB = service.createProject({ name: "B", status: "ACTIVE" }).item;

    service.syncManagedProjects({ employeeId: manager.id, projectIds: [projectA.id, projectB.id] });

    const managed = service.listProjects({ managerId: manager.id }).items.map((project) => project.id);
    expect(managed).toEqual(expect.arrayContaining([projectA.id, projectB.id]));
  });

  it("stores actor metadata on salary payments", () => {
    const { service, roleIds } = createHarness();
    const audit = createAuditContext()
    const worker = service.createEmployee(
      {
        firstName: "سارة",
        lastName: "بن صالح",
        phone: "0612345640",
        roleId: roleIds.worker,
        status: "ACTIVE",
        salaryAmountDzd: 6500,
        salaryPeriod: "DAILY",
      },
      audit,
    ).item;

    const payment = service.createSalaryPayment(
      {
        employeeId: worker.id,
        actualAmountDzd: 6200,
      },
      audit,
    ).item;

    expect(payment.actorUserId).toBe(audit.actorUserId)
    expect(payment.transactionId).toBe(audit.transactionId)
  })

  it("rejects zero and negative salary payment amounts", () => {
    const { service, roleIds } = createHarness()
    const worker = service.createEmployee({
      firstName: "رامي",
      lastName: "سعيد",
      phone: "0612345641",
      roleId: roleIds.worker,
      status: "ACTIVE",
      salaryAmountDzd: 5000,
      salaryPeriod: "DAILY",
    }).item

    for (const amount of [0, -1]) {
      expect(() =>
        service.createSalaryPayment({
          employeeId: worker.id,
          actualAmountDzd: amount,
        }),
      ).toThrowError(CompanyError)
    }
  })

  it("computes debt balances for positive, mixed, exact-settlement, and overpayment entries", () => {
    const { service, roleIds } = createHarness()
    const audit = createAuditContext()
    const worker = service.createEmployee({
      firstName: "نادر",
      lastName: "عمارة",
      phone: "0612345642",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item
    const account = service.createDebtAccount({
      partyType: "INTERNAL_WORKER",
      workerId: worker.id,
      openingBalanceDzd: 1000,
      openingEntryDate: "2026-03-20T00:00:00.000+01:00",
    }, audit).item

    expect(account.currentBalance).toBe(1000)

    expect(service.createDebtEntry({
      debtAccountId: account.id,
      entryType: "PAYMENT",
      signedAmountDzd: -250,
      entryDate: "2026-03-21T00:00:00.000+01:00",
    }, audit).item.balanceAfterDzd).toBe(750)

    expect(service.createDebtEntry({
      debtAccountId: account.id,
      entryType: "PAYMENT",
      signedAmountDzd: -750,
      entryDate: "2026-03-22T00:00:00.000+01:00",
    }, audit).item.balanceAfterDzd).toBe(0)
    expect(service.getDebtAccount(account.id).item.status).toBe("SETTLED")

    expect(service.createDebtEntry({
      debtAccountId: account.id,
      entryType: "PAYMENT",
      signedAmountDzd: -200,
      entryDate: "2026-03-23T00:00:00.000+01:00",
    }, audit).item.balanceAfterDzd).toBe(-200)
    expect(service.getDebtAccount(account.id).item.status).toBe("OPEN")
  })

  it("creates worker debt accounts, records entries, and settles to zero", () => {
    const { service, roleIds } = createHarness()
    const audit = createAuditContext()
    const worker = service.createEmployee(
      {
        firstName: "خالد",
        lastName: "بن عمر",
        phone: "0612345670",
        roleId: roleIds.worker,
        status: "ACTIVE",
      },
      audit,
    ).item

    const account = service.createDebtAccount(
      {
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        openingBalanceDzd: 1500,
        note: "رصيد افتتاحي",
      },
      audit,
    ).item

    expect(account.currentBalance).toBe(1500)
    expect(service.listDebtEntries({ debtAccountId: account.id }).items).toHaveLength(1)

    const payment = service.createDebtEntry(
      {
        debtAccountId: account.id,
        entryType: "PAYMENT",
        signedAmountDzd: -500,
        note: "دفعة جزئية",
      },
      audit,
    ).item

    expect(payment.balanceAfterDzd).toBe(1000)
    expect(service.getDebtAccount(account.id).item.currentBalance).toBe(1000)

    const settlement = service.settleDebtAccount({ id: account.id, note: "إغلاق الحساب" }, audit).item
    expect(settlement.balanceAfterDzd).toBe(0)
    expect(settlement.signedAmountDzd).toBe(-1000)
    expect(service.getDebtAccount(account.id).item.status).toBe("SETTLED")
  })

  it("creates external counterparties and summarizes debt balances", () => {
    const { service } = createHarness()
    const audit = createAuditContext()
    const counterparty = service.createExternalCounterparty({
      fullName: "عميل خارجي",
      phoneNumber: "0612345671",
      note: "تعامل متكرر",
    }).item

    const account = service.createDebtAccount(
      {
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        openingBalanceDzd: -800,
      },
      audit,
    ).item

    const secondAccount = service.createDebtAccount(
      {
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparty.id,
        openingBalanceDzd: 300,
        note: "إضافة على الحساب الموحد",
      },
      audit,
    ).item

    expect(secondAccount.id).toBe(account.id)

    const summary = service.listDebtsSummary()
    expect(summary.debtAccounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: account.id,
          displayName: counterparty.fullName,
          currentBalance: -500,
          balanceLabel: "علينا له",
        }),
      ]),
    )
    expect(summary.parties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalCounterpartyId: counterparty.id,
          totalBalanceDzd: -500,
          balanceLabel: "علينا له",
          openDebtCasesCount: 1,
        }),
      ]),
    )

    const detail = service.getDebtPartyDetail({
      partyType: "EXTERNAL_COUNTERPARTY",
      externalCounterpartyId: counterparty.id,
    }).item
    expect(detail.totalBalanceDzd).toBe(-500)
    expect(detail.debtAccounts).toHaveLength(1)
  })

  it("reuses the same debt account for repeated entries on the same party", () => {
    const { service, roleIds } = createHarness()
    const audit = createAuditContext()
    const worker = service.createEmployee({
      firstName: "منير",
      lastName: "قاسمي",
      phone: "0612345676",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item

    const firstAccount = service.createDebtAccount({
      partyType: "INTERNAL_WORKER",
      workerId: worker.id,
      openingBalanceDzd: 1000,
      openingEntryDate: "2026-03-20T00:00:00.000+01:00",
    }, audit).item

    const secondMutation = service.createDebtAccount({
      partyType: "INTERNAL_WORKER",
      workerId: worker.id,
      openingBalanceDzd: -600,
      openingEntryDate: "2026-03-21T00:00:00.000+01:00",
    }, audit).item

    expect(secondMutation.id).toBe(firstAccount.id)
    expect(service.getDebtAccount(firstAccount.id).item.currentBalance).toBe(400)
    expect(service.listDebtAccounts({ workerId: worker.id }).items).toHaveLength(1)
    expect(service.listDebtEntries({ debtAccountId: firstAccount.id }).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryType: "OPENING", signedAmountDzd: 1000 }),
        expect.objectContaining({ entryType: "ADJUSTMENT", signedAmountDzd: -600, balanceAfterDzd: 400 }),
      ]),
    )
  })

  it("rejects settling an already zero debt account", () => {
    const { service, roleIds } = createHarness()
    const worker = service.createEmployee({
      firstName: "أيمن",
      lastName: "صالح",
      phone: "0612345672",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item
    const account = service.createDebtAccount({
      partyType: "INTERNAL_WORKER",
      workerId: worker.id,
    }).item

    expect(() => service.settleDebtAccount({ id: account.id })).toThrowError(CompanyError)
  })

  it("rejects backdated debt entries to preserve running balances", () => {
    const { service, roleIds } = createHarness()
    const worker = service.createEmployee({
      firstName: "أيمن",
      lastName: "صالح",
      phone: "0612345673",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item
    const account = service.createDebtAccount({
      partyType: "INTERNAL_WORKER",
      workerId: worker.id,
      openingBalanceDzd: 1000,
      openingEntryDate: "2026-03-20T00:00:00.000+01:00",
    }).item

    expect(() =>
      service.createDebtEntry({
        debtAccountId: account.id,
        entryType: "PAYMENT",
        signedAmountDzd: -200,
        entryDate: "2026-03-19T00:00:00.000+01:00",
      }),
    ).toThrowError(CompanyError)
  })

  it("allows equal, newer, and first debt entry dates", () => {
    const { service, roleIds } = createHarness()
    const audit = createAuditContext()
    const worker = service.createEmployee({
      firstName: "سامي",
      lastName: "مراد",
      phone: "0612345643",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item
    const account = service.createDebtAccount({
      partyType: "INTERNAL_WORKER",
      workerId: worker.id,
    }, audit).item

    expect(service.createDebtEntry({
      debtAccountId: account.id,
      entryType: "ADJUSTMENT",
      signedAmountDzd: 100,
      entryDate: "2026-03-20T00:00:00.000+01:00",
    }, audit).item.balanceAfterDzd).toBe(100)
    expect(service.createDebtEntry({
      debtAccountId: account.id,
      entryType: "ADJUSTMENT",
      signedAmountDzd: 50,
      entryDate: "2026-03-20T00:00:00.000+01:00",
    }, audit).item.balanceAfterDzd).toBe(150)
    expect(service.createDebtEntry({
      debtAccountId: account.id,
      entryType: "ADJUSTMENT",
      signedAmountDzd: 25,
      entryDate: "2026-03-21T00:00:00.000+01:00",
    }, audit).item.balanceAfterDzd).toBe(175)
  })

  it("rolls back debt account creation when opening ledger write fails", () => {
    const { repository, service, roleIds } = createHarness()
    const worker = service.createEmployee({
      firstName: "سليم",
      lastName: "رحالي",
      phone: "0612345674",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item
    const createDebtEntrySpy = vi.spyOn(repository, "createDebtEntry").mockImplementation(() => {
      throw new Error("ledger write failed")
    })

    expect(() =>
      service.createDebtAccount({
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        openingBalanceDzd: 500,
      }),
    ).toThrow("ledger write failed")

    expect(service.listDebtAccounts().items).toHaveLength(0)
    createDebtEntrySpy.mockRestore()
  })

  it("rolls back debt ledger creation when account update fails", () => {
    const { repository, service, roleIds } = createHarness()
    const worker = service.createEmployee({
      firstName: "ليلى",
      lastName: "مقدم",
      phone: "0612345675",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item
    const account = service.createDebtAccount({
      partyType: "INTERNAL_WORKER",
      workerId: worker.id,
      openingBalanceDzd: 800,
    }).item
    const updateDebtAccountSpy = vi.spyOn(repository, "updateDebtAccount").mockImplementation(() => {
      throw new Error("account update failed")
    })

    expect(() =>
      service.createDebtEntry({
        debtAccountId: account.id,
        entryType: "PAYMENT",
        signedAmountDzd: -200,
      }),
    ).toThrow("account update failed")

    expect(service.listDebtEntries({ debtAccountId: account.id }).items).toHaveLength(1)
    expect(service.getDebtAccount(account.id).item.currentBalance).toBe(800)
    updateDebtAccountSpy.mockRestore()
  })

  it("stores company timestamps in the Algerian timezone offset", () => {
    const { service, roleIds } = createHarness()

    const employee = service.createEmployee({
      firstName: "Aya",
      lastName: "Merabet",
      phone: "0612345637",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item

    expect(employee.createdAt.endsWith("+01:00")).toBe(true)
    expect(employee.updatedAt.endsWith("+01:00")).toBe(true)
  })

  it("groups system log rows by transaction id", () => {
    const { database, service, roleIds } = createHarness();
    const audit = createAuditContext({ actorUserId: "admin-user-1", transactionId: crypto.randomUUID() })
    const timestamp = new Date().toISOString()

    database
      .prepare('INSERT INTO "user" (id, name, image, phoneNumber, phoneNumberVerified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(audit.actorUserId, "Admin One", null, "0612345659", 1, timestamp, timestamp)

    const manager = service.createEmployee(
      {
        firstName: "Manager",
        lastName: "Grouped",
        phone: "0612345660",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      },
      audit,
    ).item;
    const worker = service.createEmployee(
      {
        firstName: "Worker",
        lastName: "Grouped",
        phone: "0612345661",
        roleId: roleIds.worker,
        status: "ACTIVE",
      },
      audit,
    ).item;
    const project = service.createProject(
      {
        name: "Grouped Project",
        managerId: manager.id,
        status: "ACTIVE",
      },
      audit,
    ).item;

    service.assignEmployeeWorkplace(
      {
        employeeId: worker.id,
        nextType: "PROJECT",
        managerId: manager.id,
        projectId: project.id,
      },
      audit,
    )

    const logs = service.listSystemLog({ actorUserId: audit.actorUserId }).items

    expect(logs[0]).toMatchObject({
      actorLabel: "مدير التشغيل",
      actionType: "PROJECT_MANAGER_CHANGED",
    })
    expect(logs[0]?.detail).toContain("تم ربط العامل Worker Grouped بالمدير Manager Grouped")
    expect(logs.some((entry) => entry.transactionId === audit.transactionId)).toBe(true)
  })

  it("includes debt account mutations in the system log", () => {
    const { service, roleIds } = createHarness()
    const audit = createAuditContext({ transactionId: crypto.randomUUID() })
    const worker = service.createEmployee(
      {
        firstName: "Debt",
        lastName: "Worker",
        phone: "0612345673",
        roleId: roleIds.worker,
        status: "ACTIVE",
      },
      audit,
    ).item

    const account = service.createDebtAccount(
      {
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        openingBalanceDzd: 900,
      },
      audit,
    ).item

    service.settleDebtAccount({ id: account.id }, audit)

    const logs = service.listSystemLog({ actorUserId: audit.actorUserId }).items
    expect(logs.some((entry) => entry.transactionId === audit.transactionId)).toBe(true)
  })

  it("renders debt history details with readable Arabic labels", () => {
    const { service, roleIds } = createHarness()
    const audit = createAuditContext({ transactionId: crypto.randomUUID() })
    const worker = service.createEmployee(
      {
        firstName: "أحمد",
        lastName: "بوزيد",
        phone: "0612345693",
        roleId: roleIds.worker,
        status: "ACTIVE",
      },
      audit,
    ).item

    const account = service.createDebtAccount(
      {
        partyType: "INTERNAL_WORKER",
        workerId: worker.id,
        openingBalanceDzd: 30000,
      },
      audit,
    ).item

    service.createDebtEntry(
      {
        debtAccountId: account.id,
        entryType: "ADJUSTMENT",
        signedAmountDzd: -5000,
        note: "خصم معدات",
      },
      audit,
    )

    const logs = service.listSystemLog({ actorUserId: audit.actorUserId }).items
    const debtLog = logs.find((entry) => entry.entityType === "DEBT_ENTRY")

    expect(debtLog?.summary).toContain("تم تسجيل تعديل على دين الطرف أحمد بوزيد")
    expect(debtLog?.detail).toContain("نوع الحركة تعديل")
    expect(debtLog?.detail).toContain("القيمة -5000 دج")
    expect(debtLog?.detail).toContain("الرصيد بعد العملية")
    expect(debtLog?.detail).not.toContain("ADJUSTMENT")
    expect(debtLog?.detail).not.toContain("OPENING")
  })

  it("lists account profile updates in the system log", () => {
    const { database, service } = createHarness()
    const userId = "admin-user-1"
    const timestamp = new Date().toISOString()

    database
      .prepare('INSERT INTO "user" (id, name, image, phoneNumber, phoneNumberVerified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(userId, "الاسم الجديد", null, "0612345658", 1, timestamp, timestamp)

    database
      .prepare('INSERT INTO "user_profile_history" (id, user_id, name, phone, previous_name, previous_phone, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run("profile-log-1", userId, "الاسم الجديد", "0612345658", "الاسم القديم", "0612345658", userId, "الاسم القديم", crypto.randomUUID(), timestamp, timestamp)

    const logs = service.listSystemLog({ actorUserId: userId }).items

    expect(logs[0]).toMatchObject({
      actionType: "ACCOUNT_UPDATED",
      entityType: "ACCOUNT",
      actorLabel: "الاسم القديم",
      actorCurrentLabel: "الاسم الجديد",
      summary: "تم تحديث بيانات حساب الاسم الجديد",
    })
    expect(logs[0]?.detail).toContain("تم تحديث الاسم")
    expect(logs[0]?.detail).not.toContain("0612345658")
  })

  it("translates employee status labels inside system log details", () => {
    const { service, roleIds } = createHarness()

    service.createEmployee({
      firstName: "علي",
      lastName: "أحمد",
      phone: "0612345602",
      roleId: roleIds.worker,
      status: "ACTIVE",
    })

    const logs = service.listSystemLog({ actionType: "EMPLOYEE_CREATED" }).items

    expect(logs[0]?.detail).toContain("نشط")
    expect(logs[0]?.detail).not.toContain("ACTIVE")
  })

  it("keeps the original actor label snapshot after the user renames the account", () => {
    const { database, service, roleIds } = createHarness()
    const audit = createAuditContext({ actorUserId: "admin-user-1", actorLabel: "الاسم القديم" })

    service.createEmployee({
      firstName: "علي",
      lastName: "أحمد",
      phone: "0612345611",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }, audit)

    database
      .prepare('UPDATE "user" SET name = ? WHERE id = ?')
      .run("الاسم الجديد", "admin-user-1")

    const logs = service.listSystemLog({ actionType: "EMPLOYEE_CREATED" }).items

    expect(logs[0]?.actorLabel).toBe("الاسم القديم")
  })

  it("orders system log rows from newest to oldest by real timestamp", () => {
    const { database, service } = createHarness()
    const userId = "admin-user-1"

    database
      .prepare('INSERT INTO "user" (id, name, image, phoneNumber, phoneNumberVerified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(userId, "عمارة", null, "0612345658", 1, "2026-03-18T01:00:00.000Z", "2026-03-18T01:00:00.000Z")

    database
      .prepare('INSERT INTO "user_profile_history" (id, user_id, name, phone, previous_name, previous_phone, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run("profile-log-older", userId, "عمارة", "0612345658", "بلال", "0612345658", userId, "بلال", crypto.randomUUID(), "2026-03-18T01:15:00.000Z", "2026-03-18T01:15:00.000Z")

    database
      .prepare('INSERT INTO "user_profile_history" (id, user_id, name, phone, previous_name, previous_phone, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run("profile-log-newer", userId, "بلال", "0612345658", "عمارة", "0612345658", userId, "عمارة", crypto.randomUUID(), "2026-03-18T02:16:00+01:00", "2026-03-18T02:16:00+01:00")

    const logs = service.listSystemLog({ actionType: "ACCOUNT_UPDATED" }).items

    expect(logs[0]?.entityLabel).toBe("بلال")
    expect(logs[1]?.entityLabel).toBe("عمارة")
  })

  it("closes and reopens project manager ownership history with one transaction id", () => {
    const { service, roleIds } = createHarness();
    const auditA = createAuditContext({ actorUserId: "admin-a" })
    const auditB = createAuditContext({ actorUserId: "admin-b" })
    const managerA = service.createEmployee(
      {
        firstName: "Ali",
        lastName: "Bensaid",
        phone: "0612345641",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      },
      auditA,
    ).item;
    const managerB = service.createEmployee(
      {
        firstName: "Lina",
        lastName: "Saidi",
        phone: "0612345642",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      },
      auditA,
    ).item;
    const project = service.createProject(
      {
        name: "مشروع التاريخ",
        managerId: managerA.id,
        status: "ACTIVE",
      },
      auditA,
    ).item;

    service.updateProject({ id: project.id, managerId: managerB.id }, auditB)

    const history = service.listProjectManagerOwnershipHistory({ projectId: project.id }).items
    expect(history).toHaveLength(2)

    const activeEntry = history.find((entry) => entry.endDate === null)
    const endedEntry = history.find((entry) => entry.endDate !== null)

    expect(activeEntry).toMatchObject({
      managerId: managerB.id,
      actorUserId: auditB.actorUserId,
      transactionId: auditB.transactionId,
    })
    expect(endedEntry).toMatchObject({
      managerId: managerA.id,
      actorUserId: auditB.actorUserId,
      transactionId: auditB.transactionId,
      endDate: activeEntry?.startDate,
    })
  })

  it("keeps warehouse ownership history exact when syncing managers", () => {
    const { service, roleIds } = createHarness();
    const createAudit = createAuditContext({ actorUserId: "admin-setup" })
    const syncAudit = createAuditContext({ actorUserId: "admin-sync" })
    const manager = service.createEmployee(
      {
        firstName: "Yasmine",
        lastName: "Touati",
        phone: "0612345643",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      },
      createAudit,
    ).item;
    const warehouse = service.createWarehouse(
      {
        name: "Warehouse One",
        status: "ACTIVE",
      },
      createAudit,
    ).item;

    service.syncManagedWarehouses({ employeeId: manager.id, warehouseIds: [warehouse.id] }, syncAudit)
    service.syncManagedWarehouses({ employeeId: manager.id, warehouseIds: [] }, syncAudit)

    const history = service.listWarehouseManagerOwnershipHistory({ warehouseId: warehouse.id }).items
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      managerId: manager.id,
      actorUserId: syncAudit.actorUserId,
      transactionId: syncAudit.transactionId,
      status: "ENDED",
    })
    expect(history[0]?.endDate).not.toBeNull()
  })

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

  it("enforces status values with database CHECK constraints", () => {
    const { database, roleIds } = createHarness();
    const timestamp = new Date().toISOString();

    expect(() =>
      database
        .prepare(
          'INSERT INTO "employee" (id, first_name, last_name, phone, role_id, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          crypto.randomUUID(),
          "Bad",
          "Status",
          "0612345618",
          roleIds.worker,
          "UNKNOWN",
          null,
          timestamp,
          timestamp,
        ),
    ).toThrowError();

    expect(() =>
      database
        .prepare(
          'INSERT INTO "project" (id, name, location, manager_id, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          crypto.randomUUID(),
          "Invalid Project",
          null,
          null,
          "UNKNOWN",
          null,
          timestamp,
          timestamp,
        ),
    ).toThrowError();
  });
});
