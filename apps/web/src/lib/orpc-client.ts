import { createORPCClient, onError } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import type { AppClient } from "@tuari/contracts"

import { createDesktopAuthorizationHeader } from "@/lib/desktop-auth-session"
import { resolveApiBaseUrl, resolveAppClientKey } from "@/lib/runtime-config"

export function createRpcHeaders() {
  return {
    "x-tuari-client-key": resolveAppClientKey(),
    ...createDesktopAuthorizationHeader(),
  }
}

export const rpcLink = new RPCLink({
  url: () => new URL("/rpc", resolveApiBaseUrl()).toString(),
  headers: () => createRpcHeaders(),
  fetch: (request, init) =>
    globalThis.fetch(request, {
      ...init,
      credentials: "include",
    }),
  interceptors: [
    onError((error) => {
      console.error("[web oRPC]", error)
    }),
  ],
})

export const rpcClient: AppClient = createORPCClient(rpcLink)
export const orpc = createTanstackQueryUtils(rpcClient)
