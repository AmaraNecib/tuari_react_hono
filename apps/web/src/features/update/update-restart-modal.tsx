import { useTranslation } from "react-i18next"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type UpdateRestartModalProps = {
  open: boolean
  onRestartNow: () => void
  onLater: () => void
}

/**
 * Modal shown after an update is applied, prompting the user to restart.
 * The parent manages visibility and restart/later side effects.
 *
 * Note: Radix UI's `AlertDialog` does not close on overlay click or Escape
 * (unlike `Dialog`). Dismissal happens only via `AlertDialogAction` (Restart
 * Now) or `AlertDialogCancel` (Later), each with an explicit `onClick` — so
 * we do not wire `onOpenChange` here. This guarantees the two paths are
 * independent and "Restart Now" can never be followed by a spurious `onLater`.
 */
export function UpdateRestartModal({ open, onRestartNow, onLater }: UpdateRestartModalProps) {
  const { t } = useTranslation()

  return (
    <AlertDialog open={open}>
      <AlertDialogContent data-testid="update-restart-modal">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("update.restartTitle", "Update Applied - Restart Required")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("update.restartDescription", "A new update has been applied. Please restart the application to complete the update.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="update-later-btn" onClick={onLater}>
            {t("update.later", "Later")}
          </AlertDialogCancel>
          <AlertDialogAction data-testid="update-restart-now-btn" onClick={onRestartNow}>
            {t("update.restartNow", "Restart Now")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
