export const STORAGE_KEYS = {
  theme: "tuari.theme",
  locale: "tuari.locale",
} as const;

export type AppTheme = "light" | "dark";
export type AppLocale = "en" | "ar";

export const DEFAULT_THEME: AppTheme = "light";
export const DEFAULT_LOCALE: AppLocale = "ar";

export function getNextTheme(theme: AppTheme): AppTheme {
  return theme === "light" ? "dark" : "light";
}

export function getNextLocale(locale: AppLocale): AppLocale {
  return locale === "en" ? "ar" : "en";
}

export function getLocaleDirection(locale: AppLocale) {
  return locale === "ar" ? "rtl" : "ltr";
}

function readStoredTheme(): AppTheme {
  const storedTheme = window.localStorage.getItem(STORAGE_KEYS.theme);
  return storedTheme === "dark" ? "dark" : DEFAULT_THEME;
}

function readStoredLocale(): AppLocale {
  const storedLocale = window.localStorage.getItem(STORAGE_KEYS.locale);
  return storedLocale === "ar" ? "ar" : DEFAULT_LOCALE;
}

export function applyTheme(theme: AppTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  window.localStorage.setItem(STORAGE_KEYS.theme, theme);
}

export function applyLocale(locale: AppLocale) {
  const root = document.documentElement;
  root.lang = locale;
  root.dir = getLocaleDirection(locale);
  root.dataset.locale = locale;
  window.localStorage.setItem(STORAGE_KEYS.locale, locale);
}

export function readAppliedTheme(): AppTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function readAppliedLocale(): AppLocale {
  return document.documentElement.lang === "ar" ? "ar" : "en";
}

export function bootstrapPreferences() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  applyTheme(readStoredTheme());
  applyLocale(readStoredLocale());
}
