import { createContext, startTransition, useContext, useEffect, useState } from "react"
import {
  applyLocale,
  applyTheme,
  getNextLocale,
  getNextTheme,
  readAppliedLocale,
  readAppliedTheme,
  type AppLocale,
  type AppTheme,
} from "./preference-constants"

type AppPreferencesContextValue = {
  locale: AppLocale
  theme: AppTheme
  toggleLocale: () => void
  toggleTheme: () => void
}

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null)

/**
 * @description Component
 */
export function AppPreferencesProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [theme, setTheme] = useState<AppTheme>(readAppliedTheme)
  const [locale, setLocale] = useState<AppLocale>(readAppliedLocale)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    applyLocale(locale)
  }, [locale])

  return (
    <AppPreferencesContext.Provider
      value={{
        locale,
        theme,
        toggleLocale: () => {
          startTransition(() => {
            setLocale((currentLocale) => getNextLocale(currentLocale))
          })
        },
        toggleTheme: () => {
          startTransition(() => {
            setTheme((currentTheme) => getNextTheme(currentTheme))
          })
        },
      }}
    >
      {children}
    </AppPreferencesContext.Provider>
  )
}

/** Returns current theme and locale preferences. */
export function useAppPreferences() {
  const context = useContext(AppPreferencesContext)

  if (!context) {
    throw new Error("useAppPreferences must be used within an AppPreferencesProvider")
  }

  return context
}
