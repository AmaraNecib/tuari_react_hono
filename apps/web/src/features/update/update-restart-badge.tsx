import { useTranslation } from "react-i18next"
import { RotateCcw } from "lucide-react"
import { useRestartPending } from "./use-update-state"

/**
 * Persistent badge shown in the app shell header when an update has been
 * applied but the user deferred the restart. Remains visible until the
 * application is actually restarted.
 */
export function UpdateRestartBadge() {
  const { t } = useTranslation()
  const { pending } = useRestartPending()

  if (!pending) {
    return null
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-[12px] font-medium leading-none whitespace-nowrap"
      title={t("update.restartBadgeTooltip", "Restart required to apply update")}
    >
      <RotateCcw size={14} className="shrink-0" />
      <span>{t("update.restartBadge", "Restart Required")}</span>
    </div>
  )
}
