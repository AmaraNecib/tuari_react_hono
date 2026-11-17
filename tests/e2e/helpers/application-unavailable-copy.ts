import { i18n, resources } from "../../../apps/web/src/i18n"

type SupportedLocale = keyof typeof resources

function activeApplicationLocale(): SupportedLocale {
  const activeLocale = i18n.resolvedLanguage ?? i18n.language
  const supportedLocale = Object.keys(resources).find(locale => activeLocale === locale || activeLocale.startsWith(`${locale}-`))
  if (!supportedLocale) throw new Error(`No configured application translation resource for locale "${activeLocale}"`)
  return supportedLocale as SupportedLocale
}

export function getApplicationUnavailableCopy(locale = activeApplicationLocale()): string {
  const copy = i18n.getFixedT(locale)("application.unavailable")
  if (typeof copy !== "string" || copy.trim().length === 0 || copy === "application.unavailable") {
    throw new Error(`Missing human-readable application.unavailable translation for locale "${locale}"`)
  }
  return copy
}

export function getSupportedApplicationLocales(): SupportedLocale[] {
  return Object.keys(resources) as SupportedLocale[]
}
