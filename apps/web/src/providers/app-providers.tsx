import { QueryClientProvider } from "@tanstack/react-query"

import { Toaster } from "@/components/ui/sonner"
import { AppPreferencesProvider } from "@/features/preferences/preferences"
import { queryClient } from "@/lib/query-client"

function AppProvidersContent({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
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
