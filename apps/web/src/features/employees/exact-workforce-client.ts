import { createORPCClient } from "@orpc/client"
import type { ExactWorkforceClient } from "@tuari/contracts"
import { createWorkspaceRpcLink } from "@/lib/orpc-client"

/** Root integration supplies the agreed mount in the configured authenticated workspace. No alternate server or default prefix. */
export function createExactWorkforceClient(mount: string): ExactWorkforceClient {
  return createORPCClient(createWorkspaceRpcLink(mount))
}
