import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"

import { useCreateInventoryItemDefinitionMutation, useInventoryItemDefinitionsQuery } from "./inventory-hooks"

function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <span>
      {label}
      {required ? <span className="ms-1 text-destructive">*</span> : null}
    </span>
  )
}

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

  return (
    <div className="space-y-6">
      <Surface variant="panel">
        <PageSurfaceContent>
          <PageHeader title={t("inventoryPage.itemDefinitions.title")} description={t("inventoryPage.itemDefinitions.description")} />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <FieldLabel label={t("inventoryPage.itemDefinitions.nameLabel")} required />
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="space-y-2 text-sm">
              <FieldLabel label={t("inventoryPage.itemDefinitions.typeLabel")} required />
              <select className="h-10 rounded-xl border border-border bg-background px-3" value={itemType} onChange={(event) => setItemType(event.target.value as "CONSUMABLE" | "ASSET") }>
                <option value="CONSUMABLE">{t("inventoryPage.itemDefinitions.typeConsumable")}</option>
                <option value="ASSET">{t("inventoryPage.itemDefinitions.typeAsset")}</option>
              </select>
            </label>
            {itemType === "CONSUMABLE" ? (
              <label className="space-y-2 text-sm">
                <FieldLabel label={t("inventoryPage.itemDefinitions.unitLabel")} required />
                <Input placeholder={t("inventoryPage.itemDefinitions.unitPlaceholder")} value={unit} onChange={(event) => setUnit(event.target.value)} />
              </label>
            ) : null}
            <label className="space-y-2 text-sm md:col-span-2">
              <FieldLabel label={t("inventoryPage.itemDefinitions.descriptionLabel")} />
              <Input value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
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
          <div className="grid gap-3">
            {listQuery.data?.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3 text-sm">
                <div className="space-y-1">
                  <div className="font-medium text-foreground">{item.name}</div>
                  <div className="text-muted-foreground">
                    {item.itemType === "CONSUMABLE" ? `${t("inventoryPage.itemDefinitions.typeConsumable")} - ${item.unit}` : t("inventoryPage.itemDefinitions.typeAsset")}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{item.isActive ? t("inventoryPage.itemDefinitions.statusActive") : t("inventoryPage.itemDefinitions.statusArchived")}</div>
              </div>
            ))}
            {listQuery.data?.items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">{t("inventoryPage.itemDefinitions.empty")}</p>
                <Button size="sm" onClick={() => void handleCreate()} disabled={name.trim().length === 0}>
                  {t("inventoryPage.itemDefinitions.createButton")}
                </Button>
              </div>
            ) : null}
          </div>
        </PageSurfaceContent>
      </Surface>
    </div>
  )
}
