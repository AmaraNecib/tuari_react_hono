import { useMutation, useQueryClient } from "@tanstack/react-query"
import { phonePasswordSignInSchema, type PhonePasswordSignInInput } from "@tuari/contracts"

import { i18n } from "@/i18n"
import { authClient } from "@/lib/auth-client"
import { extractAuthErrorMessage, signInDesktopWithPhoneNumber } from "@/lib/auth-api"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { orpc } from "@/lib/orpc-client"
import { showErrorToast } from "@/lib/toast"

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

      const result = await authClient.signIn.phoneNumber({
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
      await queryClient.invalidateQueries({ queryKey: orpc.session.key() })
    },
    onError: (error) => {
      showErrorToast(extractAuthErrorMessage(error, i18n.t("toasts.signInError")))
    },
  })
}
