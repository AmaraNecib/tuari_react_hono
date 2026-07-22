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
  onOpenChange: (open: boolean) => void
  onRestartNow: () => void
  onLater: () => void
}

/**
 * Modal shown after an update is applied, prompting the user to restart.
 * The parent manages visibility and restart/later side effects.
 */
export function UpdateRestartModal({ open, onOpenChange, onRestartNow, onLater }: UpdateRestartModalProps) {
  const { t } = useTranslation()

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onLater()
      }}
    >
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
