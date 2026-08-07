import { useState, type FormEvent } from "react"

import { extractAuthErrorMessage } from "@/lib/auth-api"

import { mapBootstrapErrors, mapCredentialErrors } from "./home-view-auth-utils"
import type { HomeViewCopy } from "./home-view-copy"
import type { FormErrors } from "./home-view-types"
import type {
  useAuthSetupStatusQuery,
  useBootstrapFirstUserMutation,
  useDemoSessionQuery,
  useDemoSignInMutation,
} from "./workspace-mutations"

type SetupStatusQuery = ReturnType<typeof useAuthSetupStatusQuery>
type SessionQuery = ReturnType<typeof useDemoSessionQuery>
type BootstrapMutation = ReturnType<typeof useBootstrapFirstUserMutation>
type SignInMutation = ReturnType<typeof useDemoSignInMutation>

/** Manages auth state: login, bootstrap, error handling. */
export function useHomeViewAuthController({
  bootstrapMutation,
  copy,
  sessionQuery,
  setupStatusQuery,
  signInMutation,
}: {
  bootstrapMutation: BootstrapMutation
  copy: HomeViewCopy
  sessionQuery: SessionQuery
  setupStatusQuery: SetupStatusQuery
  signInMutation: SignInMutation
}) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [setupSecret, setSetupSecret] = useState("")
  const [errors, setErrors] = useState<FormErrors>({})
  const [authError, setAuthError] = useState<string | null>(null)

  const setupStatus = setupStatusQuery.data
  const session = sessionQuery.data
  const hasUsers = setupStatus?.hasUsers ?? false
  const requiresSetupKey = setupStatus?.requiresSetupKey ?? false
  const authStartupError = setupStatusQuery.error ?? sessionQuery.error ?? null
  const isAuthStateLoading = (!setupStatus && !authStartupError) || sessionQuery.isPending
  const isFirstRun = !session && !hasUsers

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (signInMutation.isPending || bootstrapMutation.isPending) {
      return
    }

    const nextErrors = mapCredentialErrors(copy, phone, password)
    setErrors(nextErrors)
    setAuthError(null)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    try {
      await signInMutation.mutateAsync({
        phone: phone.trim(),
        password,
      })
      setPassword("")
    } catch (error) {
      setAuthError(extractAuthErrorMessage(error, copy.auth.signInError))
    }
  }

  async function handleBootstrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (bootstrapMutation.isPending || signInMutation.isPending) {
      return
    }

    const nextErrors = mapBootstrapErrors(copy, name, phone, password, setupSecret, requiresSetupKey)
    setErrors(nextErrors)
    setAuthError(null)

    if (Object.values(nextErrors).some(Boolean)) {
      return
    }

    try {
      await bootstrapMutation.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        password,
        setupSecret: setupSecret.trim() || undefined,
      })
    } catch (error) {
      setAuthError(extractAuthErrorMessage(error, copy.auth.bootstrapError))
      return
    }

    setName("")
    setSetupSecret("")

    await Promise.all([setupStatusQuery.refetch(), sessionQuery.refetch()])

    try {
      await signInMutation.mutateAsync({
        phone: phone.trim(),
        password,
      })
      setPassword("")
    } catch (error) {
      setPassword("")
      setAuthError(extractAuthErrorMessage(error, copy.auth.bootstrapSignInError))
    }
  }

  async function retryAuthState() {
    await Promise.all([setupStatusQuery.refetch(), sessionQuery.refetch()])
  }

  return {
    authError,
    authStartupError,
    errors,
    handleBootstrap,
    handleSignIn,
    isAuthStateLoading,
    isFirstRun,
    name,
    password,
    phone,
    requiresSetupKey,
    retryAuthState,
    session,
    setName,
    setPassword,
    setPhone,
    setSetupSecret,
    setupSecret,
  }
}
