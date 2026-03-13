import { useMutation, useQueryClient } from "@tanstack/react-query"
import { phonePasswordSignInSchema, type PhonePasswordSignInInput } from "@tuari/contracts"

import { authClient } from "@/lib/auth-client"
import { orpc } from "@/lib/orpc-client"

export function usePhoneSignInMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["auth", "sign-in", "phone"],
    mutationFn: async (rawInput: PhonePasswordSignInInput) => {
      const input = phonePasswordSignInSchema.parse(rawInput)
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
      await queryClient.invalidateQueries({ queryKey: orpc.session.key() })
    },
  })
}
