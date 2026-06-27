/**
 * Warehouse edit page for modifying existing warehouses.
 */
import type { FormEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { useUpdateWarehouseMutation } from "@/features/app-shell/mock-dashboard"
import { PageActionGroup, PageFooterActions, PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives"
import { navigateToWorkspaceRoute, workspaceRoutes } from "@/router/navigation"

import type { WarehousePageRecord } from "./warehouse-details-page"
import {
  createWarehouseFormState,
  WarehouseFormFields,
  type WarehouseFormErrors,
  type WarehouseFormState,
} from "./warehouse-form"

/**
 * @description Component
 */
export function WarehouseEditPage({
  managerOptions,
  warehouse,
}: {
  managerOptions: Array<{ id: string; label: string }>
  warehouse: WarehousePageRecord
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const updateWarehouseMutation = useUpdateWarehouseMutation()
  const [state, setState] = useState<WarehouseFormState>(() => createWarehouseFormState(warehouse))
  const [errors, setErrors] = useState<WarehouseFormErrors>({})
  const previousWarehouseIdRef = useRef(warehouse.id)
  const statusOptions = useMemo(
    () => [
      { value: "ACTIVE", label: t("status.active") },
      { value: "INACTIVE", label: t("status.inactive") },
      { value: "ARCHIVED", label: t("status.archived") },
    ],
    [t],
  )

  useEffect(() => {
    if (previousWarehouseIdRef.current === warehouse.id) {
      return
    }

    previousWarehouseIdRef.current = warehouse.id
    setState(createWarehouseFormState(warehouse))
    setErrors({})
  }, [warehouse])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextErrors: WarehouseFormErrors = {}

    if (state.name.trim().length === 0) {
      nextErrors.name = t("detailPages.warehouse.validation.nameRequired")
    }

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    const nextManagerId = state.managerId || null
    await updateWarehouseMutation.mutateAsync({
      id: warehouse.id,
      name: state.name.trim(),
      address: state.address.trim() || null,
      managerId: nextManagerId !== warehouse.managerId ? nextManagerId : undefined,
      status: state.status as "ACTIVE" | "INACTIVE" | "ARCHIVED",
      notes: state.notes.trim() || null,
    })

    void navigateToWorkspaceRoute(navigate, workspaceRoutes.warehouseDetails(warehouse.id))
  }

  return (
    <Surface variant="panel">
      <form onSubmit={handleSubmit}>
        <PageSurfaceContent>
        <PageHeader
          action={
            <PageActionGroup>
              <Button type="button" onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.warehouseDetails(warehouse.id))}>
                {t("detailPages.shared.backToRecord")}
              </Button>
              <Button type="button" variant="outline" onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.warehouses())}>
                {t("detailPages.warehouse.back")}
              </Button>
            </PageActionGroup>
          }
          description={t("detailPages.warehouse.description")}
          title={`${t("detailPages.warehouse.editTitle")} - ${warehouse.name}`}
        />

        <WarehouseFormFields
          description={t("detailPages.warehouse.description")}
          errors={errors}
          labels={{
            name: t("detailPages.warehouse.name"),
            address: t("detailPages.warehouse.address"),
            manager: t("detailPages.warehouse.manager"),
            status: t("detailPages.warehouse.status"),
            notes: t("detailPages.warehouse.notes"),
            noManager: t("shell.noManager"),
          }}
          managerOptions={managerOptions}
          state={state}
          statusOptions={statusOptions}
          title={t("detailPages.warehouse.overviewTab")}
          onChange={setState}
        />

        <PageFooterActions>
          <Button type="button" variant="outline" onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.warehouseDetails(warehouse.id))}>
            {t("common.cancel")}
          </Button>
          <Button disabled={updateWarehouseMutation.isPending} type="submit">
            {t("detailPages.warehouse.saveChanges")}
          </Button>
        </PageFooterActions>
        </PageSurfaceContent>
      </form>
    </Surface>
  )
}
