/**
 * Update metadata RPC handler.
 *
 * Serves the latest version info for update checking (M4.1) and
 * manages update history records (M4.3).
 */
import { implement } from "@orpc/server";

import type { UpdateHistoryService } from "../../modules/update/update-history.service";
import type { UpdateService } from "../../modules/update/update.service";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

/**
 * Create update-related RPC handlers.
 *
 * @param os - ORPC implementation builder
 * @param m - RPC middleware
 * @param updateService - Update metadata service
 * @param updateHistoryService - Update history service
 */
export function createUpdateHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  updateService: UpdateService,
  updateHistoryService?: UpdateHistoryService,
): Record<string, any> {
  const handlers: Record<string, any> = {
    // M4.1 — Update metadata
    updateMetadata: os.updateMetadata.handler(
      m.queryAuth(async () => updateService.getLatestMetadata()),
    ),
  };

  // M4.3 — Update history (if the service is available)
  if (updateHistoryService) {
    handlers.updateHistoryList = os.updateHistoryList.handler(
      m.queryAuth(async () => ({
        items: updateHistoryService.getHistory(),
        latest: updateHistoryService.getLatestUpdate(),
      })),
    );

    handlers.recordUpdate = os.recordUpdate.handler(
      m.mutationAudit(
        ({ input }: any) => {
          const record = updateHistoryService.recordUpdate(input as any);
          return { record };
        },
        (error: unknown) => ({ success: false as const, error: String(error) }),
      ),
    );
  }

  return handlers;
}
