import { createORPCClient } from "@orpc/client"
import type { Slice543Client } from "@tuari/contracts"
import { createWorkspaceRpcLink } from "./orpc-client"

/** The normal app contract on the configured authenticated RPC transport. */
export const slice543Client: Slice543Client = createORPCClient(createWorkspaceRpcLink("rpc"))
