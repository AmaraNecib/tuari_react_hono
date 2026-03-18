import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { SectionHeader } from "./section-header"

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
  accountTitle: string
  currentName: string
  currentPhone: string
  description: string
  isSavingAccount: boolean
  resetDescription: string
  resetLabel: string
  themeDescription: string
  themeLabel: string
  themeValueLabel: string
  title: string
  onSaveAccount: (input: {
    currentPassword?: string
    name?: string
    newPassword?: string
    phone?: string
  }) => void
  onReset: () => void
  onToggleTheme: () => void
}

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
  accountTitle,
  currentName,
  currentPhone,
  description,
  isSavingAccount,
  resetDescription,
  resetLabel,
  themeDescription,
  themeLabel,
  themeValueLabel,
  title,
  onSaveAccount,
  onReset,
  onToggleTheme,
}: SettingsSectionProps) {
  const [name, setName] = useState(currentName)
  const [phone, setPhone] = useState(currentPhone)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")

  useEffect(() => {
    setName(currentName)
    setPhone(currentPhone)
  }, [currentName, currentPhone])

  return (
    <div className="space-y-6">
      <SectionHeader description={description} title={title} />
      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-[28px] border border-border/50 bg-background/18 p-5 backdrop-blur-xl xl:col-span-2">
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-foreground">{accountTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{accountDescription}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{accountNameLabel}</span>
                <Input placeholder={accountNamePlaceholder} value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{accountPhoneLabel}</span>
                <Input dir="ltr" inputMode="tel" placeholder={accountPhonePlaceholder} value={phone} onChange={(event) => setPhone(event.target.value)} />
                <span className="text-xs leading-5 text-muted-foreground">{accountPhoneHint}</span>
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{accountCurrentPasswordLabel}</span>
                <Input placeholder={accountCurrentPasswordPlaceholder} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{accountNewPasswordLabel}</span>
                <Input placeholder={accountNewPasswordPlaceholder} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </label>
            </div>
            <div className="flex justify-end">
              <Button
                disabled={isSavingAccount}
                onClick={() => {
                  onSaveAccount({
                    currentPassword,
                    name: name.trim() !== currentName.trim() ? name : undefined,
                    newPassword,
                    phone: phone.trim() !== currentPhone.trim() ? phone : undefined,
                  })
                }}
              >
                {accountSaveLabel}
              </Button>
            </div>
          </div>
        </article>
        <article className="rounded-[28px] border border-border/50 bg-background/18 p-5 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">{themeLabel}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{themeDescription}</p>
            </div>
            <Button variant="outline" onClick={onToggleTheme}>
              {themeValueLabel}
            </Button>
          </div>
        </article>
        <article className="rounded-[28px] border border-border/50 bg-background/18 p-5 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">{resetLabel}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{resetDescription}</p>
            </div>
            <Button variant="outline" onClick={onReset}>
              {resetLabel}
            </Button>
          </div>
        </article>
      </div>
    </div>
  )
}
