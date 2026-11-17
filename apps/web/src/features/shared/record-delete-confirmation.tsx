import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

/** The production shell's delete confirmation, shared by numeric and exact records. */
export function RecordDeleteConfirmation({ pendingLabel, pending, title, description, cancelLabel, confirmLabel, onDismiss, onConfirm }: {
  pendingLabel: string | null
  pending: boolean
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  onDismiss: () => void
  onConfirm: () => void
}) {
  return <AlertDialog open={pendingLabel !== null} onOpenChange={open => { if (!open && !pending) onDismiss() }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}{pendingLabel !== null ? ` ${pendingLabel}` : ""}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
        <AlertDialogAction disabled={pending} onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
