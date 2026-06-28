/**
 * Hook for querying runtime status.
 */
import { useQuery, type Query } from "@tanstack/react-query";
import { getRuntimeStatus, type RuntimeStatus } from "@/lib/runtime-bridge";

function getRuntimeStatusRefetchInterval(query: Query<RuntimeStatus, Error, RuntimeStatus, ["runtime-status"]>) {
  return query.state.data?.environment === "browser" ? false : 60_000;
}

/**
 * useRuntimeStatusQuery() component.
 */
export function useRuntimeStatusQuery() {
  return useQuery<RuntimeStatus, Error, RuntimeStatus, ["runtime-status"]>({
    queryKey: ["runtime-status"],
    queryFn: () => getRuntimeStatus(),
    refetchInterval: getRuntimeStatusRefetchInterval,
    refetchIntervalInBackground: false,
  });
}
