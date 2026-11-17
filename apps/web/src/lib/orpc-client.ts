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

export function createWorkspaceRpcLink(path: string) {
  const mount = path.replace(/^\//, "")
  if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(mount)) throw new TypeError("RPC mount must be a relative workspace path")
  return new RPCLink({
    url: () => resolveApiUrl(mount),
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
}

export const rpcLink = createWorkspaceRpcLink("rpc")
export const rpcClient: AppClient = createORPCClient(rpcLink)
/** Configured oRPC client for API calls. */
export const orpc = createTanstackQueryUtils(rpcClient)
