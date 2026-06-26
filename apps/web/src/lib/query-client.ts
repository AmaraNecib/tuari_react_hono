import { QueryClient } from "@tanstack/react-query"

/** Creates the React Query client with default settings for the app. */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
      },
    },
  })
}

export const queryClient = createAppQueryClient()
