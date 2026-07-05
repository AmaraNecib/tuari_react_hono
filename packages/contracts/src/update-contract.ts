import { oc } from "@orpc/contract";

import {
  updateMetadataSchema,
  updateHistoryListSchema,
  recordUpdateInputSchema,
  recordUpdateResultSchema,
} from "./update";

export const updateContract = {
  /** GET /api/updates/latest — latest version info for update checking. */
  updateMetadata: oc.output(updateMetadataSchema),

  // ─── M4.3 — Update history ───────────────────────────────────

  /** List all applied updates, most recent first. */
  updateHistoryList: oc.output(updateHistoryListSchema),

  /** Record a new update attempt (called by the updater engine after apply). */
  recordUpdate: oc
    .input(recordUpdateInputSchema)
    .output(recordUpdateResultSchema),
} as const;

export type UpdateContract = typeof updateContract;
