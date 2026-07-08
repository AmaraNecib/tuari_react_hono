/**
 * Update metadata RPC handler.
 *
 * Serves the latest version info for update checking (M4.1) and
 * manages update history records (M4.3).
 */
import { implement } from "@orpc/server";

import type { RecordUpdateInput } from "@tuari/contracts";

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
  updateHistoryService: UpdateHistoryService,
): Record<string, any> {
  return {
    // M4.1 — Update metadata
    updateMetadata: os.updateMetadata.handler(
      m.queryAuth(async () => updateService.getLatestMetadata()),
    ),

    // M4.3 — Update history list
    updateHistoryList: os.updateHistoryList.handler(
      m.queryAuth(async () => ({
        items: updateHistoryService.getHistory(),
        latest: updateHistoryService.getLatestUpdate(),
      })),
    ),

    // M4.3 — Record an update attempt (called by the updater engine)
    recordUpdate: os.recordUpdate.handler(
      m.mutationAudit(
        ({ input }: { input: RecordUpdateInput }) => {
          const record = updateHistoryService.recordUpdate(input);
          return { record };
        },
        (error: unknown) => {
          console.error("[recordUpdate] failed to record update:", error);
          return {
            success: false as const,
            error: {
              code: "BUSINESS_RULE" as const,
              message: "فشل تسجيل التحديث. يرجى المحاولة مرة أخرى.",
              fieldErrors: [],
            },
          };
        },
      ),
    ),
  };
}
