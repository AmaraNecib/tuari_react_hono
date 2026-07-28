import { createORPCClient, onError } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import type { AppClient } from "@tuari/contracts"

import { desktopApiFetch } from "@/lib/desktop-api-bridge"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { resolveApiUrl } from "@/lib/runtime-config"

export function createRpcHeaders() {
  return {}
}

export function resolveRpcCredentials(): RequestCredentials {
  return isDesktopRuntime() ? "omit" : "include"
}

export const rpcLink = new RPCLink({
  url: () => resolveApiUrl("rpc"),
  headers: () => createRpcHeaders(),
  fetch: (request, init) =>
    isDesktopRuntime()
      ? desktopApiFetch(request, {
        ...init,
        authenticated: true,
      })
      : globalThis.fetch(request, {
        ...init,
        credentials: resolveRpcCredentials(),
    }),
  interceptors: [
    onError((error) => {
      if (import.meta.env.MODE === "test") return
      console.error("[web oRPC]", error)
    }),
  ],
})

export const rpcClient: AppClient = createORPCClient(rpcLink)
/** Configured oRPC client for API calls. */
export const orpc = createTanstackQueryUtils(rpcClient)
