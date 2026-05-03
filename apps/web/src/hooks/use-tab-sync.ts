import { useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const TAB_SYNC_KEY = "tuari-tab-sync";
const LOGOUT_EVENT = "logout";
const CACHE_INVALIDATE_EVENT = "cache-invalidate";
const MUTATION_EVENT = "mutation";

export interface TabSyncMessage {
  type: "logout" | "cache-invalidate" | "mutation";
  timestamp: number;
  payload?: any;
}

export function useTabSync() {
  const queryClient = useQueryClient();
  const isInitializedRef = useRef(false);

  const broadcastLogout = useCallback(() => {
    const message: TabSyncMessage = {
      type: LOGOUT_EVENT,
      timestamp: Date.now(),
    };
    localStorage.setItem(TAB_SYNC_KEY, JSON.stringify(message));
  }, []);

  const broadcastCacheInvalidate = useCallback((queryKey: string) => {
    const message: TabSyncMessage = {
      type: CACHE_INVALIDATE_EVENT,
      timestamp: Date.now(),
      payload: { queryKey },
    };
    localStorage.setItem(TAB_SYNC_KEY, JSON.stringify(message));
  }, []);

  const broadcastMutation = useCallback((domain: string, action: string, resourceId: string) => {
    const message: TabSyncMessage = {
      type: MUTATION_EVENT,
      timestamp: Date.now(),
      payload: { domain, action, resourceId },
    };
    localStorage.setItem(TAB_SYNC_KEY, JSON.stringify(message));
  }, []);

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== TAB_SYNC_KEY || !event.newValue) return;

      try {
        const message: TabSyncMessage = JSON.parse(event.newValue);

        // Ignore messages from this tab (check timestamp + small delay)
        if (Date.now() - message.timestamp < 100) {
          return;
        }

        switch (message.type) {
          case LOGOUT_EVENT:
            // Trigger logout logic
            console.log("[Tab Sync] Logout detected in another tab");
            // Call logout handler - this would be implemented in your auth context
            window.dispatchEvent(new CustomEvent("tab-logout"));
            break;

          case CACHE_INVALIDATE_EVENT:
            if (message.payload?.queryKey) {
              queryClient.invalidateQueries({
                queryKey: [message.payload.queryKey],
              });
            }
            break;

          case MUTATION_EVENT:
            // Broadcast mutation event for other tabs to react
            window.dispatchEvent(
              new CustomEvent("tab-mutation", {
                detail: message.payload,
              })
            );
            break;
        }
      } catch (error) {
        console.error("[Tab Sync] Error parsing message:", error);
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [queryClient]);

  return {
    broadcastLogout,
    broadcastCacheInvalidate,
    broadcastMutation,
  };
}

export function useTabSyncListener(
  eventType: "logout" | "mutation",
  callback: (payload?: any) => void
) {
  useEffect(() => {
    const eventName = eventType === "logout" ? "tab-logout" : "tab-mutation";

    const handleEvent = (event: CustomEvent) => {
      callback((event as any).detail);
    };

    window.addEventListener(eventName, handleEvent as EventListener);

    return () => {
      window.removeEventListener(eventName, handleEvent as EventListener);
    };
  }, [eventType, callback]);
}
