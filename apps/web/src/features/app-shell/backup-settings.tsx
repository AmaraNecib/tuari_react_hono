/**
 * Backup status + folder setting (#439, #436).
 *
 * A self-contained row for the Settings → System tab. It renders the three
 * status states distinctly (never run / succeeded / failed), states the
 * retention policy and the folder, and lets the owner choose another folder —
 * with a native picker on desktop and a validated path field everywhere.
 */
import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { formatDateTimeInAlgeria } from "@/lib/algeria-time"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"

import {
  pickBackupFolder,
  useBackupStatusQuery,
  useSetBackupsRootMutation,
} from "./backup-hooks"

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : formatDateTimeInAlgeria(date)
}

/**
 * A healthy daily backup was taken for the period that just ended, so a newest
 * success within ~2 days is on schedule; older than that, the newest snapshot
 * is stale even though no single attempt failed (e.g. the app has run for days
 * without a restart). Backups only run on startup, so this is informational.
 */
const OVERDUE_AFTER_MS = 48 * 60 * 60 * 1000

function isBackupOverdue(lastSuccessAt: string | null): boolean {
  if (!lastSuccessAt) return false
  const takenAt = Date.parse(lastSuccessAt)
  return Number.isFinite(takenAt) && Date.now() - takenAt > OVERDUE_AFTER_MS
}

type SaveMessage = {
  kind: "success" | "error"
  text: string
  sessionOnly?: boolean
}

