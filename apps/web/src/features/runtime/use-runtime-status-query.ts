import { useQuery } from "@tanstack/react-query";
import { getRuntimeStatus, type RuntimeStatus } from "@/lib/runtime-bridge";

export function useRuntimeStatusQuery() {
  return useQuery<RuntimeStatus>({
    queryKey: ["runtime-status"],
    queryFn: () => getRuntimeStatus(),
    refetchInterval: 30_000,
  });
}
