import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import type { InventoryItemDefinition, InventoryItemUsage } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/form-controls"

import { useItemDefinitionOptionsQuery } from "./inventory-hooks"

/**
 * The usage-scoped item picker.
 *
 * A thin adapter over {@link useItemDefinitionOptionsQuery}: the hook owns the
 * offer filter, debounce, cursor chain, accumulation and resolution; this only
 * renders. The search input and "load more" button are part of the shape so the
 * paged source stays usable; a listbox is a later swap behind the same hook.
 */
export function ItemOptionPicker({
  label,
  usage,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  usage: InventoryItemUsage
  value: InventoryItemDefinition | null
  onChange: (option: InventoryItemDefinition | null) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const { options, fetchNextPage, hasNextPage, isFetchingNextPage } = useItemDefinitionOptionsQuery({
    usage,
    search,
    enabled: !disabled,
  })

  // A selection that is not on the loaded pages must still render as an option.
  const selectable = useMemo(
    () => (value && !options.some((option) => option.id === value.id) ? [value, ...options] : options),
    [options, value],
  )

  return (
    <div className="space-y-1.5">
      <Input
        aria-label={t("inventory.invoiceCreate.searchItems")}
        placeholder={t("inventory.invoiceCreate.searchItems")}
        value={search}
        disabled={disabled}
        onChange={(event) => setSearch(event.target.value)}
      />
      <NativeSelect
        aria-label={label}
        value={value?.id ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(selectable.find((option) => option.id === event.target.value) ?? null)}
      >
        <option value="">
          {disabled
            ? t("inventory.invoiceCreate.chooseLineTypeFirst")
            : selectable.length === 0
              ? t("inventory.invoiceCreate.noItemOptions")
              : t("inventory.invoiceCreate.chooseItem")}
        </option>
        {selectable.map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </NativeSelect>
      {hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isFetchingNextPage}
          onClick={() => { void fetchNextPage() }}
        >
          {t("inventory.invoiceCreate.loadMoreItems")}
        </Button>
      ) : null}
    </div>
  )
}