/** Settings → System: backup status and the folder snapshots are written to. */
export function BackupSettings() {
  const { t } = useTranslation()
  const statusQuery = useBackupStatusQuery()
  const setRoot = useSetBackupsRootMutation()

  const status = statusQuery.data
  const [path, setPath] = useState("")
  const [syncedRoot, setSyncedRoot] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<SaveMessage | null>(null)

  // Adopt the server's root the first time it arrives, and again after a save
  // (the mutation invalidates the status, so the normalized path flows back).
  useEffect(() => {
    if (status && status.backupsRootPath !== syncedRoot) {
      setSyncedRoot(status.backupsRootPath)
      setPath(status.backupsRootPath)
    }
  }, [status, syncedRoot])

  if (statusQuery.isLoading) {
    return (
      <div className="p-5 border border-line rounded-xl">
        <p className="text-sm text-muted-foreground">{t("settings.backups.loading")}</p>
      </div>
    )
  }

  if (statusQuery.isError || !status) {
    return (
      <div className="p-5 border border-line rounded-xl border-destructive/40 bg-destructive/5">
        <h3 className="text-lg font-semibold text-foreground">{t("settings.backups.title")}</h3>
        <p className="mt-2 text-sm leading-6 text-destructive">{t("settings.backups.loadError")}</p>
      </div>
    )
  }

  const failure = status.lastFailure
  const hasFailure = failure !== null
  const hasSuccess = status.lastSuccessAt !== null && failure === null
  const overdue = hasSuccess && isBackupOverdue(status.lastSuccessAt)
  const retention = status.retention

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = path.trim()
    setSaveMessage(null)

    if (trimmed.length === 0) {
      setSaveMessage({ kind: "error", text: t("settings.backups.pathRequired") })
      return
    }

    const result = await setRoot.mutateAsync(trimmed)
    if (result.success) {
      setSaveMessage({
        kind: "success",
        text: t("settings.backups.saveSuccess"),
        sessionOnly: !result.persisted,
      })
      return
    }
    setSaveMessage({ kind: "error", text: result.error })
  }

  const handlePick = async () => {
    const selected = await pickBackupFolder()
    if (selected) {
      setPath(selected)
      setSaveMessage(null)
    }
  }

  return (
    <div className="space-y-4">
      <div
        className={
          hasFailure
            ? "p-5 border border-destructive/40 rounded-xl bg-destructive/5"
            : "p-5 border border-line rounded-xl"
        }
        data-testid="backup-status"
        data-state={hasFailure ? "failed" : overdue ? "overdue" : hasSuccess ? "success" : "never-run"}
      >
        <div className="flex items-start justify-between gap-4" dir="rtl">
          <div className="text-start">
            <h3 className="text-lg font-semibold text-foreground">{t("settings.backups.title")}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("settings.backups.description")}
            </p>
          </div>
        </div>

        {hasFailure && (
          <div className="mt-4 space-y-1 text-start" dir="rtl">
            <p className="text-sm font-semibold text-destructive">
              {t("settings.backups.failedLabel")}
            </p>
            <p className="text-sm leading-6 text-destructive [overflow-wrap:anywhere]">
              {failure.reason}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings.backups.lastAttempt")}: {formatTimestamp(failure.at)}
            </p>
          </div>
        )}

        {hasSuccess && (
          <div className="mt-4 space-y-1 text-start" dir="rtl">
            <p className="text-sm font-semibold text-foreground">
              {t("settings.backups.succeededLabel")}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("settings.backups.lastSuccess")}: {formatTimestamp(status.lastSuccessAt)}
            </p>
            {status.lastBackupPath && (
              <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]" dir="ltr">
                {status.lastBackupPath}
              </p>
            )}
            {overdue && (
              <div className="mt-2 space-y-1 text-start" dir="rtl">
                <p className="text-sm font-semibold text-destructive">
                  {t("settings.backups.overdueLabel")}
                </p>
                <p className="text-sm leading-6 text-destructive">
                  {t("settings.backups.overdueDescription")}
                </p>
              </div>
            )}
          </div>
        )}

        {!hasFailure && !hasSuccess && (
          <div className="mt-4 space-y-1 text-start" dir="rtl">
            <p className="text-sm font-semibold text-foreground">
              {t("settings.backups.neverRunLabel")}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("settings.backups.neverRunDescription")}
            </p>
          </div>
        )}

        <div className="mt-4 space-y-1 text-start" dir="rtl">
          <p className="text-sm text-muted-foreground">
            {t("settings.backups.retention")}
            {" "}
            {t("settings.backups.retentionValue", {
              daily: retention.daily,
              weekly: retention.weekly,
              monthly: retention.monthly,
            })}
          </p>
          <p className="text-sm text-muted-foreground">{t("settings.backups.folder")}</p>
          <p className="text-xs leading-5 text-foreground [overflow-wrap:anywhere]" dir="ltr">
            {status.backupsRootPath}
          </p>
        </div>
      </div>

      <form className="p-5 border border-line rounded-xl space-y-4" onSubmit={(event) => void handleSave(event)}>
        <div className="text-start" dir="rtl">
          <h3 className="text-lg font-semibold text-foreground">{t("settings.backups.folderTitle")}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("settings.backups.folderDescription")}
          </p>
        </div>

        <Field
          label={t("settings.backups.folderLabel")}
          hint={t("settings.backups.folderHint")}
          error={saveMessage?.kind === "error" ? saveMessage.text : undefined}
        >
          <Input
            dir="ltr"
            value={path}
            placeholder={t("settings.backups.folderPlaceholder")}
            onChange={(event) => {
              setPath(event.target.value)
              setSaveMessage(null)
            }}
          />
        </Field>

        {saveMessage?.kind === "success" && (
          <div className="space-y-1 text-start" dir="rtl">
            <p className="text-sm text-foreground">{saveMessage.text}</p>
            {saveMessage.sessionOnly && (
              <p className="text-xs text-muted-foreground">
                {t("settings.backups.sessionOnly")}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3" dir="rtl">
          <Button disabled={setRoot.isPending} type="submit">
            {setRoot.isPending ? t("settings.backups.saving") : t("settings.backups.save")}
          </Button>
          {isDesktopRuntime() && (
            <Button type="button" variant="outline" onClick={() => void handlePick()}>
              {t("settings.backups.chooseFolder")}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
