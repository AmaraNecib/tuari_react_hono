import type { Role } from "@tuari/contracts"
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
  }
  emptyLabel: string
  noLabel: string
  roles: Role[]
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
  return (
    <RecordPageFrame title={title}>
      <AppShellTableFrame>
            <table className="min-w-full text-sm">
              <AppShellTableHead>
                <tr>
                  <AppShellTableHeaderCell>{columns.name}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{columns.key}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{columns.system}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{columns.description}</AppShellTableHeaderCell>
                </tr>
              </AppShellTableHead>
              <tbody>
                {roles.length > 0 ? (
                  roles.map((role) => (
                    <AppShellTableRow key={role.id}>
                      <td className="px-4 py-4 text-start font-medium text-foreground">{role.name}</td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{role.key}</td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{role.isSystem ? yesLabel : noLabel}</td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{role.description ?? emptyLabel}</td>
                    </AppShellTableRow>
                  ))
                ) : (
                  <AppShellEmptyStateRow colSpan={4}>{emptyLabel}</AppShellEmptyStateRow>
                )}
              </tbody>
            </table>
        </AppShellTableFrame>
    </RecordPageFrame>
  )
}
