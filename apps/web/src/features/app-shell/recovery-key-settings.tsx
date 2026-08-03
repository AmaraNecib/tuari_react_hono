/**
 * RecoveryKeySettings — connected Settings UI for recovery key management.
 *
 * Wires the presentational `SecuritySection` to the recovery-key RPC
 * procedures and surfaces the plain-text keys exactly once after
 * generation (matching the documented "shown once, then masked" behavior).
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import {
  useChangeDbEncryptionKeyMutation,
  useGenerateRecoveryKeysMutation,
  useRecoveryKeyPoolQuery,
  useRevokeRecoveryKeyMutation,
} from "./recovery-key-hooks"
import { SecuritySection } from "./security-section"

type GeneratedRecoveryKey = { key: string; prefix: string; createdAt: string }

/**
 * Renders the recovery keys + DB encryption key surfaces with live data.
 * The plain-text keys from the latest generation are shown once in a
 * dialog; closing it discards them for good (only masked rows remain).
 */
export function RecoveryKeySettings() {
  const { t } = useTranslation()
  const poolQuery = useRecoveryKeyPoolQuery()
  const generateMutation = useGenerateRecoveryKeysMutation()
  const revokeMutation = useRevokeRecoveryKeyMutation()
  const changeDbKeyMutation = useChangeDbEncryptionKeyMutation()
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedRecoveryKey[] | null>(null)

  async function handleGenerateKeys() {
    const generated = await generateMutation.mutateAsync()
    setGeneratedKeys(generated)
  }

  return (
    <>
      <SecuritySection
        poolStatus={poolQuery.data ?? null}
        isLoadingPool={poolQuery.isLoading}
        onGenerateKeys={handleGenerateKeys}
        onRevokeKey={async (keyId) => {
          await revokeMutation.mutateAsync(keyId)
        }}
        onChangeDbKey={async (input) => changeDbKeyMutation.mutateAsync(input)}
        isGenerating={generateMutation.isPending}
        isRevoking={revokeMutation.isPending}
        isChangingKey={changeDbKeyMutation.isPending}
      />

      {/* Plain-text keys are shown exactly once after generation. */}
      <Dialog
        open={generatedKeys !== null}
        onOpenChange={(open) => {
          if (!open) setGeneratedKeys(null)
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("shell.settingsSecurityGeneratedKeysTitle")}</DialogTitle>
            <DialogDescription>
              {t("shell.settingsSecurityGeneratedKeysDescription")}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {generatedKeys?.map((key) => (
              <li key={key.key}>
                <code
                  dir="ltr"
                  className="block rounded-md border border-line bg-surface-2 px-3 py-2 text-center font-mono text-sm"
                >
                  {key.key}
                </code>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setGeneratedKeys(null)}>
              {t("shell.settingsSecurityGeneratedKeysSaved")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
