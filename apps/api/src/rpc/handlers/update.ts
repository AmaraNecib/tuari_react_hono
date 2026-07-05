/**
 * Update metadata RPC handler.
 *
 * Serves the latest version info for update checking (M4.1).
 * The Business Authority returns metadata about the latest available update;
 * actual download and verification is handled by the Rust Updater Engine.
 */
import { implement } from "@orpc/server";

import type { UpdateService } from "../../modules/update/update.service";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

/**
 * Create update-related RPC handlers.
 *
 * @param os - ORPC implementation builder
 * @param m - RPC middleware
 * @param updateService - Update metadata service
 */
export function createUpdateHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  updateService: UpdateService,
): Record<string, any> {
  return {
    updateMetadata: os.updateMetadata.handler(
      m.queryAuth(async () => updateService.getLatestMetadata()),
    ),
  };
}
