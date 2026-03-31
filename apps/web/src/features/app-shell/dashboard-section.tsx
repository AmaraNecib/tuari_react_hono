import { BriefcaseBusiness, Users, Warehouse } from "lucide-react"

import { PageHeader, Surface } from "@/features/shared/page-primitives"

type DashboardSectionProps = {
  metrics: {
    workers: number
    projects: number
    warehouses: number
    roles: number
  }
  labels: {
    title: string
    description: string
    workers: string
    projects: string
    warehouses: string
    roles: string
  }
}

const cards = [
  { key: "workers", icon: Users },
  { key: "projects", icon: BriefcaseBusiness },
  { key: "warehouses", icon: Warehouse },
  // { key: "roles", icon: ShieldCheck },
] as const

export function DashboardSection({ metrics, labels }: DashboardSectionProps) {
  return (
    <div className="space-y-6">
      <PageHeader description={labels.description} title={labels.title} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ key, icon: Icon }) => (
          <Surface key={key} as="article" className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{labels[key]}</p>
                <p className="text-4xl font-semibold tracking-[-0.03em] text-foreground">{metrics[key]}</p>
              </div>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
                <Icon className="size-5" />
              </div>
            </div>
          </Surface>
        ))}
      </section>
    </div>
  )
}
