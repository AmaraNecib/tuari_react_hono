import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type CreateableSelectProps = {
  /** Current value */
  value: string
  /** Change handler */
  onChange: (value: string) => void
  /** Array of options to display */
  options: Array<{ id: string; name: string }>
  /** Label for the empty/default option */
  emptyLabel?: string
  /** Label shown when no options exist */
  placeholder?: string
  /** Label for the "Create new" dialog title */
  createLabel?: string
  /** Fields to show in the creation form */
  createFields?: Array<{
    key: string
    label: string
    placeholder?: string
    type?: "text" | "textarea"
    required?: boolean
  }>
  /** Function to call when creating a new item */
  onCreate?: (data: Record<string, string>) => Promise<{ id: string; name: string }>
  /** Whether the select is disabled */
  disabled?: boolean
  /** Additional className for the select */
  className?: string
}

/**
 * A select component with a "Create new" option at the top.
 * When "Create new" is selected, a dialog opens to create the item,
 * then the select is updated with the new value.
 */
export function CreateableSelect({
  value,
  onChange,
  options,
  emptyLabel,
  placeholder,
  createLabel,
  createFields,
  onCreate,
  disabled = false,
  className,
}: CreateableSelectProps) {
  const { t } = useTranslation()
  const resolvedCreateFields = createFields ?? [
    { key: "name", label: t("common.name"), placeholder: t("common.namePlaceholder"), required: true },
  ]
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createData, setCreateData] = useState<Record<string, string>>({})
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const resolvedEmptyLabel = emptyLabel ?? t("common.selectPlaceholder", "اختر...")
  const resolvedPlaceholder = placeholder ?? t("common.noOptions", "لا توجد خيارات")
  const resolvedCreateLabel = createLabel ?? t("common.createNew", "إنشاء جديد")

  function handleValueChange(selectedValue: string | null) {
    if (!selectedValue) return
    if (selectedValue === "__create_new__") {
      setShowCreateDialog(true)
      setCreateData({})
      setCreateError(null)
    } else {
      onChange(selectedValue)
    }
  }

  async function handleCreate() {
    if (!onCreate) return

    // Validate required fields
    for (const field of resolvedCreateFields) {
      if (field.required && !createData[field.key]?.trim()) {
        setCreateError(t("common.fieldRequired", { field: field.label }))
        return
      }
    }

    setIsCreating(true)
    setCreateError(null)

    try {
      const result = await onCreate(createData)
      onChange(result.id)
      setShowCreateDialog(false)
      setCreateData({})
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : t("common.creationError"))
    } finally {
      setIsCreating(false)
    }
  }

  function handleCloseDialog() {
    setShowCreateDialog(false)
    setCreateData({})
    setCreateError(null)
  }

  return (
    <>
      <Select value={value} onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger className={className}>
          <SelectValue placeholder={resolvedEmptyLabel} />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 && (
            <SelectItem value="" disabled>
              {resolvedPlaceholder}
            </SelectItem>
          )}
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
          {onCreate && (
            <SelectItem value="__create_new__">
              + {resolvedCreateLabel}
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      <Dialog open={showCreateDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{resolvedCreateLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {resolvedCreateFields.map((field) => (
              <label key={field.key} className="space-y-1.5 text-sm">
                <span className="font-medium text-foreground">
                  {field.label}
                  {field.required && <span className="ms-1 text-destructive">*</span>}
                </span>
                {field.type === "textarea" ? (
                  <textarea
                    className="min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder={field.placeholder}
                    value={createData[field.key] ?? ""}
                    onChange={(e) => setCreateData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  />
                ) : (
                  <Input
                    placeholder={field.placeholder}
                    value={createData[field.key] ?? ""}
                    onChange={(e) => setCreateData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  />
                )}
              </label>
            ))}
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? t("common.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
