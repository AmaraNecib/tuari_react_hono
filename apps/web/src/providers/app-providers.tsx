import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppPreferencesProvider } from "@/features/preferences/preferences";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppPreferencesProvider>{children}</AppPreferencesProvider>
    </QueryClientProvider>
  );
}
