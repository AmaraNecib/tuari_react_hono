import type { FormEvent } from "react"
import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { AppMutationError, useCreateWarehouseMutation } from "@/features/app-shell/workspace-mutations"
import { PageActionGroup, PageFooterActions, PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives"
import { navigateToWorkspaceRoute, workspaceRoutes } from "@/router/navigation"

import { createWarehouseFormState, WarehouseFormFields, type WarehouseFormErrors } from "./warehouse-form"

function mapServerErrors(error: AppMutationError): WarehouseFormErrors {
  const errors: WarehouseFormErrors = {}

  for (const fieldError of error.fieldErrors) {
    if (fieldError.field === "name") {
      errors.name = fieldError.message
    }

    if (fieldError.field === "address") {
      errors.address = fieldError.message
    }

    if (fieldError.field === "managerId") {
      errors.managerId = fieldError.message
    }

    if (fieldError.field === "status") {
      errors.status = fieldError.message
    }

    if (fieldError.field === "notes") {
      errors.notes = fieldError.message
    }
  }

  return errors
}

/** Warehouse creation page with form fields. */
export function WarehouseCreatePage({ managerOptions }: { managerOptions: Array<{ id: string; label: string }> }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createWarehouseMutation = useCreateWarehouseMutation()
  const [state, setState] = useState(() => createWarehouseFormState())
  const [errors, setErrors] = useState<WarehouseFormErrors>({})
  const statusOptions = useMemo(
    () => [
      { value: "ACTIVE" as const, label: t("status.active") },
      { value: "INACTIVE" as const, label: t("status.inactive") },
      { value: "ARCHIVED" as const, label: t("status.archived") },
    ],
    [t],
  )

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

    try {
      const result = await createWarehouseMutation.mutateAsync({
        name: state.name.trim(),
        address: state.address.trim() || null,
        managerId: state.managerId || null,
        status: state.status as "ACTIVE" | "INACTIVE" | "ARCHIVED",
        notes: state.notes.trim() || null,
      })

      void navigateToWorkspaceRoute(navigate, workspaceRoutes.warehouseDetails(result.item.id))
    } catch (error) {
      if (error instanceof AppMutationError) {
        setErrors(mapServerErrors(error))
      }
    }
  }

  return (
    <Surface variant="panel">
      <form onSubmit={handleSubmit}>
        <PageSurfaceContent>
          <PageHeader
            action={
              <PageActionGroup>
                <Button type="button" variant="outline" onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.warehouses())}>
                  {t("detailPages.warehouse.back")}
                </Button>
              </PageActionGroup>
            }
            description={t("detailPages.warehouse.createDescription")}
            title={t("detailPages.warehouse.createTitle")}
          />

          <WarehouseFormFields
            description={t("detailPages.warehouse.createDescription")}
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
            onChange={(nextState) => {
              setState(nextState)
              setErrors({})
            }}
          />

          <PageFooterActions>
            <Button type="button" variant="outline" onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.warehouses())}>
              {t("common.cancel")}
            </Button>
            <Button disabled={createWarehouseMutation.isPending} type="submit">
              {t("detailPages.warehouse.createSave")}
            </Button>
          </PageFooterActions>
        </PageSurfaceContent>
      </form>
    </Surface>
  )
}
