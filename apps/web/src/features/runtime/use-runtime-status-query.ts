import { useQuery } from "@tanstack/react-query";

type RuntimeStatus = {
  checkedAt: string;
  environment: "desktop" | "browser";
  endpoint: string;
  health: "connected" | "preview";
};

async function getRuntimeStatus(): Promise<RuntimeStatus> {
  const isDesktop =
    typeof window !== "undefined" &&
    Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  return {
    checkedAt: new Date().toISOString(),
    environment: isDesktop ? "desktop" : "browser",
    endpoint: isDesktop ? "Tauri sidecar bridge" : "Browser preview shell",
    health: isDesktop ? "connected" : "preview",
  };
}

export function useRuntimeStatusQuery() {
  return useQuery({
    queryKey: ["runtime-status"],
    queryFn: getRuntimeStatus,
    refetchInterval: 30_000,
  });
}
