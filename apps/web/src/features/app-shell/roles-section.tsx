import type { Role } from "@tuari/contracts"

import { SectionHeader } from "./section-header"

type RolesSectionProps = {
  columns: {
    name: string
    key: string
    system: string
    description: string
  }
  description: string
  emptyLabel: string
  noLabel: string
  roles: Role[]
  title: string
  yesLabel: string
}

export function RolesSection({
  columns,
  description,
  emptyLabel,
  noLabel,
  roles,
  title,
  yesLabel,
}: RolesSectionProps) {
  return (
    <div className="space-y-6">
      <SectionHeader description={description} title={title} />
      <div className="overflow-hidden rounded-[28px] border border-border/60">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right font-medium">{columns.name}</th>
                <th className="px-4 py-3 text-right font-medium">{columns.key}</th>
                <th className="px-4 py-3 text-right font-medium">{columns.system}</th>
                <th className="px-4 py-3 text-right font-medium">{columns.description}</th>
              </tr>
            </thead>
            <tbody>
              {roles.length > 0 ? (
                roles.map((role) => (
                  <tr key={role.id} className="border-t border-border/60 bg-background/10">
                    <td className="px-4 py-4 text-right font-medium text-foreground">{role.name}</td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{role.key}</td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{role.isSystem ? yesLabel : noLabel}</td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{role.description ?? emptyLabel}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={4}>
                    {emptyLabel}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
