import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Field } from "@/components/ui/field"
import { SurfaceHeader } from "@/features/shared/page-primitives"
import { useUrlTab } from "@/hooks/use-url-state"

import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { UpdateSection } from "@/features/update/update-section"
import { useQueryClient } from "@tanstack/react-query"
import { LicenseSettings } from "@/features/license/license-settings"
import { licenseQueryKey } from "@/features/license/license-hooks"
import { ActivationPage } from "@/features/license/activation-page"
import { useLicenseActivation } from "@/features/license/use-license-activation"
import { useLicenseStatus } from "@/features/license/use-license-status"

import {
  getCurrentVersion,
  pickUpdateFile,
  applyUpdate,
  type UpdateApplyResult,
} from "./update-commands"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"

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
  settingsAboutTitle: string
  settingsAboutVersion: string
  settingsAboutInstallFromFile: string
  settingsAboutInstallFromFileDescription: string
  settingsUpdateVerifying: string
  settingsUpdateSuccess: string
  settingsUpdateError: string
  settingsAboutTab: string
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
/**
 * @description Component
 */
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
  settingsAboutTitle,
  settingsAboutVersion,
  settingsAboutInstallFromFile,
  settingsAboutInstallFromFileDescription,
  settingsUpdateVerifying,
  settingsUpdateSuccess,
  settingsUpdateError,
  settingsAboutTab,
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

  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [updateState, setUpdateState] = useState<{
    status: "idle" | "verifying" | "success" | "error"
    message: string
  }>({ status: "idle", message: "" })

  useEffect(() => {
    setName(currentName)
    setPhone(currentPhone)
  }, [currentName, currentPhone])

  useEffect(() => {
    void getCurrentVersion().then(setAppVersion)
  }, [])

  const handleInstallFromFile = useCallback(async () => {
    setUpdateState({ status: "idle", message: "" })

    const filePath = await pickUpdateFile()
    if (!filePath) {
      return
    }

    setUpdateState({ status: "verifying", message: "" })

    try {
      const result: UpdateApplyResult = await applyUpdate(filePath)
      setUpdateState({
        status: result.success ? "success" : "error",
        message: result.message,
      })
    } catch {
      setUpdateState({
        status: "error",
        message: t("shell.settingsUpdateError"),
      })
    }
  }, [t])

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

  const queryClient = useQueryClient()
  const licenseActivation = useLicenseActivation()
  const licenseStatus = useLicenseStatus()

  const [activeTab, setActiveTab] = useUrlTab(
    ['account', 'appearance', 'licensing', 'system', 'about'] as const,
    'account'
  )

  return (
    <RecordPageFrame title={title}>
      {/* Tabs */}
      <div className="flex gap-1 border-b border-line mb-6">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'account' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('account')}
        >
          {t('settings.tabs.account', 'معلومات الحساب')}
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'appearance' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('appearance')}
        >
          {t('settings.tabs.appearance', 'المظهر')}
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'licensing' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => {
            setActiveTab('licensing')
            licenseActivation.reset()
          }}
        >
          {t('settings.tabs.licensing', 'الترخيص')}
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'system' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('system')}
        >
          {t('settings.tabs.system', 'النظام')}
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'about' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('about')}
        >
          {settingsAboutTab}
        </button>
      </div>

      {/* Account Tab */}
      {activeTab === 'account' && (
        <div className="p-5 border border-line rounded-xl">
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
      )}

      {/* Appearance Tab */}
      {activeTab === 'appearance' && (
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
      )}

      {/* Licensing Tab — status display (M5.2) + activation form (M5.1) */}
      {activeTab === 'licensing' && (
        <div className="space-y-6">
          <LicenseSettings />
          {/* Activation Form — show when no active license, expired, or just activated */}
          {!licenseStatus.loading && (!licenseStatus.status?.hasLicense || licenseStatus.status?.isExpired || licenseActivation.result != null) && (
            <ActivationPage
              activateLabel={t('license.activate', 'تفعيل')}
              activatingLabel={t('license.activating', 'جارٍ التفعيل...')}
              description={t('license.description', 'أدخل مفتاح الترخيص لتفعيل النسخة الكاملة من توارتي.')}
              errorMessage={licenseActivation.error}
              keyLabel={t('license.keyLabel', 'مفتاح الترخيص')}
              keyPlaceholder={t('license.keyPlaceholder', 'أدخل مفتاح الترخيص')}
              successMessage={licenseActivation.result?.message ?? null}
              title={t('license.title', 'تفعيل الترخيص')}
              onActivate={async (key) => {
                await licenseActivation.activateLicense(key)
                await licenseStatus.refresh()
                await queryClient.invalidateQueries({ queryKey: licenseQueryKey })
              }}
            />
          )}
        </div>
      )}

      {/* System Tab */}
      {activeTab === 'system' && (
        <div className="space-y-4">
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
          <div className="p-5 border border-line rounded-xl">
            <div className="text-start">
              <h3 className="text-lg font-semibold text-foreground">{t('settings.database.export', 'تصدير قاعدة البيانات')}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('settings.database.exportDescription', 'تصدير جميع البيانات إلى ملف')}</p>
              <Button type="button" variant="outline" className="mt-4">
                {t('settings.database.exportButton', 'تصدير')}
              </Button>
            </div>
          </div>
          <div className="p-5 border border-line rounded-xl">
            <div className="text-start">
              <h3 className="text-lg font-semibold text-foreground">{t('settings.database.import', 'استيراد قاعدة البيانات')}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('settings.database.importDescription', 'استيراد البيانات من ملف محفوظ')}</p>
              <Button type="button" variant="outline" className="mt-4">
                {t('settings.database.importButton', 'استيراد')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* About Tab */}
      {activeTab === 'about' && (
        <div className="space-y-4">
          <div className="p-5 border border-line rounded-xl">
            <div className="text-start">
              <SurfaceHeader
                description={settingsAboutVersion}
                title={settingsAboutTitle}
              />
              <p className="text-sm font-mono text-foreground mt-2">
                {appVersion ?? "-"}
              </p>
            </div>
          </div>

          {/* Online update check and download */}
          <div className="p-5 border border-line rounded-xl">
            <div className="text-start">
              <UpdateSection />
            </div>
          </div>

          {isDesktopRuntime() ? (
            <div className="p-5 border border-line rounded-xl">
              <div className="text-start" dir="rtl">
                <h3 className="text-lg font-semibold text-foreground">
                  {settingsAboutInstallFromFile}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {settingsAboutInstallFromFileDescription}
                </p>

                {updateState.status === "verifying" && (
                  <div className="mt-4 flex items-center gap-2 text-muted-foreground">
                    <svg
                      className="h-4 w-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span className="text-sm">{settingsUpdateVerifying}</span>
                  </div>
                )}

                {updateState.status === "success" && (
                  <div className="mt-4 rounded-md bg-green-50 dark:bg-green-950 p-3 text-sm text-green-800 dark:text-green-200">
                    {updateState.message || settingsUpdateSuccess}
                  </div>
                )}

                {updateState.status === "error" && (
                  <div className="mt-4 rounded-md bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
                    {updateState.message || settingsUpdateError}
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  disabled={updateState.status === "verifying"}
                  onClick={() => void handleInstallFromFile()}
                >
                  {settingsAboutInstallFromFile}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-5 border border-line rounded-xl">
              <div className="text-start" dir="rtl">
                <p className="text-sm text-muted-foreground">
                  {t('settings.about.onlyAvailableInDesktop', 'هذه الميزة متاحة فقط في تطبيق سطح المكتب.')}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </RecordPageFrame>
  )
}
