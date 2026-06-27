/**
 * Project edit page for modifying existing projects.
 */
import type { FormEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { useUpdateProjectMutation } from "@/features/app-shell/mock-dashboard"
import { PageActionGroup, PageFooterActions, PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives"
import { navigateToWorkspaceRoute, workspaceRoutes } from "@/router/navigation"

import type { ProjectPageRecord } from "./project-details-page"
import { createProjectFormState, ProjectFormFields, type ProjectFormErrors, type ProjectFormState } from "./project-form"

export function ProjectEditPage({
  managerOptions,
  project,
}: {
  managerOptions: Array<{ id: string; label: string }>
  project: ProjectPageRecord
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const updateProjectMutation = useUpdateProjectMutation()
  const [state, setState] = useState<ProjectFormState>(() => createProjectFormState(project))
  const [errors, setErrors] = useState<ProjectFormErrors>({})
  const previousProjectIdRef = useRef(project.id)
  const statusOptions = useMemo(
    () => [
      { value: "ACTIVE", label: t("status.active") },
      { value: "STOPPED", label: t("status.stopped") },
      { value: "COMPLETED", label: t("status.completed") },
      { value: "ARCHIVED", label: t("status.archived") },
    ],
    [t],
  )

  useEffect(() => {
    if (previousProjectIdRef.current === project.id) {
      return
    }

    previousProjectIdRef.current = project.id
    setState(createProjectFormState(project))
    setErrors({})
  }, [project])

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

    const nextManagerId = state.managerId || null
    await updateProjectMutation.mutateAsync({
      id: project.id,
      name: state.name.trim(),
      location: state.location.trim() || null,
      managerId: nextManagerId !== project.managerId ? nextManagerId : undefined,
      status: state.status as "ACTIVE" | "STOPPED" | "COMPLETED" | "ARCHIVED",
      notes: state.notes.trim() || null,
    })

    void navigateToWorkspaceRoute(navigate, workspaceRoutes.projectDetails(project.id))
  }

  return (
    <Surface variant="panel">
      <form onSubmit={handleSubmit}>
        <PageSurfaceContent>
        <PageHeader
          action={
            <PageActionGroup>
              <Button type="button" onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.projectDetails(project.id))}>
                {t("detailPages.shared.backToRecord")}
              </Button>
              <Button type="button" variant="outline" onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.projects())}>
                {t("detailPages.project.back")}
              </Button>
            </PageActionGroup>
          }
          description={t("detailPages.project.description")}
          title={`${t("detailPages.project.editTitle")} - ${project.name}`}
        />

        <ProjectFormFields
          description={t("detailPages.project.description")}
          errors={errors}
          labels={{
            name: t("detailPages.project.name"),
            location: t("detailPages.project.location"),
            manager: t("detailPages.project.manager"),
            status: t("detailPages.project.status"),
            notes: t("detailPages.project.notes"),
            noManager: t("shell.noManager"),
          }}
          managerOptions={managerOptions}
          state={state}
          statusOptions={statusOptions}
          title={t("detailPages.project.overviewTab")}
          onChange={setState}
        />

        <PageFooterActions>
          <Button type="button" variant="outline" onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.projectDetails(project.id))}>
             {t("common.cancel")}
           </Button>
          <Button disabled={updateProjectMutation.isPending} type="submit">
            {t("detailPages.project.saveChanges")}
          </Button>
        </PageFooterActions>
        </PageSurfaceContent>
      </form>
    </Surface>
  )
}
