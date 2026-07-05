import { oc } from "@orpc/contract";

import { updateMetadataSchema } from "./update";

export const updateContract = {
  /** GET /api/updates/latest — latest version info for update checking. */
  updateMetadata: oc.output(updateMetadataSchema),
} as const;

export type UpdateContract = typeof updateContract;
