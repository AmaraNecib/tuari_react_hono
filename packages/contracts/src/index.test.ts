import { describe, expect, it } from "vitest";
import {
  appErrorSchema,
  authSetupStatusSchema,
  employeeProjectAssignmentSchema,
  employeeSchema,
  managerAssignmentCreateInputSchema,
  phonePasswordSignInSchema,
  projectAssignmentCreateInputSchema,
  projectSchema,
  roleCreateInputSchema,
  sessionUserSchema,
  warehouseSchema,
} from "./index";

describe("contracts", () => {
  it("accepts a valid phone password sign-in payload", () => {
    expect(
        phonePasswordSignInSchema.parse({
        phone: "0612345678",
        password: "password123",
        rememberMe: true,
      }),
    ).toEqual({
      phone: "0612345678",
      password: "password123",
      rememberMe: true,
    });
  });

  it("rejects invalid sign-in payloads", () => {
    expect(() =>
      phonePasswordSignInSchema.parse({
        phone: "",
        password: "short",
      }),
    ).toThrowError();
  });

  it("exposes auth setup status with optional bootstrap secret gating", () => {
    expect(
      authSetupStatusSchema.parse({
        hasUsers: false,
        requiresSetupKey: true,
      }),
    ).toEqual({
      hasUsers: false,
      requiresSetupKey: true,
    })
  })

  it("accepts a session user with phone identity", () => {
    expect(
        sessionUserSchema.parse({
          id: "user-1",
          name: null,
          phone: "0612345678",
        }),
      ).toEqual({
        id: "user-1",
        name: null,
        phone: "0612345678",
    });
  });

  it("keeps optional manager references nullable in project and warehouse schemas", () => {
    expect(
      projectSchema.parse({
        id: "project-1",
        name: "North Site",
        location: null,
        managerId: null,
        status: "ACTIVE",
        notes: null,
        createdAt: "2026-03-13T10:00:00.000Z",
        updatedAt: "2026-03-13T10:00:00.000Z",
      }).managerId,
    ).toBeNull();

    expect(
      warehouseSchema.parse({
        id: "warehouse-1",
        name: "Main Store",
        address: null,
        managerId: null,
        status: "ACTIVE",
        notes: null,
        createdAt: "2026-03-13T10:00:00.000Z",
        updatedAt: "2026-03-13T10:00:00.000Z",
      }).managerId,
    ).toBeNull();
  });

  it("keeps employee project assignment employeeId generic", () => {
    expect(
      employeeProjectAssignmentSchema.parse({
        id: "assignment-1",
        employeeId: "employee-1",
        projectId: "project-1",
        status: "ACTIVE",
        startDate: "2026-03-13T10:00:00.000Z",
        endDate: null,
        notes: null,
        createdAt: "2026-03-13T10:00:00.000Z",
        updatedAt: "2026-03-13T10:00:00.000Z",
      }).employeeId,
    ).toBe("employee-1");
  });

  it("rejects malformed app errors", () => {
    expect(() =>
      appErrorSchema.parse({
        code: "VALIDATION",
        message: "",
      }),
    ).toThrowError();
  });

  it("accepts a required employee identity shape", () => {
    expect(
        employeeSchema.parse({
          id: "employee-1",
          firstName: "Amara",
          lastName: "Necib",
          phone: "0612345678",
          roleId: "role-worker",
          status: "ACTIVE",
        notes: null,
        createdAt: "2026-03-13T10:00:00.000Z",
        updatedAt: "2026-03-13T10:00:00.000Z",
      }).phone,
    ).toBe("0612345678");
  });

  it("accepts create payloads for core company entities", () => {
    expect(
      roleCreateInputSchema.parse({
        key: "site_admin",
        name: "Site Admin",
        description: null,
      }).key,
    ).toBe("site_admin");

    expect(
      managerAssignmentCreateInputSchema.parse({
        workerId: "employee-1",
        managerId: "employee-2",
        status: "ACTIVE",
      }).status,
    ).toBe("ACTIVE");

    expect(
      projectAssignmentCreateInputSchema.parse({
        employeeId: "employee-1",
        projectId: "project-1",
        status: "ACTIVE",
      }).employeeId,
    ).toBe("employee-1");
  });
});
