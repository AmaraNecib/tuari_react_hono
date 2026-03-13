import { createORPCClient, onError } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import type { AppClient } from "@tuari/contracts"

const DEFAULT_API_URL = "http://127.0.0.1:4318"
const DEFAULT_APP_CLIENT_KEY = "tuari-desktop-client-key-v1"

export function resolveApiBaseUrl() {
  return import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_URL
}

export function resolveAppClientKey() {
  return import.meta.env.VITE_APP_CLIENT_KEY?.trim() || DEFAULT_APP_CLIENT_KEY
}

export function createRpcHeaders() {
  return {
    "x-tuari-client-key": resolveAppClientKey(),
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
