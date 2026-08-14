import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { i18n } from "@/i18n"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { getDesktopBridgeFailurePhase, DESKTOP_BRIDGE_FAILURE_PHASE } from "@/lib/desktop-api-bridge"
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
 * Ask the desktop host to accept the rotated key as final (the rekey
 * succeeded or its outcome is unknown) — clears the rollback slot without
 * restoring, so the original key is intentionally dropped.
 */
async function invokeCompleteDbKeyRotation(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core")
  await invoke("complete_db_key_rotation")
}

/**
 * True only when a thrown RPC error PROVES the database was not re-encrypted:
 * the native bridge explicitly marked the request as pre-delivery, or the
 * server rejected it with a client error (status < 500 — validation/auth ran
 * before the handler). Every other thrown error is unknown: a response-body
 * read can fail after the API has rekeyed, and an unmarked bridge/transport
 * error does not prove that the request was never delivered.
 */
function rpcFailureProvesNoRekey(error: unknown): boolean {
  const bridgePhase = getDesktopBridgeFailurePhase(error)
  if (bridgePhase !== undefined) {
    return bridgePhase === DESKTOP_BRIDGE_FAILURE_PHASE.PRE_DELIVERY
  }

  if (typeof error !== "object" || error === null) return false
  const candidate = error as { code?: unknown; status?: unknown }
  if (typeof candidate.code !== "string" || typeof candidate.status !== "number") {
    return false
  }
  const status = candidate.status
  return status >= 400 && status < 500 && status !== 408 && status !== 499
}

/**
 * Change the DB encryption key (no-op on the unencrypted web dev DB).
 *
 * On the desktop runtime the key lives in the host's secret store, so the
 * flow rotates the persisted key FIRST (atomic), then calls the API rekey
 * RPC, and rolls the rotation back when the API DEFINITIVELY did not rekey.
 *
 * Failure outcomes are tri-state (issue #265, Greptile P1):
 * - `rekeyed: true` — the DB WAS re-encrypted (only key persistence failed);
 *   keep the new key and acknowledge the rotation.
 * - `rekeyed: false` (no `ambiguous`) — the API DEFINITIVELY did not rekey;
 *   restore the original key so the keyring and the database agree.
 * - `ambiguous: true` — the rekey ran server-side but its verification could
 *   not complete (transient probe failure). The DB is LIKELY on the new key:
 *   keep the new key (restoring would orphan the re-encrypted database) AND
 *   keep the rollback slot (do NOT clear it) so a later re-verification can
 *   still restore if it proves definitive. The returned result surfaces the
 *   honest "rekey applied but verification pending" state.
 * - The native bridge marks a request as pre-delivery, or the server rejects
 *   it with a client error (< 500): the database was DEFINITELY not
 *   re-encrypted — restore the original key so the keyring and the database
 *   agree. A pre-delivery failure must never complete the rotation: dropping
 *   the only old-key rollback slot while the database still requires the old
 *   key breaks the next startup.
 * - The bridge marks a response-body read failure, a 5xx server error, or any
 *   other unclassified thrown error: keep the new key AND the rollback slot
 *   (neither restore nor complete) — the outcome stays pending, same as the
 *   server-side `ambiguous: true` state, for a same-session
 *   retry/re-verification.
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
            if (result.rekeyed) {
              // The database WAS re-encrypted (only key persistence failed) —
              // keep the new key; rolling the keyring back would orphan the
              // re-encrypted database on the next restart.
              await invokeCompleteDbKeyRotation().catch(() => {})
            } else if (result.ambiguous) {
              // AMBIGUOUS (Greptile P1): the rekey ran but the post-rekey
              // verification could not complete (transient/system probe
              // failure). The database is LIKELY on the new key — restoring
              // the old key would orphan it on the next startup. Keep the
              // new key AND keep the rollback slot (neither restore nor
              // complete): the returned result surfaces the honest "rekey
              // applied but verification pending" state, and the retained
              // slot lets a later re-verification still restore if it
              // proves definitive.
            } else {
              // The API definitively did NOT re-encrypt — put the original
              // key back so the keyring and the database agree.
              await invokeRestoreDbKey().catch(() => {})
            }
            return result
          }
          // Rekey confirmed — the new key is final.
          await invokeCompleteDbKeyRotation().catch(() => {})
          return result
        } catch (error) {
          // Restore only when the error explicitly proves that the database
          // was not rekeyed. The desktop bridge marks a connection failure as
          // pre-delivery and a response-body read failure as post-delivery;
          // all unclassified errors fail closed to the pending state so a
          // rekeyed database is never orphaned.
          if (rpcFailureProvesNoRekey(error)) {
            await invokeRestoreDbKey().catch(() => {})
          }
          throw error
        }
      }
      return rpcClient.changeDbEncryptionKey(input)
    },
  })
}
