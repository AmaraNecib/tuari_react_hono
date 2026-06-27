/**
 * Application providers for context and state management.
 */
import { useEffect } from "react"

import { QueryClientProvider } from "@tanstack/react-query"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { KeyboardShortcutsProvider } from "@/components/ui/keyboard-shortcuts-provider"
import { AppPreferencesProvider, useAppPreferences } from "@/features/preferences/preferences"
import { i18n, resources } from "@/i18n"
import { queryClient } from "@/lib/query-client"

function AppProvidersContent({ children }: { children: React.ReactNode }) {
  const { locale } = useAppPreferences()

  useEffect(() => {
    void i18n.changeLanguage(locale in resources ? locale : "ar")
  }, [locale])

  return (
    <KeyboardShortcutsProvider>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </KeyboardShortcutsProvider>
  )
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppPreferencesProvider>
        <AppProvidersContent>{children}</AppProvidersContent>
      </AppPreferencesProvider>
    </QueryClientProvider>
  )
}
