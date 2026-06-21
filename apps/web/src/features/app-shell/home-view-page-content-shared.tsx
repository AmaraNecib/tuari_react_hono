import type { TFunction } from "i18next"
import type { SystemLogEntry } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { Surface } from "@/features/shared/page-primitives"
import type { WorkspaceRouteTarget } from "@/router/navigation"

import type { HomeViewCopy } from "./home-view-copy"
import type { HomeViewDerived } from "./home-view-derived"
import type { useHomeViewNavigation } from "./home-view-navigation"
import type { DemoSession } from "./mock-dashboard"
import type { HomeViewPage, HomeViewSystemLogFilters, PendingDelete } from "./home-view-types"
import type { SettingsSection } from "./settings-section"

export type HomeViewProjectManagerOption = HomeViewDerived["projectManagerOptions"][number]
export type HomeViewWarehouseManagerOption = HomeViewDerived["warehouseManagerOptions"][number]
export type CurrentManagerOption = { id: string | null; label: string }

export type HomeViewPageContentProps = {
  copy: HomeViewCopy
  derived: HomeViewDerived
  detailTab?: string
  invoiceId?: string
  page: HomeViewPage
  selectedCounterparty: HomeViewDerived["externalCounterparties"][number] | null
  selectedEmployee: HomeViewDerived["employeeRows"][number] | null
  selectedProject: HomeViewDerived["projects"][number] | null
  selectedWarehouse: HomeViewDerived["warehouses"][number] | null
  session: NonNullable<DemoSession>
  systemLogFilters: HomeViewSystemLogFilters
  systemLogState: { entries: SystemLogEntry[]; isError: boolean; isLoading: boolean }
  t: TFunction
  theme: "light" | "dark"
  resetWorkspacePending: boolean
  updateAccountPending: boolean
  onAddProject: () => void
  onAddWarehouse: () => void
  onResetWorkspace: () => void
  onSaveAccount: Parameters<typeof SettingsSection>[0]["onSaveAccount"]
  onSetPendingDelete: (value: PendingDelete | null) => void
  onSystemLogFiltersChange: (filters: HomeViewSystemLogFilters) => void
  onThemeToggle: () => void
  navigation: ReturnType<typeof useHomeViewNavigation>
  paginationCursor?: string
  paginationLimit?: number
  workspace?: import("./workspace-queries").DemoWorkspace
}

export function includeCurrentProjectManagerOption(
  options: HomeViewProjectManagerOption[],
  currentManager: CurrentManagerOption,
  currentProject?: { id: string | null; label: string },
) {
  if (!currentManager.id || options.some((option) => option.id === currentManager.id)) {
    return options
  }

  return [
    {
      id: currentManager.id,
      label: currentManager.label,
      projectOptions:
        currentProject?.id && currentProject.label
          ? [
              {
                id: currentProject.id,
                label: currentProject.label,
              },
            ]
          : [],
    },
    ...options,
  ]
}

export function includeCurrentWarehouseManagerOption(
  options: HomeViewWarehouseManagerOption[],
  currentManager: CurrentManagerOption,
) {
  if (!currentManager.id || options.some((option) => option.id === currentManager.id)) {
    return options
  }

  return [{ id: currentManager.id, label: currentManager.label }, ...options]
}

export function MissingRecordState({
  backLabel,
  description,
  navigation,
  target,
  title,
}: {
  backLabel: string
  description: string
  navigation: ReturnType<typeof useHomeViewNavigation>
  target: WorkspaceRouteTarget
  title: string
}) {
  return (
    <Surface variant="panel" className="p-6 xl:p-7">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        <Button variant="outline" onClick={() => void navigation.goToRoute(target)}>
          {backLabel}
        </Button>
      </div>
    </Surface>
  )
}
