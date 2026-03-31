import type { FormEventHandler } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Surface } from "@/features/shared/page-primitives"

import type { HomeViewCopy } from "./home-view-copy"

type FormErrors = {
  name?: string
  phone?: string
  password?: string
  setupSecret?: string
}

export function HomeViewAuthScreen({
  authError,
  authStartupError,
  bootstrapPending,
  copy,
  errors,
  isAuthStateLoading,
  isFirstRun,
  name,
  onBootstrapSubmit,
  onNameChange,
  onPasswordChange,
  onPhoneChange,
  onRetryAuthState,
  onSetupSecretChange,
  onSignInSubmit,
  password,
  phone,
  requiresSetupKey,
  setupSecret,
  passwordHideLabel,
  passwordShowLabel,
  signInPending,
}: {
  authError: string | null
  authStartupError: Error | null
  bootstrapPending: boolean
  copy: Pick<HomeViewCopy, "auth" | "common" | "shell">
  errors: FormErrors
  isAuthStateLoading: boolean
  isFirstRun: boolean
  name: string
  onBootstrapSubmit: FormEventHandler<HTMLFormElement>
  onNameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onRetryAuthState: () => void
  onSetupSecretChange: (value: string) => void
  onSignInSubmit: FormEventHandler<HTMLFormElement>
  password: string
  passwordHideLabel: string
  passwordShowLabel: string
  phone: string
  requiresSetupKey: boolean
  setupSecret: string
  signInPending: boolean
}) {
  if (isAuthStateLoading) {
    return (
      <main className="flex h-screen items-center justify-center overflow-y-auto px-6 py-8" dir="rtl">
        <Surface className="surface-auth w-full max-w-lg p-8 text-center lg:p-10">
          <p className="text-sm text-muted-foreground">{copy.common.loadingAuth}</p>
        </Surface>
      </main>
    )
  }

  if (authStartupError) {
    return (
      <main className="flex h-screen items-center justify-center overflow-y-auto px-6 py-8" dir="rtl">
        <Surface className="surface-auth w-full max-w-lg p-8 text-center lg:p-10">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{copy.auth.startupErrorTitle}</h1>
            <p className="text-sm leading-6 text-muted-foreground">{copy.auth.startupErrorDescription}</p>
          </div>

          <Button className="mt-6 h-11 w-full rounded-2xl text-base" type="button" variant="outline" onClick={onRetryAuthState}>
            {copy.common.retry}
          </Button>
        </Surface>
      </main>
    )
  }

  return (
    <main className="flex h-screen items-center justify-center overflow-y-auto px-6 py-8" dir="rtl">
      <Surface className="surface-auth w-full max-w-lg p-8 lg:p-10">
        <form className="space-y-7" onSubmit={isFirstRun ? onBootstrapSubmit : onSignInSubmit}>
          <div className="space-y-3 text-start">
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
              {isFirstRun ? copy.auth.setupTitle : copy.auth.loginTitle}
            </h1>
            <p className="text-sm leading-7 text-muted-foreground">{copy.shell.description}</p>
          </div>

          <div className="space-y-5">
            {isFirstRun ? (
              <label className="flex flex-col gap-2.5">
                <span className="text-sm font-medium text-foreground">{copy.auth.nameLabel}</span>
                <Input
                  autoComplete="name"
                  name="name"
                  placeholder={copy.auth.namePlaceholder}
                  value={name}
                  onChange={(event) => onNameChange(event.target.value)}
                />
                {errors.name ? <p className="text-sm text-destructive">{errors.name}</p> : null}
              </label>
            ) : null}

            <label className="flex flex-col gap-2.5">
              <span className="text-sm font-medium text-foreground">{copy.auth.phoneLabel}</span>
              <Input
                autoComplete="tel"
                dir="ltr"
                inputMode="tel"
                name="phone"
                placeholder={copy.auth.phonePlaceholder}
                value={phone}
                onChange={(event) => onPhoneChange(event.target.value)}
              />
              {errors.phone ? <p className="text-sm text-destructive">{errors.phone}</p> : null}
            </label>

            <label className="flex flex-col gap-2.5">
              <span className="text-sm font-medium text-foreground">{copy.auth.passwordLabel}</span>
              <PasswordInput
                autoComplete="current-password"
                hideLabel={passwordHideLabel}
                name="password"
                placeholder={copy.auth.passwordPlaceholder}
                showLabel={passwordShowLabel}
                value={password}
                dir="rtl"
                onChange={(event) => onPasswordChange(event.target.value)}
              />
              {errors.password ? <p className="text-sm text-destructive">{errors.password}</p> : null}
            </label>

            {isFirstRun && requiresSetupKey ? (
              <label className="flex flex-col gap-2.5">
                <span className="text-sm font-medium text-foreground">{copy.auth.setupSecretLabel}</span>
                <PasswordInput
                  autoComplete="off"
                  hideLabel={passwordHideLabel}
                  name="setup-secret"
                  placeholder={copy.auth.setupSecretPlaceholder}
                  showLabel={passwordShowLabel}
                  value={setupSecret}
                  dir="rtl"
                  onChange={(event) => onSetupSecretChange(event.target.value)}
                />
                {errors.setupSecret ? <p className="text-sm text-destructive">{errors.setupSecret}</p> : null}
              </label>
            ) : null}
          </div>

          <Button
            className="mt-2 h-12 w-full rounded-2xl text-base"
            disabled={signInPending || bootstrapPending}
            type="submit"
          >
            {signInPending || bootstrapPending ? copy.common.loading : isFirstRun ? copy.auth.createFirstUser : copy.auth.signIn}
          </Button>
          {authError ? <p className="text-center text-sm text-destructive">{authError}</p> : null}
        </form>
      </Surface>
    </main>
  )
}
