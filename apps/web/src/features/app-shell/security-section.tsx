/**
 * SecuritySection — Settings UI for recovery key management.
 *
 * Displays masked recovery keys, allows generating new keys,
 * revoking keys, and changing the DB encryption key.
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { Surface, SurfaceHeader } from "@/features/shared/page-primitives"

type RecoveryKey = {
  id: string
  prefix: string
  status: "AVAILABLE" | "CONSUMED" | "REVOKED"
}

type SecuritySectionProps = {
  /** Current recovery key pool status. */
  poolStatus: {
    availableCount: number
    totalCount: number
    maxPoolSize: number
    maskedKeys: RecoveryKey[]
  } | null
  /** Whether the pool status is loading. */
  isLoadingPool: boolean
  /** Callback to generate new recovery keys. */
  onGenerateKeys: () => Promise<void>
  /** Callback to revoke a recovery key. */
  onRevokeKey: (keyId: string) => Promise<void>
  /** Callback to change the DB encryption key. */
  onChangeDbKey: (input: { currentKey: string; newKey: string }) => Promise<{ success: boolean; error?: string }>
  /** Whether keys are being generated. */
  isGenerating: boolean
  /** Whether a key is being revoked. */
  isRevoking: boolean
  /** Whether the DB key is being changed. */
  isChangingKey: boolean
}

/**
 * Security section for the Settings page.
 * Manages recovery keys and DB encryption key.
 */
/**
 * @description Component
 */
export function SecuritySection({
  poolStatus,
  isLoadingPool,
  onGenerateKeys,
  onRevokeKey,
  onChangeDbKey,
  isGenerating,
  isRevoking,
  isChangingKey,
}: SecuritySectionProps) {
  const { t } = useTranslation()
  const [currentKey, setCurrentKey] = useState("")
  const [newKey, setNewKey] = useState("")
  const [keyError, setKeyError] = useState<string | null>(null)
  const [keySuccess, setKeySuccess] = useState(false)

  // Reset form when key change completes
  useEffect(() => {
    if (!isChangingKey && keySuccess) {
      setCurrentKey("")
      setNewKey("")
    }
  }, [isChangingKey, keySuccess])

  /** Handle DB encryption key change with validation. */
  async function handleChangeKey() {
    setKeyError(null)
    setKeySuccess(false)

    const trimmedCurrent = currentKey.trim()
    const trimmedNew = newKey.trim()

    if (!trimmedCurrent) {
      setKeyError(t("settingsSecurityCurrentKeyPlaceholder"))
      return
    }
    if (trimmedNew.length < 8) {
      setKeyError(t("settingsSecurityNewKeyPlaceholder"))
      return
    }

    try {
      const result = await onChangeDbKey({ currentKey: trimmedCurrent, newKey: trimmedNew })
      if (result.success) {
        setKeySuccess(true)
      } else {
        setKeyError(result.error ?? t("settingsSecurityChangeKeyError"))
      }
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : t("settingsSecurityChangeKeyError"))
    }
  }

  /** Get localized status label for a recovery key. */
  function getStatusLabel(status: RecoveryKey["status"]): string {
    switch (status) {
      case "AVAILABLE": return t("settingsSecurityStatusAvailable")
      case "CONSUMED": return t("settingsSecurityStatusConsumed")
      case "REVOKED": return t("settingsSecurityStatusRevoked")
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {/* Recovery Keys */}
      <Surface as="article" className="p-5 xl:col-span-2">
        <SurfaceHeader
          description={t("settingsSecurityRecoveryKeysDescription")}
          title={t("settingsSecurityRecoveryKeysTitle")}
        />

        {isLoadingPool ? (
          <p className="text-sm text-muted-foreground">{t("settingsSecurityLoading")}</p>
        ) : poolStatus ? (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <span>{t("settingsSecurityAvailableCount")}: <strong>{poolStatus.availableCount}</strong></span>
              <span>{t("settingsSecurityMaxPool")}: <strong>{poolStatus.maxPoolSize}</strong></span>
            </div>

            {poolStatus.maskedKeys.length > 0 && (
              <div className="space-y-2">
                {poolStatus.maskedKeys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-3">
                      <code className="font-mono text-sm">{key.prefix}-****-****</code>
                      <span className="text-xs text-muted-foreground">{getStatusLabel(key.status)}</span>
                    </div>
                    {key.status === "AVAILABLE" && (
                      <Button
                        disabled={isRevoking}
                        size="sm"
                        variant="outline"
                        onClick={() => void onRevokeKey(key.id)}
                      >
                        {t("settingsSecurityRevokeKey")}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button
              disabled={isGenerating || poolStatus.availableCount >= poolStatus.maxPoolSize}
              onClick={() => void onGenerateKeys()}
            >
              {isGenerating ? t("settingsSecurityGeneratingKeys") : t("settingsSecurityGenerateKeys")}
            </Button>
          </div>
        ) : null}
      </Surface>

      {/* DB Encryption Key */}
      <Surface as="article" className="p-5 xl:col-span-2">
        <SurfaceHeader
          description={t("settingsSecurityDbKeyDescription")}
          title={t("settingsSecurityDbKeyTitle")}
        />

        <div className="space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("settingsSecurityCurrentKey")}</span>
            <PasswordInput
              hideLabel={t("settingsSecurityPasswordHide")}
              showLabel={t("settingsSecurityPasswordShow")}
              placeholder={t("settingsSecurityCurrentKeyPlaceholder")}
              value={currentKey}
              onChange={(e) => setCurrentKey(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("settingsSecurityNewKey")}</span>
            <PasswordInput
              hideLabel={t("settingsSecurityPasswordHide")}
              showLabel={t("settingsSecurityPasswordShow")}
              placeholder={t("settingsSecurityNewKeyPlaceholder")}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
          </label>

          {keyError && <p className="text-xs text-destructive">{keyError}</p>}
          {keySuccess && <p className="text-xs text-green-600">{t("settingsSecurityChangeKeySuccess")}</p>}

          <Button
            disabled={isChangingKey || !currentKey.trim() || newKey.trim().length < 8}
            onClick={() => void handleChangeKey()}
          >
            {isChangingKey ? t("settingsSecurityChangingKey") : t("settingsSecurityChangeKey")}
          </Button>
        </div>
      </Surface>
    </div>
  )
}
