import { HomeViewPageDetailContent } from "./home-view-page-content-detail-pages"
import { HomeViewPageSectionContent } from "./home-view-page-content-sections"
import type { HomeViewPageContentProps } from "./home-view-page-content-shared"
import {
  buildEmployeeEditManagerOptions,
  buildProjectEditManagerOptions,
  buildWarehouseEditManagerOptions,
} from "./home-view-page-content-view-model"

export function HomeViewPageContent({
  copy,
  derived,
  detailTab,
  navigation,
  page,
  selectedCounterparty,
  selectedEmployee,
  selectedProject,
  selectedWarehouse,
  t,
  ...rest
}: HomeViewPageContentProps) {
  const selectedEmployeeManagerOptions = buildEmployeeEditManagerOptions(derived, selectedEmployee)
  const selectedProjectManagerOptions = buildProjectEditManagerOptions(derived, selectedProject)
  const selectedWarehouseManagerOptions = buildWarehouseEditManagerOptions(derived, selectedWarehouse)

  return (
    <>
      <HomeViewPageSectionContent
        copy={copy}
        derived={derived}
        navigation={navigation}
        page={page}
        {...rest}
      />
      <HomeViewPageDetailContent
        copy={copy}
        derived={derived}
        detailTab={detailTab}
        navigation={navigation}
        page={page}
        selectedCounterparty={selectedCounterparty}
        selectedEmployeeManagerOptions={selectedEmployeeManagerOptions}
        selectedEmployee={selectedEmployee}
        selectedProject={selectedProject}
        selectedProjectManagerOptions={selectedProjectManagerOptions}
        selectedWarehouse={selectedWarehouse}
        selectedWarehouseManagerOptions={selectedWarehouseManagerOptions}
        t={t}
      />
    </>
  )
}
