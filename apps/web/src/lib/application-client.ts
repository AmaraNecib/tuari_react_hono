import { createORPCClient } from "@orpc/client"
import type { ApplicationClient } from "@tuari/contracts"
import { createWorkspaceRpcLink } from "./orpc-client"

/** The normal app contract on the configured authenticated RPC transport. */
export const applicationClient: ApplicationClient = createORPCClient(createWorkspaceRpcLink("rpc"))
