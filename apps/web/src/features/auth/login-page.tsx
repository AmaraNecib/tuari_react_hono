/**
 * Dedicated login page for the application.
 */
import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Field } from "@/components/ui/field"

type LoginPageProps = {
  onSignIn: (phone: string, password: string) => Promise<void>
  isLoading?: boolean
  error?: string
}

/**
 * @description Component
 */
export function LoginPage({ onSignIn, isLoading, error }: LoginPageProps) {
  const { t } = useTranslation()
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{
    phone?: string
    password?: string
  }>({})

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldErrors({})

    const trimmedPhone = phone.trim()
    const trimmedPassword = password.trim()

    const errors: typeof fieldErrors = {}
    if (!trimmedPhone) {
      errors.phone = t("auth.errors.phoneRequired")
    } else if (!/^0(5|6|7)\d{8}$/.test(trimmedPhone)) {
      errors.phone = t("auth.errors.phoneInvalid")
    }

    if (!trimmedPassword) {
      errors.password = t("auth.errors.passwordRequired")
    } else if (trimmedPassword.length < 8) {
      errors.password = t("auth.errors.passwordTooShort")
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    try {
      await onSignIn(trimmedPhone, trimmedPassword)
    } catch (err) {
      const message = err instanceof Error ? err.message : t("auth.errors.invalidCredentials", "بيانات الدخول غير صحيحة")
      if (message.includes("phone") || message.includes("الهاتف")) {
        setFieldErrors({ phone: message })
      } else {
        setFieldErrors({ password: message })
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-ink text-bg text-2xl font-display italic mb-4">
            ط
          </div>
          <h1 className="text-3xl font-semibold text-foreground">
            {t("auth.loginTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("auth.description")}
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-surface border border-line rounded-xl p-6 space-y-6">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-bad-soft text-bad text-sm">
                {error}
              </div>
            )}

            <Field label={t("auth.phoneLabel")} error={fieldErrors.phone}>
              <Input
                type="tel"
                inputMode="tel"
                placeholder="0612345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
              />
            </Field>

            <Field label={t("auth.passwordLabel")} error={fieldErrors.password}>
              <PasswordInput
                placeholder={t("auth.passwordPlaceholder")}
                hideLabel={t("auth.hidePassword")}
                showLabel={t("auth.showPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading
                ? t("auth.loading")
                : t("auth.signIn")}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          {t("auth.footer")}
        </p>
      </div>
    </div>
  )
}
