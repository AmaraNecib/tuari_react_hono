import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { NativeSelect } from "@/components/ui/form-controls"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AppShellEmptyHint, usePaginatedRows } from "@/features/shared/table-primitives"
import { TablePaginationControls } from "@/features/shared/table-pagination-controls"
import { PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"

import { useCreateInventoryItemDefinitionMutation, useInventoryItemDefinitionsQuery } from "./inventory-hooks"

/** Item definitions management page. */
/**
 * @description Component
 */
export function InventoryItemDefinitionsPage() {
  const { t } = useTranslation()
  const listQuery = useInventoryItemDefinitionsQuery()
  const createMutation = useCreateInventoryItemDefinitionMutation()
  const [name, setName] = useState("")
  const [itemType, setItemType] = useState<"CONSUMABLE" | "ASSET">("CONSUMABLE")
  const [unit, setUnit] = useState("")
  const [description, setDescription] = useState("")

  async function handleCreate() {
    await createMutation.mutateAsync({
      name,
      itemType,
      unit: itemType === "CONSUMABLE" ? unit || null : null,
      description: description || null,
    })

    setName("")
    setUnit("")
    setDescription("")
    setItemType("CONSUMABLE")
  }

  const items = listQuery.data?.items ?? []
  const { page, pageSize, pagedRows, setPage, setPageSize } = usePaginatedRows({ rows: items })

  return (
    <div className="space-y-6">
      <Surface variant="panel">
        <PageSurfaceContent>
          <PageHeader title={t("inventoryPage.itemDefinitions.title")} description={t("inventoryPage.itemDefinitions.description")} />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t("inventoryPage.itemDefinitions.nameLabel")} required>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label={t("inventoryPage.itemDefinitions.typeLabel")} required>
              <NativeSelect value={itemType} onChange={(e) => setItemType(e.target.value as "CONSUMABLE" | "ASSET")}>
                <option value="CONSUMABLE">{t("inventoryPage.itemDefinitions.typeConsumable")}</option>
                <option value="ASSET">{t("inventoryPage.itemDefinitions.typeAsset")}</option>
              </NativeSelect>
            </Field>
            {itemType === "CONSUMABLE" ? (
              <Field label={t("inventoryPage.itemDefinitions.unitLabel")} required>
                <Input placeholder={t("inventoryPage.itemDefinitions.unitPlaceholder")} value={unit} onChange={(event) => setUnit(event.target.value)} />
              </Field>
            ) : null}
            <Field label={t("inventoryPage.itemDefinitions.descriptionLabel")} className="md:col-span-3">
              <Input value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button disabled={createMutation.isPending || name.trim().length === 0 || (itemType === "CONSUMABLE" && unit.trim().length === 0)} onClick={() => void handleCreate()}>
              {t("inventoryPage.itemDefinitions.createButton")}
            </Button>
          </div>
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title={t("inventoryPage.itemDefinitions.currentTitle")} description={t("inventoryPage.itemDefinitions.currentDescription")} />
          {items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("inventoryPage.itemDefinitions.nameLabel")}</TableHead>
                  <TableHead>{t("inventoryPage.itemDefinitions.typeLabel")}</TableHead>
                  <TableHead>{t("inventoryPage.itemDefinitions.unitLabel")}</TableHead>
                  <TableHead>{t("inventoryPage.itemDefinitions.descriptionLabel")}</TableHead>
                  <TableHead>{t("columns.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      {item.itemType === "CONSUMABLE" ? t("inventoryPage.itemDefinitions.typeConsumable") : t("inventoryPage.itemDefinitions.typeAsset")}
                    </TableCell>
                    <TableCell>{item.unit ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{item.description ?? "—"}</TableCell>
                    <TableCell>
                      <span className={item.isActive ? "text-good" : "text-muted-foreground"}>
                        {item.isActive ? t("inventoryPage.itemDefinitions.statusActive") : t("inventoryPage.itemDefinitions.statusArchived")}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">{t("inventoryPage.itemDefinitions.empty")}</p>
              <AppShellEmptyHint>{t("inventoryPage.itemDefinitions.emptyHint")}</AppShellEmptyHint>
              <Button size="sm" onClick={() => void handleCreate()} disabled={name.trim().length === 0}>
                {t("inventoryPage.itemDefinitions.createButton")}
              </Button>
            </div>
          )}

          {items.length > pageSize && (
            <TablePaginationControls
              page={page}
              pageSize={pageSize}
              totalCount={items.length}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize: number) => {
                setPage(1)
                setPageSize(nextPageSize)
              }}
            />
          )}
        </PageSurfaceContent>
      </Surface>
    </div>
  )
}
