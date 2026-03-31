import { createORPCClient, onError } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import type { AppClient } from "@tuari/contracts"

import { createDesktopAuthorizationHeader, isDesktopRuntime } from "@/lib/desktop-auth-session"
import { resolveApiUrl } from "@/lib/runtime-config"

export function createRpcHeaders() {
  return {
    ...createDesktopAuthorizationHeader(),
  }
}

export function resolveRpcCredentials(): RequestCredentials {
  return isDesktopRuntime() ? "omit" : "include"
}

export const rpcLink = new RPCLink({
  url: () => resolveApiUrl("rpc"),
  headers: () => createRpcHeaders(),
  fetch: (request, init) =>
    globalThis.fetch(request, {
      ...init,
      credentials: resolveRpcCredentials(),
    }),
  interceptors: [
    onError((error) => {
      console.error("[web oRPC]", error)
    }),
  ],
})

export const rpcClient: AppClient = createORPCClient(rpcLink)
export const orpc = createTanstackQueryUtils(rpcClient)
