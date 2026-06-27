/**
 * Hook for synchronizing state across browser tabs.
 */
import { useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const TAB_SYNC_KEY = "tuari-tab-sync";
const TAB_ID_KEY = "tuari-tab-id";
const LOGOUT_EVENT = "logout";
const CACHE_INVALIDATE_EVENT = "cache-invalidate";
const MUTATION_EVENT = "mutation";

// Generate or retrieve unique tab ID
function getTabId(): string {
  let tabId = typeof window !== "undefined" ? sessionStorage.getItem(TAB_ID_KEY) : null;
  if (!tabId) {
    tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    if (typeof window !== "undefined") {
      sessionStorage.setItem(TAB_ID_KEY, tabId);
    }
  }
  return tabId;
}

export interface TabSyncLogoutMessage {
  type: "logout";
  timestamp: number;
  tabId: string;
}

export interface TabSyncCacheInvalidateMessage {
  type: "cache-invalidate";
  timestamp: number;
  tabId: string;
  payload: { queryKey: string };
}

export interface TabSyncMutationMessage {
  type: "mutation";
  timestamp: number;
  tabId: string;
  payload: { domain: string; action: string; resourceId: string };
}

export type TabSyncMessage =
  | TabSyncLogoutMessage
  | TabSyncCacheInvalidateMessage
  | TabSyncMutationMessage;

export function useTabSync() {
  const queryClient = useQueryClient();
  const isInitializedRef = useRef(false);
  const tabId = useRef(getTabId()).current;

  const broadcastLogout = useCallback(() => {
    const message: TabSyncMessage = {
      type: LOGOUT_EVENT,
      timestamp: Date.now(),
      tabId,
    };
    localStorage.setItem(TAB_SYNC_KEY, JSON.stringify(message));
  }, [tabId]);

  const broadcastCacheInvalidate = useCallback((queryKey: string) => {
    const message: TabSyncMessage = {
      type: CACHE_INVALIDATE_EVENT,
      timestamp: Date.now(),
      tabId,
      payload: { queryKey },
    };
    localStorage.setItem(TAB_SYNC_KEY, JSON.stringify(message));
  }, [tabId]);

  const broadcastMutation = useCallback((domain: string, action: string, resourceId: string) => {
    const message: TabSyncMessage = {
      type: MUTATION_EVENT,
      timestamp: Date.now(),
      tabId,
      payload: { domain, action, resourceId },
    };
    localStorage.setItem(TAB_SYNC_KEY, JSON.stringify(message));
  }, [tabId]);

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== TAB_SYNC_KEY || !event.newValue) return;

      try {
        const message: TabSyncMessage = JSON.parse(event.newValue);

        // Ignore messages from this tab (storage event doesn't fire in sender tab, but check tabId for safety)
        if (message.tabId === tabId) {
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
    // tabId is a stable ref value (set once on first render), so it does not
    // need to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  return {
    broadcastLogout,
    broadcastCacheInvalidate,
    broadcastMutation,
  };
}

export function useTabSyncListener(
  eventType: "logout" | "mutation",
  callback: (payload?: TabSyncMutationMessage["payload"]) => void
) {
  useEffect(() => {
    const eventName = eventType === "logout" ? "tab-logout" : "tab-mutation";

    const handleEvent = (event: Event) => {
      const customEvent = event as CustomEvent<TabSyncMutationMessage["payload"]>;
      callback(customEvent.detail);
    };

    window.addEventListener(eventName, handleEvent as EventListener);

    return () => {
      window.removeEventListener(eventName, handleEvent as EventListener);
    };
  }, [eventType, callback]);
}
