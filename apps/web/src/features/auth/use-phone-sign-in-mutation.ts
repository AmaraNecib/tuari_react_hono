import { ZodError } from "zod"
/**
 * Phone sign-in mutation hook.
 * Handles authentication with phone number and password.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { phonePasswordSignInSchema, type PhonePasswordSignInInput } from "@tuari/contracts"

import { i18n } from "@/i18n"
import { sessionQueryKey } from "@/features/app-shell/workspace-keys"
import { getAuthClient } from "@/lib/auth-client"
import { extractAuthErrorMessage, signInDesktopWithPhoneNumber } from "@/lib/auth-api"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { showErrorToast, showValidationToast } from "@/lib/toast"

/**
 * usePhoneSignInMutation() component.
 */
export function usePhoneSignInMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["auth", "sign-in", "phone"],
    mutationFn: async (rawInput: PhonePasswordSignInInput) => {
      const input = phonePasswordSignInSchema.parse(rawInput)

      if (isDesktopRuntime()) {
        return signInDesktopWithPhoneNumber({
          phoneNumber: input.phone,
          password: input.password,
          rememberMe: input.rememberMe,
        })
      }

      const result = await getAuthClient().signIn.phoneNumber({
        phoneNumber: input.phone,
        password: input.password,
        rememberMe: input.rememberMe,
      })

      if (result.error) {
        throw result.error
      }

      return result.data
    },
    onSuccess: async () => {
      await queryClient.removeQueries({ queryKey: ["phase1", "workspace"] })
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
    },
    onError: (error) => {
      if (error instanceof ZodError) { showValidationToast(i18n.t("auth.errors.invalidCredentials")); return }
      showErrorToast(extractAuthErrorMessage(error, i18n.t("toasts.signInError")))
    },
  })
}
