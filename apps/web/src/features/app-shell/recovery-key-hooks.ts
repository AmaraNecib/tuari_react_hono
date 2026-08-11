import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { i18n } from "@/i18n"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { rpcClient } from "@/lib/orpc-client"
import { showErrorToast } from "@/lib/toast"

/**
 * React Query integration for the recovery-key management surface.
 *
 * The pool status is a single source of truth for the Settings security
 * tab; every mutation invalidates it so the masked list and counts stay
 * in sync with the server.
 */

/** Query key for the recovery key pool status. */
export const recoveryKeyPoolQueryKey = ["recovery-key", "pool"] as const

/** Load the recovery key pool status (masked keys + counts). */
export function useRecoveryKeyPoolQuery() {
  return useQuery({
    queryKey: recoveryKeyPoolQueryKey,
    queryFn: () => rpcClient.getRecoveryKeyPool(),
  })
}

/** Generate a fresh batch of recovery keys (returns plain-text keys once). */
export function useGenerateRecoveryKeysMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["recovery-key", "generate"],
    mutationFn: async () => {
      const result = await rpcClient.generateRecoveryKeys()
      return result.keys
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recoveryKeyPoolQueryKey })
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

/** Revoke an available recovery key by id. */
export function useRevokeRecoveryKeyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["recovery-key", "revoke"],
    mutationFn: (keyId: string) => rpcClient.revokeRecoveryKey({ keyId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recoveryKeyPoolQueryKey })
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

/**
 * Ask the desktop host to rotate the persisted DB key (`app-db.key`) to the
 * new key BEFORE the API rekeys (issue #265). The Rust shell owns the key
 * store, so a successful rekey is durable across restarts.
 */
async function invokeRotateDbKey(newKey: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core")
  await invoke("rotate_db_key", { newKey })
}

/** Ask the desktop host to roll a DB key rotation back (rekey failed). */
async function invokeRestoreDbKey(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core")
  await invoke("restore_db_key")
}

/**
 * Change the DB encryption key (no-op on the unencrypted web dev DB).
 *
 * On the desktop runtime the key lives in the host's secret store, so the
 * flow rotates the persisted key FIRST (atomic), then calls the API rekey
 * RPC, and rolls the rotation back on any failure — the keyring must never
 * diverge from the key the database was actually re-encrypted with.
 */
export function useChangeDbEncryptionKeyMutation() {
  return useMutation({
    mutationKey: ["recovery-key", "change-db-key"],
    mutationFn: async (input: { currentKey: string; newKey: string }) => {
      if (isDesktopRuntime()) {
        await invokeRotateDbKey(input.newKey)
        try {
          const result = await rpcClient.changeDbEncryptionKey(input)
          if (!result.success) {
            // The DB was NOT re-encrypted — put the original key back.
            await invokeRestoreDbKey().catch(() => {})
          }
          return result
        } catch (error) {
          await invokeRestoreDbKey().catch(() => {})
          throw error
        }
      }
      return rpcClient.changeDbEncryptionKey(input)
    },
  })
}
