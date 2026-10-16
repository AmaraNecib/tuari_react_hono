// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dayIn, pinUtcTimeZone } from "@/test-utils/algeria-day"
import { ar } from "@/i18n/resources/ar"

// The update-check stamp renders only on the desktop "system" tab, so the
// runtime and the update hook are mocked; the settings tabs live behind `?tab=`.
// `t` resolves against the real Arabic resource, so a key missing from the
// resource fails this suite instead of silently rendering the raw key
// (wisdom: testing.md).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
      let node: unknown = ar.translation
      for (const part of key.split(".")) {
        if (node === null || typeof node !== "object" || !(part in node)) {
          node = undefined
          break
        }
        node = (node as Record<string, unknown>)[part]
      }
      let result = typeof node === "string" ? node : (fallback ?? key)
      if (options) {
        for (const [k, v] of Object.entries(options)) {
          result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v))
        }
      }
      return result
    },
  }),
}))

vi.mock("./use-update-check", () => ({
  useUpdateCheck: () => ({
    state: { status: "up-to-date", checkedAt: "2026-09-30T23:00:00.000Z" },
    checkUpdate: vi.fn(),
  }),
}))

vi.mock("@/lib/desktop-auth-session", () => ({ isDesktopRuntime: () => true }))
vi.mock("./backup-settings", () => ({ BackupSettings: () => <div /> }))
vi.mock("./recovery-key-settings", () => ({ RecoveryKeySettings: () => <div /> }))
vi.mock("./update-commands", () => ({
  getCurrentVersion: vi.fn(async () => "0.0.0"),
  pickUpdateFile: vi.fn(async () => null),
  applyUpdate: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/features/update/update-section", () => ({ UpdateSection: () => <div /> }))
vi.mock("@/features/license/license-settings", () => ({ LicenseSettings: () => <div /> }))
vi.mock("@/features/license/activation-page", () => ({ ActivationPage: () => <div /> }))
vi.mock("@/features/license/license-hooks", () => ({ licenseQueryKey: ["license"] }))
vi.mock("@/features/license/use-license-activation", () => ({
  useLicenseActivation: () => ({ reset: vi.fn(), activateLicense: vi.fn(), result: null }),
}))
vi.mock("@/features/license/use-license-status", () => ({
  useLicenseStatus: () => ({ refresh: vi.fn() }),
}))

import { SettingsSection } from "./settings-section"

const LAST_CHECKED_LABEL = ar.translation.shell.settingsLastChecked

const PROPS = {
  accountCurrentPasswordLabel: "كلمة المرور الحالية",
  accountCurrentPasswordPlaceholder: "كلمة المرور الحالية",
  accountDescription: "وصف الحساب",
  accountNameLabel: "الاسم",
  accountNamePlaceholder: "الاسم",
  accountNewPasswordLabel: "كلمة المرور الجديدة",
  accountNewPasswordPlaceholder: "كلمة المرور الجديدة",
  accountPhoneLabel: "الهاتف",
  accountPhoneHint: "تلميح",
  accountPhonePlaceholder: "الهاتف",
  accountSaveLabel: "حفظ",
  accountSavingLabel: "جارٍ الحفظ",
  accountTitle: "الحساب",
  currentName: "مدير",
  currentPhone: "0555000000",
  isResetPending: false,
  isSavingAccount: false,
  resetDescription: "وصف",
  resetLabel: "تصفير",
  themeDescription: "وصف",
  themeLabel: "المظهر",
  themeValueLabel: "فاتح",
  title: "الإعدادات",
  passwordHideLabel: "إخفاء",
  passwordShowLabel: "إظهار",
  settingsCheckForUpdates: "التحقق من التحديثات",
  settingsChecking: "جارٍ التحقق",
  settingsUpToDate: "أحدث إصدار",
  settingsUpdateAvailable: "يتوفر تحديث",
  settingsUpdateError: "خطأ",
  settingsApplyError: "خطأ",
  settingsLastChecked: LAST_CHECKED_LABEL,
  settingsUpdateCached: "نسخة مخزنة",
  settingsAboutTitle: "حول",
  settingsAboutVersion: "الإصدار",
  settingsAboutInstallFromFile: "تثبيت من ملف",
  settingsAboutInstallFromFileDescription: "وصف",
  settingsUpdateVerifying: "جارٍ التحقق",
  settingsUpdateSuccess: "تم",
  settingsAboutTab: "حول",
  onSaveAccount: vi.fn(),
  onReset: vi.fn(),
  onToggleTheme: vi.fn(),
}

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsSection {...PROPS} />
    </QueryClientProvider>,
  )
}

describe("SettingsSection stored instant timezone (#473)", () => {
  let restoreTimeZone: () => void

  beforeEach(() => {
    window.history.replaceState({}, "", "/?tab=system")
    restoreTimeZone = pinUtcTimeZone()
  })

  afterEach(() => {
    cleanup()
    restoreTimeZone()
  })

  it("runs under UTC so the assertions are not vacuous", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC")
  })

  it("renders the update-check timestamp in Africa/Algiers, not the ambient UTC zone", () => {
    const algeriaStamp = dayIn("Africa/Algiers", { dateStyle: "medium", timeStyle: "short" })
    const utcStamp = dayIn("UTC", { dateStyle: "medium", timeStyle: "short" })

    renderSettings()

    expect(screen.getByText(`${LAST_CHECKED_LABEL}: ${algeriaStamp}`)).toBeTruthy()
    expect(screen.queryByText(`${LAST_CHECKED_LABEL}: ${utcStamp}`)).toBeNull()
  })
})
