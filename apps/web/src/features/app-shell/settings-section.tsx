import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Field } from "@/components/ui/field"
import { SurfaceHeader } from "@/features/shared/page-primitives"

import { RecordPageFrame } from "@/features/shared/record-page-frame"

type SettingsSectionProps = {
  accountCurrentPasswordLabel: string
  accountCurrentPasswordPlaceholder: string
  accountDescription: string
  accountNameLabel: string
  accountNamePlaceholder: string
  accountNewPasswordLabel: string
  accountNewPasswordPlaceholder: string
  accountPhoneLabel: string
  accountPhoneHint: string
  accountPhonePlaceholder: string
  accountSaveLabel: string
  accountSavingLabel: string
  accountTitle: string
  currentName: string
  currentPhone: string
  isResetPending: boolean
  isSavingAccount: boolean
  resetDescription: string
  resetLabel: string
  themeDescription: string
  themeLabel: string
  themeValueLabel: string
  title: string
  passwordHideLabel: string
  passwordShowLabel: string
  onSaveAccount: (input: {
    currentPassword?: string
    name?: string
    newPassword?: string
    phone?: string
  }) => Promise<void>
  onReset: () => void
  onToggleTheme: () => void
}

/** Settings section with account, theme, and security. */
export function SettingsSection({
  accountCurrentPasswordLabel,
  accountCurrentPasswordPlaceholder,
  accountDescription,
  accountNameLabel,
  accountNamePlaceholder,
  accountNewPasswordLabel,
  accountNewPasswordPlaceholder,
  accountPhoneLabel,
  accountPhoneHint,
  accountPhonePlaceholder,
  accountSaveLabel,
  accountSavingLabel,
  accountTitle,
  currentName,
  currentPhone,
  isResetPending,
  isSavingAccount,
  resetDescription,
  resetLabel,
  themeDescription,
  themeLabel,
  themeValueLabel,
  title,
  passwordHideLabel,
  passwordShowLabel,
  onSaveAccount,
  onReset,
  onToggleTheme,
}: SettingsSectionProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(currentName)
  const [phone, setPhone] = useState(currentPhone)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{
    currentPassword?: string
    name?: string
    newPassword?: string
    phone?: string
  }>({})

  useEffect(() => {
    setName(currentName)
    setPhone(currentPhone)
  }, [currentName, currentPhone])

  async function handleSave(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()

    const nextErrors: typeof fieldErrors = {}
    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()
    const trimmedCurrentPassword = currentPassword.trim()
    const trimmedNewPassword = newPassword.trim()
    const hasNameChanged = trimmedName !== currentName.trim()
    const hasPhoneChanged = trimmedPhone !== currentPhone.trim()
    const hasPasswordChange = trimmedCurrentPassword.length > 0 || trimmedNewPassword.length > 0

    if (!hasNameChanged && !hasPhoneChanged && !hasPasswordChange) {
      nextErrors.name = t("toasts.accountNoChanges")
    }

    if (trimmedPhone.length > 0 && !/^0(5|6|7)\d{8}$/.test(trimmedPhone)) {
      nextErrors.phone = t("toasts.accountPhoneInvalid")
    }

    if (hasPasswordChange || hasPhoneChanged) {
      if (trimmedCurrentPassword.length === 0) {
        nextErrors.currentPassword = t("toasts.accountPasswordCurrentRequiredForSensitiveChanges")
      }
    }

    if (hasPasswordChange) {
      if (trimmedNewPassword.length === 0) {
        nextErrors.newPassword = t("toasts.accountPasswordNewRequired")
      } else if (trimmedNewPassword.length < 8 || trimmedNewPassword.length > 128) {
        nextErrors.newPassword = t("toasts.accountPasswordTooShort")
      }
    }

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    try {
      await onSaveAccount({
        currentPassword: trimmedCurrentPassword || undefined,
        name: hasNameChanged ? trimmedName : undefined,
        newPassword: trimmedNewPassword || undefined,
        phone: hasPhoneChanged ? trimmedPhone : undefined,
      })
      setCurrentPassword("")
      setNewPassword("")
      setFieldErrors({})
    } catch (error) {
      const message = error instanceof Error ? error.message : t("toasts.actionError")
      if (message.includes(t("auth.errors.invalidPassword", "كلمة المرور الحالية غير صحيحة")) || message.toLowerCase().includes("invalid password")) {
        setFieldErrors({ currentPassword: t("toasts.accountPasswordCurrentInvalid") })
        return
      }

      if (message.includes("رقم الهاتف")) {
        setFieldErrors({ phone: message })
        return
      }

      if (message.includes("كلمة المرور الجديدة")) {
        setFieldErrors({ newPassword: message })
        return
      }

      setFieldErrors({ name: message })
    }
  }

  return (
    <RecordPageFrame title={title}>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="p-5 xl:col-span-2">
          <form className="space-y-5" onSubmit={(event) => void handleSave(event)}>
            <SurfaceHeader description={accountDescription} title={accountTitle} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={accountNameLabel} error={fieldErrors.name}>
                <Input placeholder={accountNamePlaceholder} value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label={accountPhoneLabel} error={fieldErrors.phone} hint={accountPhoneHint}>
                <Input
                  dir="ltr"
                  inputMode="tel"
                  placeholder={accountPhonePlaceholder}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </Field>
              <Field label={accountCurrentPasswordLabel} error={fieldErrors.currentPassword}>
                <PasswordInput
                  hideLabel={passwordHideLabel}
                  placeholder={accountCurrentPasswordPlaceholder}
                  showLabel={passwordShowLabel}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </Field>
              <Field label={accountNewPasswordLabel} error={fieldErrors.newPassword}>
                <PasswordInput
                  hideLabel={passwordHideLabel}
                  placeholder={accountNewPasswordPlaceholder}
                  showLabel={passwordShowLabel}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </Field>
            </div>
            <div className="flex justify-start" dir="rtl">
              <Button disabled={isSavingAccount} type="submit">
                {isSavingAccount ? accountSavingLabel : accountSaveLabel}
              </Button>
            </div>
          </form>
        </div>
        <div className="p-5 border border-line rounded-xl">
          <div className="flex items-start justify-between gap-4" dir="rtl">
            <div className="text-start">
              <h3 className="text-lg font-semibold text-foreground">{themeLabel}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{themeDescription}</p>
            </div>
            <Button type="button" variant="outline" onClick={onToggleTheme}>
              {themeValueLabel}
            </Button>
          </div>
        </div>
        <div className="p-5 border border-line rounded-xl">
          <div className="flex items-start justify-between gap-4" dir="rtl">
            <div className="text-start">
              <h3 className="text-lg font-semibold text-foreground">{resetLabel}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{resetDescription}</p>
            </div>
            <Button disabled={isResetPending} type="button" variant="outline" onClick={onReset}>
              {resetLabel}
            </Button>
          </div>
        </div>
      </div>
    </RecordPageFrame>
  )
}
