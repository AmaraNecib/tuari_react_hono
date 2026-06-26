export const STORAGE_KEYS = {
  theme: "tuari.theme",
  locale: "tuari.locale",
} as const

export type AppTheme = "light" | "dark"
export type AppLocale = "ar"

export const DEFAULT_THEME: AppTheme = "light"
export const DEFAULT_LOCALE: AppLocale = "ar"

export function getNextTheme(theme: AppTheme): AppTheme {
  return theme === "light" ? "dark" : "light"
}

export function getNextLocale(locale: AppLocale): AppLocale {
  return locale
}

/** Returns the text direction for a given locale. Arabic = RTL, others = LTR. */
export function getLocaleDirection(locale?: AppLocale) {
  return locale === "ar" ? "rtl" : "ltr"
}

function readStoredTheme(): AppTheme {
  const storedTheme = window.localStorage.getItem(STORAGE_KEYS.theme)
  return storedTheme === "dark" ? "dark" : DEFAULT_THEME
}

function readStoredLocale(): AppLocale {
  const storedLocale = window.localStorage.getItem(STORAGE_KEYS.locale)
  return storedLocale === "ar" ? "ar" : DEFAULT_LOCALE
}

/** Applies the theme to the document root and persists to localStorage. */
export function applyTheme(theme: AppTheme) {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.dataset.theme = theme
  window.localStorage.setItem(STORAGE_KEYS.theme, theme)
}

/** Applies the locale to the document root (lang, dir, data-locale) and persists. */
export function applyLocale(locale: AppLocale) {
  const root = document.documentElement
  root.lang = locale
  root.dir = getLocaleDirection(locale)
  root.dataset.locale = locale
  window.localStorage.setItem(STORAGE_KEYS.locale, locale)
}

export function readAppliedTheme(): AppTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

export function readAppliedLocale(): AppLocale {
  return "ar"
}

/** Applies stored theme and locale on app startup. */
export function bootstrapPreferences() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return
  }

  applyTheme(readStoredTheme())
  applyLocale(readStoredLocale())
}
