import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Surface, SurfaceHeader } from "@/features/shared/page-primitives"

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
      if (message.includes("كلمة المرور الحالية غير صحيحة") || message.toLowerCase().includes("invalid password")) {
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
        <Surface as="article" className="p-5 xl:col-span-2">
          <form className="space-y-5" onSubmit={(event) => void handleSave(event)}>
            <SurfaceHeader description={accountDescription} title={accountTitle} />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{accountNameLabel}</span>
                <Input placeholder={accountNamePlaceholder} value={name} onChange={(event) => setName(event.target.value)} />
                {fieldErrors.name ? <span className="text-xs leading-5 text-destructive">{fieldErrors.name}</span> : null}
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{accountPhoneLabel}</span>
                <Input
                  dir="ltr"
                  inputMode="tel"
                  placeholder={accountPhonePlaceholder}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
                <span className="text-xs leading-5 text-muted-foreground">{accountPhoneHint}</span>
                {fieldErrors.phone ? <span className="text-xs leading-5 text-destructive">{fieldErrors.phone}</span> : null}
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{accountCurrentPasswordLabel}</span>
                <PasswordInput
                  hideLabel={passwordHideLabel}
                  placeholder={accountCurrentPasswordPlaceholder}
                  showLabel={passwordShowLabel}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
                {fieldErrors.currentPassword ? <span className="text-xs leading-5 text-destructive">{fieldErrors.currentPassword}</span> : null}
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{accountNewPasswordLabel}</span>
                <PasswordInput
                  hideLabel={passwordHideLabel}
                  placeholder={accountNewPasswordPlaceholder}
                  showLabel={passwordShowLabel}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                {fieldErrors.newPassword ? <span className="text-xs leading-5 text-destructive">{fieldErrors.newPassword}</span> : null}
              </label>
            </div>
            <div className="flex justify-start" dir="rtl">
              <Button disabled={isSavingAccount} type="submit">
                {isSavingAccount ? accountSavingLabel : accountSaveLabel}
              </Button>
            </div>
          </form>
        </Surface>
        <Surface as="article" className="p-5" variant="card">
          <div className="flex items-start justify-between gap-4" dir="rtl">
            <div className="text-start">
              <h3 className="text-lg font-semibold text-foreground">{themeLabel}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{themeDescription}</p>
            </div>
            <Button type="button" variant="outline" onClick={onToggleTheme}>
              {themeValueLabel}
            </Button>
          </div>
        </Surface>
        <Surface as="article" className="p-5" variant="card">
          <div className="flex items-start justify-between gap-4" dir="rtl">
            <div className="text-start">
              <h3 className="text-lg font-semibold text-foreground">{resetLabel}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{resetDescription}</p>
            </div>
            <Button disabled={isResetPending} type="button" variant="outline" onClick={onReset}>
              {resetLabel}
            </Button>
          </div>
        </Surface>
      </div>
    </RecordPageFrame>
  )
}
