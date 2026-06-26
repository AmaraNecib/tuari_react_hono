import { useState } from "react"


import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/form-controls"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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
  emptyLabel = "اختر...",
  placeholder = "لا توجد خيارات",
  createLabel = "إنشاء جديد",
  createFields = [{ key: "name", label: "الاسم", placeholder: "الاسم...", required: true }],
  onCreate,
  disabled = false,
  className,
}: CreateableSelectProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createData, setCreateData] = useState<Record<string, string>>({})
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  function handleSelectChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const selectedValue = event.target.value
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
    for (const field of createFields) {
      if (field.required && !createData[field.key]?.trim()) {
        setCreateError(`حقل "${field.label}" مطلوب`)
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
      setCreateError(error instanceof Error ? error.message : "حدث خطأ أثناء الإنشاء")
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
      <NativeSelect
        value={value}
        onChange={handleSelectChange}
        disabled={disabled}
        className={className}
      >
        <option value="">{emptyLabel}</option>
        {options.length === 0 && <option value="" disabled>{placeholder}</option>}
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
        {onCreate && <option value="__create_new__">+ {createLabel}</option>}
      </NativeSelect>

      <Dialog open={showCreateDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{createLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {createFields.map((field) => (
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
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCloseDialog}>إلغاء</Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? "جارٍ الإنشاء..." : "إنشاء"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
