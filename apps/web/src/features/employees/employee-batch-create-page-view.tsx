import type { FormEventHandler, ReactNode } from "react"
import { Button } from "@/components/ui/button"

/** Original employee create-page frame shared by the numeric and exact adapters. */
export function EmployeeBatchCreatePageView({
  title,
  description,
  cancelLabel,
  addLabel,
  showAdd,
  addDisabled,
  rowCount,
  rowLimit,
  limitLabel,
  submitLabel,
  busyLabel,
  busy,
  submitDisabled,
  cancelDisabled = false,
  onCancel,
  onAdd,
  onSubmit,
  children,
}: {
  title: string
  description: string
  cancelLabel: string
  addLabel?: string
  showAdd: boolean
  addDisabled: boolean
  rowCount: number
  rowLimit: number
  limitLabel?: string
  submitLabel: string
  busyLabel: string
  busy: boolean
  submitDisabled: boolean
  cancelDisabled?: boolean
  onCancel: () => void
  onAdd?: () => void
  onSubmit: FormEventHandler<HTMLFormElement>
  children: ReactNode
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-5 xl:flex-row xl:items-end xl:justify-between" dir="rtl">
        <div className="space-y-2 text-start">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3" dir="rtl">
          <Button type="button" variant="outline" disabled={cancelDisabled} onClick={onCancel}>{cancelLabel}</Button>
          {showAdd ? <Button type="button" disabled={addDisabled} onClick={onAdd}>{addLabel}</Button> : null}
        </div>
      </div>
      {limitLabel && rowCount >= rowLimit ? <p className="text-sm text-muted-foreground">{limitLabel}</p> : null}
      <form className="space-y-4" onSubmit={onSubmit} aria-busy={busy}>
        {children}
        <div className="flex items-center justify-end gap-3">
          <Button className="min-w-44" disabled={submitDisabled} type="submit">{busy ? busyLabel : submitLabel}</Button>
          <Button type="button" variant="outline" disabled={cancelDisabled} onClick={onCancel}>{cancelLabel}</Button>
        </div>
      </form>
    </div>
  )
}
