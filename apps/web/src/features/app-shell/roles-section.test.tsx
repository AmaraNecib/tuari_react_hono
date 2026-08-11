// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

import type { RoleWithPermissions } from "@tuari/contracts";

import { RolesSection } from "./roles-section";

// Mock useTranslation to return Arabic strings for the keys the
// component uses. This mirrors the pattern in license-settings.test.tsx.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, second?: string | Record<string, unknown>, third?: Record<string, unknown>) => {
      // i18next v22+ form: t(key, options) — second arg is options
      if (typeof second === "object" && second !== null) {
        const options = second as Record<string, unknown>;
        if (key === "shell.rolesPermissionCount") {
          return `${options.count} صلاحية`;
        }
        if (key === "shell.rolesPermissionsTitle") {
          return `صلاحيات دور ${options.name ?? ""}`.trim();
        }
        return key;
      }
      // i18next v21 form: t(key, defaultValue, options)
      const map: Record<string, string> = {
        "shell.rolesSystemBadge": "نظامي",
        "shell.rolesCustomBadge": "مخصص",
        "shell.rolesPermissionsEmpty": "لا توجد صلاحيات مسندة لهذا الدور بعد.",
      };
      const lookup = map[key];
      if (lookup) return lookup;
      if (!second) return key;
      let result = second;
      if (third) {
        for (const [k, v] of Object.entries(third)) {
          result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        }
      }
      return result;
    },
  }),
}));

function makeRole(overrides: Partial<RoleWithPermissions> & Pick<RoleWithPermissions, "id" | "key" | "name">): RoleWithPermissions {
  return {
    description: null,
    isSystem: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    permissions: [],
    ...overrides,
  };
}

const COLUMNS = {
  name: "الاسم",
  key: "المفتاح",
  system: "النوع",
  description: "الوصف",
  permissions: "الصلاحيات",
};

describe("RolesSection (Issue #10)", () => {
  it("renders all roles with their permission counts collapsed", () => {
    const roles: RoleWithPermissions[] = [
      makeRole({
        id: "admin",
        key: "admin",
        name: "مدير النظام",
        isSystem: true,
        permissions: ["employees:create", "employees:read", "employees:update", "employees:delete"],
      }),
      makeRole({
        id: "manager",
        key: "manager",
        name: "مدير عمليات",
        isSystem: true,
        permissions: ["employees:create", "employees:read", "employees:update", "employees:delete", "debts:read"],
      }),
      makeRole({
        id: "viewer",
        key: "viewer",
        name: "مشاهد",
        isSystem: true,
        permissions: ["employees:read"],
      }),
    ];

    render(
      <RolesSection
        columns={COLUMNS}
        emptyLabel="لا يوجد"
        noLabel="لا"
        roles={roles}
        title="الأدوار"
        yesLabel="نعم"
      />,
    );

    // Role rows are present
    expect(screen.getByTestId("role-row-admin")).toBeTruthy();
    expect(screen.getByTestId("role-row-manager")).toBeTruthy();
    expect(screen.getByTestId("role-row-viewer")).toBeTruthy();

    // Permission lists are NOT yet rendered (collapsed by default)
    expect(screen.queryByTestId("role-permissions-admin")).toBeNull();
  });

  it("expands the permission list when a role row is clicked", () => {
    const roles: RoleWithPermissions[] = [
      makeRole({
        id: "admin",
        key: "admin",
        name: "مدير النظام",
        isSystem: true,
        permissions: ["employees:create", "debts:settle"],
      }),
    ];

    render(
      <RolesSection
        columns={COLUMNS}
        emptyLabel="لا يوجد"
        noLabel="لا"
        roles={roles}
        title="الأدوار"
        yesLabel="نعم"
      />,
    );

    // Click the role row
    fireEvent.click(screen.getByTestId("role-row-admin"));

    // Permission list is now visible
    const expanded = screen.getByTestId("role-permissions-admin");
    expect(expanded).toBeTruthy();

    // Each permission string is rendered as its own chip
    expect(within(expanded).getByText("employees:create")).toBeTruthy();
    expect(within(expanded).getByText("debts:settle")).toBeTruthy();
  });

  it("collapses the permission list when the same row is clicked again", () => {
    const roles: RoleWithPermissions[] = [
      makeRole({
        id: "viewer",
        key: "viewer",
        name: "مشاهد",
        isSystem: true,
        permissions: ["employees:read"],
      }),
    ];

    render(
      <RolesSection
        columns={COLUMNS}
        emptyLabel="لا يوجد"
        noLabel="لا"
        roles={roles}
        title="الأدوار"
        yesLabel="نعم"
      />,
    );

    const row = screen.getByTestId("role-row-viewer");
    fireEvent.click(row);
    expect(screen.getByTestId("role-permissions-viewer")).toBeTruthy();

    fireEvent.click(row);
    expect(screen.queryByTestId("role-permissions-viewer")).toBeNull();
  });

  it("shows the system badge for system roles and the custom badge otherwise", () => {
    const roles: RoleWithPermissions[] = [
      makeRole({ id: "admin", key: "admin", name: "مدير النظام", isSystem: true, permissions: [] }),
      makeRole({ id: "custom", key: "custom", name: "دور مخصص", isSystem: false, permissions: [] }),
    ];

    render(
      <RolesSection
        columns={COLUMNS}
        emptyLabel="لا يوجد"
        noLabel="لا"
        roles={roles}
        title="الأدوار"
        yesLabel="نعم"
      />,
    );

    const adminRow = screen.getByTestId("role-row-admin");
    expect(within(adminRow).getByText("نظامي")).toBeTruthy();

    const customRow = screen.getByTestId("role-row-custom");
    expect(within(customRow).getByText("مخصص")).toBeTruthy();
  });

  it("renders an empty-state row when no roles are present", () => {
    render(
      <RolesSection
        columns={COLUMNS}
        emptyLabel="لا توجد أدوار"
        noLabel="لا"
        roles={[]}
        title="الأدوار"
        yesLabel="نعم"
      />,
    );

    expect(screen.getByText("لا توجد أدوار")).toBeTruthy();
  });
});
