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
import { restartApp } from "./update-bridge"
import type { UseRestartPendingReturn } from "./use-update-state"

type UpdateRestartModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  setPending: UseRestartPendingReturn["setPending"]
}

/** Modal shown after an update is applied, prompting the user to restart. */
export function UpdateRestartModal({ open, onOpenChange, setPending }: UpdateRestartModalProps) {
  const { t } = useTranslation()

  async function handleRestartNow() {
    setPending(false)
    await restartApp()
  }

  function handleLater() {
    setPending(true)
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleLater() }} >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("update.restartTitle", "Update Applied - Restart Required")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("update.restartDescription", "A new update has been applied. Please restart the application to complete the update.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleLater}>
            {t("update.later", "Later")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleRestartNow()}>
            {t("update.restartNow", "Restart Now")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
