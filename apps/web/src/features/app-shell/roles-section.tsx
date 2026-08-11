/**
 * RolesSection — settings-style UI for the role management surface.
 *
 * Lists the three default roles (admin, manager, viewer) along with the
 * permissions each one grants. Built for Issue #10 — Slice 3 RBAC.
 *
 * Design notes
 * ------------
 * - The permissions column shows a chip-style badge for each permission
 *   string. Each chip uses the `resource:action` form verbatim so the
 *   data ties back to the backend's permission vocabulary.
 * - System roles are flagged with a "system" badge. Non-system roles
 *   (custom ones added later) get a "custom" badge.
 * - The role row is the click target; clicking anywhere on the row
 *   expands an inline permission list. We use a controlled expansion so
 *   the table stays scannable when collapsed.
 * - All copy is inlined via the `useTranslation` hook (Arabic is the
 *   only active locale in the app, so we don't ship English strings).
 */
import { Fragment, useState } from "react"
import { useTranslation } from "react-i18next"

import type { RoleWithPermissions } from "@tuari/contracts"

import { RecordPageFrame } from "@/features/shared/record-page-frame"

import {
  AppShellEmptyStateRow,
  AppShellTableFrame,
  AppShellTableHead,
  AppShellTableHeaderCell,
  AppShellTableRow,
} from "./app-shell-table-primitives"

type RolesSectionProps = {
  columns: {
    name: string
    key: string
    system: string
    description: string
    permissions: string
  }
  emptyLabel: string
  noLabel: string
  roles: RoleWithPermissions[]
  title: string
  yesLabel: string
}

export function RolesSection({
  columns,
  emptyLabel,
  noLabel,
  roles,
  title,
  yesLabel,
}: RolesSectionProps) {
  const { t } = useTranslation()
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null)

  function toggleRolePermissions(roleId: string) {
    setExpandedRoleId((current) => (current === roleId ? null : roleId))
  }

  return (
    <RecordPageFrame title={title}>
      <AppShellTableFrame>
        <table className="min-w-full text-sm">
          <AppShellTableHead>
            <tr>
              <AppShellTableHeaderCell>{columns.name}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{columns.key}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{columns.system}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{columns.permissions}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{columns.description}</AppShellTableHeaderCell>
            </tr>
          </AppShellTableHead>
          <tbody>
            {roles.length > 0 ? (
              roles.map((role) => {
                const isExpanded = expandedRoleId === role.id
                const permissionCount = role.permissions.length
                const hasNoPermissions = permissionCount === 0

                return (
                  <Fragment key={role.id}>
                    <AppShellTableRow
                      onClick={() => toggleRolePermissions(role.id)}
                      className="cursor-pointer"
                      data-testid={`role-row-${role.key}`}
                    >
                      <td className="px-4 py-4 text-start font-medium text-foreground">
                        <span className="flex items-center gap-2">
                          {role.name}
                          <span
                            className={
                              role.isSystem
                                ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                                : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                            }
                          >
                            {role.isSystem
                              ? t("shell.rolesSystemBadge")
                              : t("shell.rolesCustomBadge")}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{role.key}</td>
                      <td className="px-4 py-4 text-start text-muted-foreground">
                        {role.isSystem ? yesLabel : noLabel}
                      </td>
                      <td className="px-4 py-4 text-start text-muted-foreground">
                        <span className="flex flex-wrap items-center gap-2">
                          <span>
                            {t("shell.rolesPermissionCount", { count: permissionCount })}
                          </span>
                          <span
                            aria-hidden="true"
                            className="text-xs"
                          >
                            {isExpanded ? "▾" : "▸"}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-4 text-start text-muted-foreground">
                        {role.description ?? emptyLabel}
                      </td>
                    </AppShellTableRow>

                    {isExpanded && (
                      <tr data-testid={`role-permissions-${role.key}`}>
                        <td
                          colSpan={5}
                          className="bg-muted/30 px-4 py-4"
                        >
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-foreground">
                              {t("shell.rolesPermissionsTitle", { name: role.name })}
                            </p>
                            {hasNoPermissions ? (
                              <p className="text-xs text-muted-foreground">
                                {t("shell.rolesPermissionsEmpty")}
                              </p>
                            ) : (
                              <ul
                                aria-label={t("shell.rolesPermissionsTitle", { name: role.name })}
                                className="flex flex-wrap gap-1.5"
                              >
                                {role.permissions.map((permission) => (
                                  <li
                                    key={permission}
                                    className="rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-xs text-foreground"
                                    data-testid={`role-permission-${role.key}-${permission.replace(/[^a-z0-9-]/gi, "-")}`}
                                  >
                                    {permission}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            ) : (
              <AppShellEmptyStateRow colSpan={5}>{emptyLabel}</AppShellEmptyStateRow>
            )}
          </tbody>
        </table>
      </AppShellTableFrame>
    </RecordPageFrame>
  )
}
