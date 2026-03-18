import { BriefcaseBusiness, ShieldCheck, Users, Warehouse } from "lucide-react"

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
      <section className="space-y-2 border-b border-border/60 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{labels.title}</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{labels.description}</p>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {cards.map(({ key, icon: Icon }) => (
          <article
            key={key}
            className="rounded-[28px] border border-border/40 bg-background/18 p-5 backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{labels[key]}</p>
                <p className="text-4xl font-semibold text-foreground">{metrics[key]}</p>
              </div>
              <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
                <Icon className="size-5" />
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
