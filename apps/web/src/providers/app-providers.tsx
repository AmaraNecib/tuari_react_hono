import { useEffect } from "react"

import { QueryClientProvider } from "@tanstack/react-query"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppPreferencesProvider, useAppPreferences } from "@/features/preferences/preferences"
import { i18n, resources } from "@/i18n"
import { queryClient } from "@/lib/query-client"

function AppProvidersContent({ children }: { children: React.ReactNode }) {
  const { locale } = useAppPreferences()

  useEffect(() => {
    const nextLanguage = locale in resources ? locale : "ar"
    void i18n.changeLanguage(nextLanguage)
  }, [locale])

  return (
    <TooltipProvider>
      {children}
      <Toaster />
    </TooltipProvider>
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
