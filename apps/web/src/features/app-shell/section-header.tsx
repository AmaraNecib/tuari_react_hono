import type { ReactNode } from "react"

import { PageHeader } from "@/features/shared/page-primitives"

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return <PageHeader action={action} description={description} title={title} titleAs="h2" />
}
