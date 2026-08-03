import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { rpcClient } from "@/lib/orpc-client"

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
  })
}
