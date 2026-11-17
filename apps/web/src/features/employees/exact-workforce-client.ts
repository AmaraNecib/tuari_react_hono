import { createORPCClient } from "@orpc/client"
import type { ExactWorkforceEarningsClient } from "@tuari/contracts"
import { createWorkspaceRpcLink } from "@/lib/orpc-client"

/** Root integration supplies the agreed mount in the configured authenticated workspace. No alternate server or default prefix. */
export function createExactWorkforceClient(mount: string): ExactWorkforceEarningsClient {
  return createORPCClient(createWorkspaceRpcLink(mount))
}
