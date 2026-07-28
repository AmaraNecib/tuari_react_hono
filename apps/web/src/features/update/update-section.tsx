/**
 * Update section component for Settings → About.
 * Handles check for updates, download progress, apply, and error states.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import { Button } from "@/components/ui/button"

type DownloadProgress = {
  downloadedBytes: number
  totalBytes: number
  speedBytesPerSec: number
  percentage: number
  status: "downloading" | "completed" | "cancelled" | "error"
  error?: string | null
}

type UpdateStatus =
  | { type: "idle" }
  | { type: "checking" }
  | { type: "available"; version: string; downloadUrl: string }
  | { type: "uptodate" }
  | { type: "unavailable" }
  | { type: "downloading"; progress: DownloadProgress }
  | { type: "completed"; filePath: string }
  | { type: "error"; message: string }

type UpdateSectionProps = {
  /** Called after an update is successfully applied. Used to trigger the restart prompt. */
  onUpdateApplied?: () => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

function getCurrentVersion(): string {
  return "0.1.0"
}

export function UpdateSection({ onUpdateApplied }: UpdateSectionProps = {}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<UpdateStatus>({ type: "idle" })
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<string | null>(null)
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)
  // Re-entrancy lock: prevents double-click from spawning two concurrent downloads
  // before React re-renders and the status guard kicks in.
  const downloadInFlightRef = useRef(false)
  // Tracks whether the component is still mounted across the await listen() point.
  // Closes the microtask-wide race where unmount happens between listen() resolving
  // and the synchronous assignment to unlistenRef.current, which would otherwise
  // leak the event subscription for the lifetime of the app.
  const mountedRef = useRef(true)

  // Load current version on mount
  useEffect(() => {
    async function loadVersion() {
      try {
        const version = await invoke<string | null>("get_current_version").catch(() => null)
        setCurrentVersion(version ?? getCurrentVersion())
      } catch {
        setCurrentVersion(getCurrentVersion())
      }
    }
    void loadVersion()
  }, [])

  // Cleanup event listener on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
    }
  }, [])

  /** Tear down any active event listener so a fresh one can be registered. */
  const teardownListener = useCallback(() => {
    if (unlistenRef.current) {
      unlistenRef.current()
      unlistenRef.current = null
    }
  }, [])

  const cancelDownload = useCallback(async () => {
    try {
      await invoke("cancel_update_download")
    } catch {
      // If cancel fails, the download likely already completed
    }
  }, [])

  const handleCheckForUpdates = useCallback(async () => {
    setStatus({ type: "checking" })
    setApplyResult(null)

    try {
      const result = await invoke<{
        updateAvailable: boolean
        latestVersion: string
        downloadUrl: string
      }>("check_for_updates")

      if (result.updateAvailable && result.downloadUrl) {
        setStatus({
          type: "available",
          version: result.latestVersion,
          downloadUrl: result.downloadUrl,
        })
      } else {
        setStatus({ type: "uptodate" })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("__TAURI_INTERNALS__") || message.includes("not available") || message.includes("web browser")) {
        setStatus({ type: "unavailable" })
        return
      }
      setStatus({ type: "error", message })
    }
  }, [])

  const handleDownload = useCallback(async () => {
    if (status.type !== "available") return
    // Synchronous re-entrancy guard — set BEFORE any awaits so a second
    // synchronous click sees `true` and bails out immediately.
    if (downloadInFlightRef.current) return
    downloadInFlightRef.current = true

    const downloadUrl = status.downloadUrl

    // Tear down any stale listener from a previous download attempt
    teardownListener()

    setStatus({
      type: "downloading",
      progress: {
        downloadedBytes: 0,
        totalBytes: 0,
        speedBytesPerSec: 0,
        percentage: 0,
        status: "downloading",
      },
    })

    try {
      // Listen for progress events (only updates UI; completion is handled by invoke return)
      const unlisten = await listen<DownloadProgress>("download-progress", (event) => {
        const payload = event.payload

        if (payload.status === "completed") {
          // filePath not available in event payload; rely on invoke return below
          // Do not transition to completed here — the invoke return will do it with the real path
        } else if (payload.status === "error") {
          teardownListener()
          setStatus({ type: "error", message: payload.error ?? "Download failed" })
        } else if (payload.status === "cancelled") {
          teardownListener()
          setStatus({ type: "idle" })
        } else {
          setStatus({ type: "downloading", progress: payload })
        }
      })

      // If the component unmounted during the await above, immediately
      // release the listener we just registered so the Tauri event channel
      // doesn't keep firing setStatus into a dead component.
      if (!mountedRef.current) {
        unlisten()
        return
      }
      unlistenRef.current = unlisten

      // Start the download — this is the authoritative completion path
      const filePath = await invoke<string>("start_update_download", {
        url: downloadUrl,
      })

      // Clean up the listener since download is done
      teardownListener()
      setStatus({ type: "completed", filePath })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("cancelled")) {
        teardownListener()
        setStatus({ type: "idle" })
        return
      }
      teardownListener()
      setStatus({ type: "error", message })
    } finally {
      // Always release the lock so retry / new download attempts can proceed.
      downloadInFlightRef.current = false
    }
  }, [status, teardownListener])

  const handleApplyUpdate = useCallback(async () => {
    if (status.type !== "completed") return

    setApplying(true)
    setApplyResult(null)

    try {
      const result = await invoke<{ success: boolean; message: string }>("apply_update", {
        path: status.filePath,
      })
      setApplyResult(result.message)
      if (result.success) {
        setStatus({ type: "idle" })
        onUpdateApplied?.()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setApplyResult(message)
    } finally {
      setApplying(false)
    }
  }, [onUpdateApplied, status])

  const handleRetry = useCallback(() => {
    setApplyResult(null)
    setStatus({ type: "idle" })
  }, [])

  return (
    <div className="space-y-4">
      {/* Current Version */}
      {status.type !== "unavailable" && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-medium text-foreground">{t("shell.settingsAboutVersion", "الإصدار")}</h4>
            <p className="text-sm text-muted-foreground">{currentVersion ?? "..."}</p>
          </div>
        </div>
      )}

      {/* Check for Updates Button (idle) */}
      {status.type === "idle" && (
        <Button type="button" variant="outline" onClick={handleCheckForUpdates}>
          {t("shell.settingsAboutCheckForUpdates", "التحقق من وجود تحديثات")}
        </Button>
      )}

      {/* Checking */}
      {status.type === "checking" && (
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">
            {t("shell.settingsAboutChecking", "جارٍ التحقق...")}
          </span>
        </div>
      )}

      {/* Up-to-date */}
      {status.type === "uptodate" && (
        <p className="text-sm text-green-600 dark:text-green-400">
          {t("shell.settingsAboutUpToDate", "أنت تستخدم أحدث إصدار")}
        </p>
      )}

      {/* Unavailable (browser mode) */}
      {status.type === "unavailable" && (
        <p className="text-sm text-muted-foreground">
          {t("shell.settingsAboutNoUpdates", "لا توجد تحديثات متاحة")}
        </p>
      )}

      {/* Update Available */}
      {status.type === "available" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              {t("shell.settingsAboutUpdateAvailable", "تحديث متاح:")}{" "}
              <span className="font-semibold text-primary">{status.version}</span>
            </p>
          </div>
          <Button type="button" disabled={status.type !== "available"} onClick={handleDownload}>
            {t("shell.settingsAboutDownload", "تنزيل التحديث")}
          </Button>
        </div>
      )}

      {/* Downloading */}
      {status.type === "downloading" && (
        <div className="space-y-3">
          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("shell.settingsAboutProgress", "التقدم")}
              </span>
              <span className="font-medium tabular-nums text-foreground">
                {status.progress.percentage.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(status.progress.percentage, 100)}%` }}
              />
            </div>
          </div>

          {/* Speed and Bytes */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {formatBytes(status.progress.downloadedBytes)}
              {status.progress.totalBytes > 0
                ? ` / ${formatBytes(status.progress.totalBytes)}`
                : ""}
            </span>
            {status.progress.speedBytesPerSec > 0 && (
              <span>
                {t("shell.settingsAboutSpeed", "السرعة")}:{" "}
                {formatSpeed(status.progress.speedBytesPerSec)}
              </span>
            )}
          </div>

          {/* Cancel Button */}
          <Button type="button" variant="outline" onClick={cancelDownload}>
            {t("shell.settingsAboutCancel", "إلغاء")}
          </Button>
        </div>
      )}

      {/* Completed */}
      {status.type === "completed" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              {t("shell.settingsAboutDownloadComplete", "تم التنزيل بنجاح")}
            </p>
          </div>
          <Button
            type="button"
            disabled={applying}
            onClick={handleApplyUpdate}
          >
            {applying
              ? t("shell.settingsAboutApplying", "جارٍ التطبيق...")
              : t("shell.settingsAboutApply", "تطبيق التحديث")}
          </Button>
          {applyResult && (
            <p className="text-sm text-muted-foreground">{applyResult}</p>
          )}
        </div>
      )}

      {/* Error */}
      {status.type === "error" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950">
            <p className="text-sm text-red-600 dark:text-red-400">
              {t("shell.settingsAboutError", "فشل التحديث")}: {status.message}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={handleRetry}>
            {t("shell.settingsAboutRetry", "إعادة المحاولة")}
          </Button>
        </div>
      )}
    </div>
  )
}
