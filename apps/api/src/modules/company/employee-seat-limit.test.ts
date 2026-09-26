/**
 * License seat-limit tests (issue #394).
 *
 * Covers the single seat rule (`assertActiveEmployeeSeatAvailable`) directly and
 * through every mutation that can increase the ACTIVE employee count.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CompanyError } from "./company.errors";
import { assertActiveEmployeeSeatAvailable } from "./employee-seat-limit";
import { createAuditContext, createCompanyHarnessTracker } from "./company.test-helpers";

const LICENSE_ENV_KEYS = [
  "TUARI_LICENSE_STATUS",
  "TUARI_LICENSE_MAX_USERS",
  "TUARI_LICENSE_EDITION",
  "TUARI_LICENSE_FEATURES",
  "TUARI_LICENSE_CUSTOMER",
  "TUARI_LICENSE_EXPIRES_AT",
] as const;

const savedEnv: Record<string, string | undefined> = {};

function setLicense(status: string, maxUsers?: number): void {
  process.env.TUARI_LICENSE_STATUS = status;
  if (maxUsers === undefined) {
    delete process.env.TUARI_LICENSE_MAX_USERS;
  } else {
    process.env.TUARI_LICENSE_MAX_USERS = String(maxUsers);
  }
}

function repositoryWithActiveCount(activeCount: number) {
  return {
    countEmployees: (filters?: { status?: string }) =>
      filters?.status === "ACTIVE" ? activeCount : 0,
    // The seat check must never materialise rows; fail loudly if it does.
    listEmployees: () => {
      throw new Error("the seat check must not list employees");
    },
  } as unknown as Parameters<typeof assertActiveEmployeeSeatAvailable>[0];
}

function captureCompanyError(run: () => void): CompanyError {
  try {
    run();
  } catch (error) {
    if (error instanceof CompanyError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the operation to throw a CompanyError");
}

describe("assertActiveEmployeeSeatAvailable", () => {
  beforeEach(() => {
    for (const key of LICENSE_ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of LICENSE_ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it("refuses when the cap would be exceeded, naming the limit and the current count", () => {
    setLicense("active", 3);

    const error = captureCompanyError(() =>
      assertActiveEmployeeSeatAvailable(repositoryWithActiveCount(3)),
    );

    expect(error.appError.code).toBe("BUSINESS_RULE");
    expect(error.message).toContain("(3)");
    expect(error.message).toContain("العدد الحالي: 3");
  });

  it("allows a mutation that stays below the cap", () => {
    setLicense("active", 3);

    expect(() =>
      assertActiveEmployeeSeatAvailable(repositoryWithActiveCount(2)),
    ).not.toThrow();
  });

  it("treats maxUsers = 0 as unlimited", () => {
    setLicense("active", 0);

    expect(() =>
      assertActiveEmployeeSeatAvailable(repositoryWithActiveCount(50)),
    ).not.toThrow();
  });

  it("treats a non-positive maxUsers as unlimited", () => {
    setLicense("active", -1);

    expect(() =>
      assertActiveEmployeeSeatAvailable(repositoryWithActiveCount(50)),
    ).not.toThrow();
  });

  it("is a no-op when the mutation adds no active seat", () => {
    setLicense("active", 1);

    expect(() =>
      assertActiveEmployeeSeatAvailable(repositoryWithActiveCount(5), 0),
    ).not.toThrow();
  });

  it("does not cap the post-install trial", () => {
    setLicense("trial", 1);

    expect(() =>
      assertActiveEmployeeSeatAvailable(repositoryWithActiveCount(50)),
    ).not.toThrow();
  });

  it("counts ACTIVE employees through the count path", () => {
    setLicense("active", 5);
    const calls: Array<{ status?: string } | undefined> = [];
    const repository = {
      countEmployees: (filters?: { status?: string }) => {
        calls.push(filters);
        return 0;
      },
      listEmployees: () => {
        throw new Error("the seat check must not list employees");
      },
    } as unknown as Parameters<typeof assertActiveEmployeeSeatAvailable>[0];

    expect(() => assertActiveEmployeeSeatAvailable(repository)).not.toThrow();
    expect(calls).toEqual([{ status: "ACTIVE" }]);
  });

  it("does not cap the post-expiry grace window", () => {
    setLicense("grace", 1);

    expect(() =>
      assertActiveEmployeeSeatAvailable(repositoryWithActiveCount(50)),
    ).not.toThrow();
  });
});

describe("employee seat limit through the workforce service", () => {
  const { createHarness, closeAll } = createCompanyHarnessTracker();

  beforeEach(() => {
    for (const key of LICENSE_ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of LICENSE_ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    closeAll();
  });

  const audit = () => createAuditContext();

  it("refuses creating the (n+1)th active employee and does not create the row", () => {
    setLicense("active", 2);
    const { service, roleIds } = createHarness();

    service.createEmployee({
      firstName: "أول",
      lastName: "مستخدم",
      phone: "0559100001",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    });
    service.createEmployee({
      firstName: "ثاني",
      lastName: "مستخدم",
      phone: "0559100002",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    });

    const error = captureCompanyError(() =>
      service.createEmployee({
        firstName: "ثالث",
        lastName: "مستخدم",
        phone: "0559100003",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }),
    );

    expect(error.appError.code).toBe("BUSINESS_RULE");
    expect(error.message).toContain("(2)");
    expect(error.message).toContain("العدد الحالي: 2");
    expect(service.listEmployees().items).toHaveLength(2);
  });

  it("does not count INACTIVE or LEFT employees against the cap", () => {
    setLicense("active", 1);
    const { service, roleIds } = createHarness();

    service.createEmployee({
      firstName: "نشط",
      lastName: "وحيد",
      phone: "0559100011",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    });
    service.createEmployee({
      firstName: "غادر",
      lastName: "سابق",
      phone: "0559100012",
      roleId: roleIds.projectManager,
      status: "LEFT",
    });
    service.createEmployee({
      firstName: "غير",
      lastName: "نشط",
      phone: "0559100013",
      roleId: roleIds.projectManager,
      status: "INACTIVE",
    });

    expect(service.listEmployees().items).toHaveLength(3);

    // The cap is still reached by the single ACTIVE employee.
    expect(() =>
      service.createEmployee({
        firstName: "زائد",
        lastName: "أخرى",
        phone: "0559100014",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }),
    ).toThrowError(CompanyError);
  });

  it("refuses reactivating a LEFT employee at the cap and leaves the status unchanged", () => {
    setLicense("active", 1);
    const { service, roleIds } = createHarness();

    service.createEmployee({
      firstName: "نشط",
      lastName: "حالي",
      phone: "0559100021",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    });
    const left = service.createEmployee({
      firstName: "غادر",
      lastName: "سابق",
      phone: "0559100022",
      roleId: roleIds.projectManager,
      status: "LEFT",
    }).item;

    expect(() =>
      service.updateEmployee({ id: left.id, status: "ACTIVE" }, audit()),
    ).toThrowError(CompanyError);
    expect(service.getEmployee(left.id).item.status).toBe("LEFT");
  });

  it("reactivates a LEFT employee when a seat is free", () => {
    setLicense("active", 2);
    const { service, roleIds } = createHarness();

    service.createEmployee({
      firstName: "نشط",
      lastName: "حالي",
      phone: "0559100031",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    });
    const left = service.createEmployee({
      firstName: "غادر",
      lastName: "سابق",
      phone: "0559100032",
      roleId: roleIds.projectManager,
      status: "LEFT",
    }).item;

    const updated = service.updateEmployee({ id: left.id, status: "ACTIVE" }, audit());

    expect(updated.item.status).toBe("ACTIVE");
    expect(service.listEmployees({ status: "ACTIVE" }).items).toHaveLength(2);
  });

  it("moves an employee between two non-ACTIVE statuses without a seat check", () => {
    setLicense("active", 1);
    const { service, roleIds } = createHarness();

    service.createEmployee({
      firstName: "نشط",
      lastName: "حالي",
      phone: "0559100041",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    });
    const left = service.createEmployee({
      firstName: "غادر",
      lastName: "سابق",
      phone: "0559100042",
      roleId: roleIds.projectManager,
      status: "LEFT",
    }).item;

    const updated = service.updateEmployee({ id: left.id, status: "INACTIVE" }, audit());

    expect(updated.item.status).toBe("INACTIVE");
  });

  it("treats maxUsers = 0 as unlimited through the service", () => {
    setLicense("active", 0);
    const { service, roleIds } = createHarness();

    for (let index = 0; index < 4; index += 1) {
      service.createEmployee({
        firstName: `مستخدم${index}`,
        lastName: "بلا حدود",
        phone: `05591001${String(index).padStart(2, "0")}`,
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      });
    }

    expect(service.listEmployees({ status: "ACTIVE" }).items).toHaveLength(4);
  });

  it("treats an unset TUARI_LICENSE_MAX_USERS as unlimited on an active license", () => {
    setLicense("active");
    const { service, roleIds } = createHarness();

    for (let index = 0; index < 4; index += 1) {
      service.createEmployee({
        firstName: `مستخدم${index}`,
        lastName: "افتراضي",
        phone: `05591002${String(index).padStart(2, "0")}`,
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      });
    }

    expect(service.listEmployees({ status: "ACTIVE" }).items).toHaveLength(4);
  });

  it("does not cap the trial through the service", () => {
    setLicense("trial", 1);
    const { service, roleIds } = createHarness();

    for (let index = 0; index < 3; index += 1) {
      service.createEmployee({
        firstName: `مستخدم${index}`,
        lastName: "تجريبي",
        phone: `05591003${String(index).padStart(2, "0")}`,
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      });
    }

    expect(service.listEmployees({ status: "ACTIVE" }).items).toHaveLength(3);
  });

  it("does not cap the grace window through the service", () => {
    setLicense("grace", 1);
    const { service, roleIds } = createHarness();

    for (let index = 0; index < 3; index += 1) {
      service.createEmployee({
        firstName: `مستخدم${index}`,
        lastName: "مهلة",
        phone: `05591004${String(index).padStart(2, "0")}`,
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      });
    }

    expect(service.listEmployees({ status: "ACTIVE" }).items).toHaveLength(3);
  });

  it("refuses a batch whose active rows would exceed the cap and creates none", () => {
    setLicense("active", 2);
    const { service, roleIds } = createHarness();

    service.createEmployee({
      firstName: "أول",
      lastName: "مستخدم",
      phone: "0559100501",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    });

    expect(() =>
      service.createEmployeesBatch(
        {
          employees: [
            {
              firstName: "ثاني",
              lastName: "مستخدم",
              phone: "0559100502",
              roleId: roleIds.projectManager,
              status: "ACTIVE",
            },
            {
              firstName: "ثالث",
              lastName: "مستخدم",
              phone: "0559100503",
              roleId: roleIds.projectManager,
              status: "ACTIVE",
            },
          ],
        },
        audit(),
      ),
    ).toThrowError(CompanyError);

    expect(service.listEmployees().items).toHaveLength(1);
  });

  it("creates a batch that fits under the cap and counts only its active rows", () => {
    setLicense("active", 2);
    const { service, roleIds } = createHarness();

    const result = service.createEmployeesBatch(
      {
        employees: [
          {
            firstName: "نشط",
            lastName: "دفعة",
            phone: "0559100511",
            roleId: roleIds.projectManager,
            status: "ACTIVE",
          },
          {
            firstName: "غادر",
            lastName: "دفعة",
            phone: "0559100512",
            roleId: roleIds.projectManager,
            status: "LEFT",
          },
        ],
      },
      audit(),
    );

    expect(result.item.employees).toHaveLength(2);
    expect(service.listEmployees({ status: "ACTIVE" }).items).toHaveLength(1);
  });
});
