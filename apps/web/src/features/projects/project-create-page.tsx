/**
 * Project creation page for creating new projects.
 */
import type { FormEvent } from "react"
import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { AppMutationError, useCreateProjectMutation } from "@/features/app-shell/mock-dashboard"
import { PageActionGroup, PageFooterActions, PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives"
import { navigateToWorkspaceRoute, workspaceRoutes } from "@/router/navigation"

import { createProjectFormState, ProjectFormFields, type ProjectFormErrors } from "./project-form"
import { useManagerInlineCreateSelection } from "./manager-inline-create"

function mapServerErrors(error: AppMutationError): ProjectFormErrors {
  const errors: ProjectFormErrors = {}

  for (const fieldError of error.fieldErrors) {
    if (fieldError.field === "name") {
      errors.name = fieldError.message
    }

    if (fieldError.field === "location") {
      errors.location = fieldError.message
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

/**
 * @description Component
 */
export function ProjectCreatePage({
  managerOptions,
  projectManagerRoleId,
}: {
  managerOptions: Array<{ id: string; label: string }>
  projectManagerRoleId: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createProjectMutation = useCreateProjectMutation()
  const [state, setState] = useState(() => createProjectFormState())
  const [errors, setErrors] = useState<ProjectFormErrors>({})
  const { managerCreate, managerDisplayValue } = useManagerInlineCreateSelection({
    projectManagerRoleId,
    selectedManagerId: state.managerId,
  })
  const statusOptions = useMemo(
    () => [
      { value: "ACTIVE" as const, label: t("status.active") },
      { value: "STOPPED" as const, label: t("status.stopped") },
      { value: "COMPLETED" as const, label: t("status.completed") },
      { value: "ARCHIVED" as const, label: t("status.archived") },
    ],
    [t],
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextErrors: ProjectFormErrors = {}

    if (state.name.trim().length === 0) {
      nextErrors.name = t("detailPages.project.validation.nameRequired")
    }

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    try {
      const result = await createProjectMutation.mutateAsync({
        name: state.name.trim(),
        location: state.location.trim() || null,
        managerId: state.managerId || null,
        status: state.status as "ACTIVE" | "STOPPED" | "COMPLETED" | "ARCHIVED",
        notes: state.notes.trim() || null,
      })

      void navigateToWorkspaceRoute(navigate, workspaceRoutes.projectDetails(result.item.id))
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
                <Button type="button" variant="outline" onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.projects())}>
                  {t("detailPages.project.back")}
                </Button>
              </PageActionGroup>
            }
            description={t("detailPages.project.createDescription")}
            title={t("detailPages.project.createTitle")}
          />

          <ProjectFormFields
            description={t("detailPages.project.createDescription")}
            errors={errors}
            labels={{
              name: t("detailPages.project.name"),
              location: t("detailPages.project.location"),
              manager: t("detailPages.project.manager"),
              status: t("detailPages.project.status"),
              notes: t("detailPages.project.notes"),
              noManager: t("shell.noManager"),
            }}
            managerCreate={managerCreate}
            managerDisplayValue={managerDisplayValue}
            managerOptions={managerOptions}
            state={state}
            statusOptions={statusOptions}
            title={t("detailPages.project.overviewTab")}
            onChange={(nextState) => {
              setState(nextState)
              setErrors({})
            }}
          />

          <PageFooterActions>
            <Button type="button" variant="outline" onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.projects())}>
              {t("common.cancel")}
            </Button>
            <Button disabled={createProjectMutation.isPending} type="submit">
              {t("detailPages.project.createSave")}
            </Button>
          </PageFooterActions>
        </PageSurfaceContent>
      </form>
    </Surface>
  )
}
