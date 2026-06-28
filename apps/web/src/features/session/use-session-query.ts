/**
 * Hook for querying user session data.
 */
import { useQuery } from "@tanstack/react-query"

import { getStartupQueryRetryDelay, shouldRetryStartupQuery } from "@/lib/startup-query-retry"
import { orpc } from "@/lib/orpc-client"

/**
 * useSessionQuery() component.
 */
export function useSessionQuery() {
  return useQuery({
    ...orpc.session.queryOptions(),
    retry: shouldRetryStartupQuery,
    retryDelay: getStartupQueryRetryDelay,
  })
}
