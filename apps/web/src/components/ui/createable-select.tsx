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

/** Sentinel item values handled by the select before they reach `onChange`. */
const CREATE_VALUE = "__create_new__"
const CLEAR_VALUE = "__clear__"

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
  /**
   * When true, the listbox offers an explicit row (labelled with
   * `emptyLabel`) that clears the value back to `""`. Without it a select
   * whose value was once set cannot return to empty — the placeholder only
   * shows the empty state, it is not selectable.
   */
  clearable?: boolean
  /** Whether the select is disabled */
  disabled?: boolean
  /** Additional className for the select */
  className?: string
  /** Display text for the selected value (fallback when options haven't loaded yet) */
  displayValue?: string
}

/**
 * A select component with a "Create new" option at the top.
 * When "Create new" is selected, a dialog opens to create the item,
 * then the select is updated with the new value.
 */
/**
 * @description Component
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
  clearable = false,
  disabled = false,
  className,
  displayValue,
}: CreateableSelectProps) {
  const { t } = useTranslation()
  const resolvedCreateFields = createFields ?? [
    { key: "name", label: t("common.name"), placeholder: t("common.namePlaceholder"), required: true },
  ]
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createData, setCreateData] = useState<Record<string, string>>({})
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const resolvedEmptyLabel = emptyLabel ?? t("common.selectPlaceholder")
  const resolvedPlaceholder = placeholder ?? t("common.noOptions")
  const resolvedCreateLabel = createLabel ?? t("common.createNew")

  // Base UI resolves the closed trigger's label from the registered popup items,
  // which are only present while the popup is open. Without an explicit display
  // text the trigger falls back to the raw value (e.g. a UUID), so the selection
  // looks lost on re-render. Derive the display name from the matching option
  // (falling back to the explicit displayValue and finally the raw value).
  const selectedOption = options.find((option) => option.id === value)
  const resolvedDisplayValue =
    (displayValue && displayValue.trim()) ||
    (selectedOption && selectedOption.name.trim()) ||
    (value ? value : "")

  function handleValueChange(selectedValue: string | null) {
    if (!selectedValue) return
    if (selectedValue === CLEAR_VALUE) {
      onChange("")
    } else if (selectedValue === CREATE_VALUE) {
      setShowCreateDialog(true)
      setCreateData({})
      setCreateError(null)
    } else {
      onChange(selectedValue)
    }
  }

  async function handleCreate() {
    // Re-entrancy guard: the button is disabled while creating, but a second
    // click dispatched before React re-renders must not create twice.
    if (!onCreate || isCreating) return

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
    // An in-flight create cannot be cancelled: the employee may already be
    // committed server-side, and the late result would otherwise select a
    // person the user thought they had dismissed. Keep the dialog open until
    // the mutation settles; the Cancel button is disabled to signal this.
    if (isCreating) return
    setShowCreateDialog(false)
    setCreateData({})
    setCreateError(null)
  }

  return (
    <>
      <Select value={value} onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger className={className}>
          <SelectValue
            placeholder={resolvedEmptyLabel}
            children={resolvedDisplayValue.length > 0 ? resolvedDisplayValue : undefined}
          />
        </SelectTrigger>
        <SelectContent>
          {clearable && <SelectItem value={CLEAR_VALUE}>{resolvedEmptyLabel}</SelectItem>}
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
            <SelectItem value={CREATE_VALUE}>
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
            <Button variant="outline" disabled={isCreating} onClick={handleCloseDialog}>
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
