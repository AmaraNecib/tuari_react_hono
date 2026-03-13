import { useQuery } from "@tanstack/react-query"
import { orpc } from "@/lib/orpc-client"

export function useSessionQuery() {
  return useQuery(orpc.session.queryOptions())
}
